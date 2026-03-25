import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, ComponentType, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ActivityLogIcon,
  AvatarIcon,
  BackpackIcon,
  BarChartIcon,
  CalendarIcon,
  DashboardIcon,
  ExitIcon,
  GearIcon,
  ReloadIcon,
  RocketIcon,
} from '@radix-ui/react-icons';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
import { SetupPage } from './components/SetupPage';
import { StatsOverview } from './components/StatsOverview';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { ActivityList } from './components/ActivityList';
import { ThemeToggle } from './components/ThemeToggle';
import type { Activity, Gear } from './types';
import { isRun } from './types';
import { gear as gearApi } from './services/api';
import { parseActivityLocalDate } from './utils/activityDate';

const FitnessChart = lazy(() =>
  import('./components/FitnessChart').then((module) => ({ default: module.FitnessChart }))
);
const MileageTrendChart = lazy(() =>
  import('./components/MileageTrendChart').then((module) => ({ default: module.MileageTrendChart }))
);
const RunDetails = lazy(() =>
  import('./components/RunDetails').then((module) => ({ default: module.RunDetails }))
);
const ShoeTracker = lazy(() =>
  import('./components/ShoeTracker').then((module) => ({ default: module.ShoeTracker }))
);
const RaceTimePredictions = lazy(() =>
  import('./components/RaceTimePredictions').then((module) => ({ default: module.RaceTimePredictions }))
);
const VDOTPanel = lazy(() =>
  import('./components/VDOTPanel').then((module) => ({ default: module.VDOTPanel }))
);
const WeeklyRampChart = lazy(() =>
  import('./components/WeeklyRampChart').then((module) => ({ default: module.WeeklyRampChart }))
);
const CadenceTrendChart = lazy(() =>
  import('./components/CadenceTrendChart').then((module) => ({ default: module.CadenceTrendChart }))
);

interface ViewPeriod {
  mode: 'all' | 'year' | 'month';
  year: number;
  month: number | null;
}

type DashboardWorkspace = 'overview' | 'training' | 'race' | 'logbook' | 'tools';
type TrainingWorkspace = 'fitness' | 'volume' | 'mechanics';
type RaceWorkspace = 'predictions' | 'vdot';
type IconType = ComponentType<{ className?: string }>;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const GEAR_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const GEAR_FAILURE_RETRY_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_GEAR_FETCH_PER_SESSION = 10;
const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);

interface GearCachePayload {
  updatedAt: number;
  gear: Record<string, Gear>;
  failed: Record<string, number>;
}

function gearCacheKey(athleteId: number): string {
  return `runviz_gear_cache_v1_${athleteId}`;
}

function loadGearCache(athleteId: number): GearCachePayload | null {
  try {
    const raw = localStorage.getItem(gearCacheKey(athleteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GearCachePayload;
    if (!parsed.updatedAt || Date.now() - parsed.updatedAt > GEAR_CACHE_TTL_MS) {
      localStorage.removeItem(gearCacheKey(athleteId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveGearCache(athleteId: number, gearMap: Map<string, Gear>, failedMap: Map<string, number>) {
  try {
    const gear: Record<string, Gear> = {};
    gearMap.forEach((value, key) => {
      gear[key] = value;
    });

    const failed: Record<string, number> = {};
    failedMap.forEach((value, key) => {
      if (Date.now() - value < GEAR_FAILURE_RETRY_MS) {
        failed[key] = value;
      }
    });

    const payload: GearCachePayload = {
      updatedAt: Date.now(),
      gear,
      failed,
    };
    localStorage.setItem(gearCacheKey(athleteId), JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

function App() {
  const {
    isAuthenticated,
    athlete,
    user,
    needsStravaConnect,
    loading: authLoading,
    login,
    connectStrava,
    sendMagicLink,
    logout,
  } = useAuth();
  const { activities, syncing, sync, lastSync } = useActivities(isAuthenticated && !needsStravaConnect);
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
    mode: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [dashboardWorkspace, setDashboardWorkspace] = useState<DashboardWorkspace>('overview');
  const [trainingWorkspace, setTrainingWorkspace] = useState<TrainingWorkspace>('fitness');
  const [raceWorkspace, setRaceWorkspace] = useState<RaceWorkspace>('predictions');

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedShoeId, setSelectedShoeId] = useState<string | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSending, setMagicSending] = useState(false);
  const [magicStatus, setMagicStatus] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);

  // Store additionally fetched gear (e.g. retired shoes not in athlete profile)
  const [additionalGear, setAdditionalGear] = useState<Map<string, Gear>>(new Map());
  // Track request lifecycle so we do not repeatedly fetch failed/in-flight gear IDs.
  const inFlightGearIds = useRef<Set<string>>(new Set());
  const failedGearIds = useRef<Map<string, number>>(new Map());
  const gearFetchCount = useRef(0);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (!error) {
      return;
    }

    if (error === 'ATTEMPTS_EXCEEDED') {
      setMagicStatus('That magic link has already been used or has expired. Request a fresh one.');
      return;
    }

    if (error === 'magic_link_failed') {
      setMagicStatus('We could not verify that magic link. Request a fresh one and try again.');
      return;
    }

    if (error === 'auth_failed') {
      setMagicStatus('We could not complete sign-in. Please try again.');
    }
  }, [searchParams]);

  // Consolidated list of all known shoes
  const allShoes = useMemo(() => {
    const profileShoes = [...(athlete?.shoes || []), ...(athlete?.gear || [])];
    const extraShoes = Array.from(additionalGear.values());
    // Deduplicate by ID
    const knownIds = new Set(profileShoes.map(s => s.id));
    return [...profileShoes, ...extraShoes.filter(s => !knownIds.has(s.id))];
  }, [athlete?.shoes, athlete?.gear, additionalGear]);

  // Effect: Identify and fetch missing gear IDs
  useEffect(() => {
    if (activities.length === 0) return;
    if (!athlete?.id) return;

    const knownIds = new Set([
      ...(athlete?.shoes || []).map(s => s.id),
      ...(athlete?.gear || []).map(s => s.id),
      ...Array.from(additionalGear.keys())
    ]);

    const missingIds = new Set<string>();
    activities.forEach(a => {
      const failedAt = a.gear_id ? failedGearIds.current.get(a.gear_id) : undefined;
      const isFailureCoolingDown = failedAt ? Date.now() - failedAt < GEAR_FAILURE_RETRY_MS : false;
      if (
        a.gear_id &&
        !knownIds.has(a.gear_id) &&
        !isFailureCoolingDown &&
        !inFlightGearIds.current.has(a.gear_id)
      ) {
        // Only fetch if it looks like a gear ID
        if (a.gear_id.startsWith('g') || a.gear_id.startsWith('b')) {
          missingIds.add(a.gear_id);
        }
      }
    });

    if (missingIds.size > 0) {
      const remainingBudget = MAX_GEAR_FETCH_PER_SESSION - gearFetchCount.current;
      if (remainingBudget <= 0) return;

      const idsToFetch = Array.from(missingIds).slice(0, Math.min(5, remainingBudget)); // Fetch max 5 at a time
      if (idsToFetch.length === 0) return;

      gearFetchCount.current += idsToFetch.length;
      idsToFetch.forEach(id => inFlightGearIds.current.add(id));
      console.log('Fetching missing gear:', idsToFetch);
      // Fetch individually (Strava doesn't have a bulk endpoint for this)
      // Limit concurrency to avoid triggering rate limits too aggressively

      Promise.all(idsToFetch.map(id =>
        gearApi.get(id)
          .then(gear => ({ id, gear, success: true }))
          .catch(() => ({ id, gear: null, success: false }))
      )).then(results => {
        setAdditionalGear(prev => {
          const next = new Map(prev);
          results.forEach(r => {
            inFlightGearIds.current.delete(r.id);
            if (r.success && r.gear) {
              next.set(r.id, r.gear);
              failedGearIds.current.delete(r.id);
            } else {
              // Do not retry this ID continuously; it is likely retired/inaccessible/rate-limited.
              failedGearIds.current.set(r.id, Date.now());
            }
          });
          saveGearCache(athlete.id, next, failedGearIds.current);
          return next;
        });
      });
    }
  }, [activities, athlete?.id, athlete?.shoes, athlete?.gear, additionalGear]);

  // Reset gear fetch state when athlete changes (or logs out/in).
  useEffect(() => {
    inFlightGearIds.current.clear();
    failedGearIds.current.clear();
    gearFetchCount.current = 0;

    if (!athlete?.id) {
      setAdditionalGear(new Map());
      return;
    }

    const cached = loadGearCache(athlete.id);
    if (!cached) {
      setAdditionalGear(new Map());
      return;
    }

    setAdditionalGear(new Map(Object.entries(cached.gear)));
    failedGearIds.current = new Map(Object.entries(cached.failed).map(([id, ts]) => [id, Number(ts)]));
  }, [athlete?.id]);

  // Calculate available availableYears from activities
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    activities.forEach(a => {
      const year = parseActivityLocalDate(a.start_date_local).getFullYear();
      years.add(year);
    });
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  // Filter activities for the current view
  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (!isRun(a)) return false;
      const date = parseActivityLocalDate(a.start_date_local);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (viewPeriod.mode === 'all') return true;
      if (viewPeriod.mode === 'year') return year === viewPeriod.year;
      if (viewPeriod.mode === 'month') return year === viewPeriod.year && month === viewPeriod.month;
      return false;
    }).filter(a => {
      // Secondary filter: Shoe
      if (selectedShoeId) return a.gear_id === selectedShoeId;
      return true;
    });
  }, [activities, viewPeriod, selectedShoeId]);

  const handleSelectDay = useCallback((dateStr: string) => {
    const activity = activities.find(a => {
      if (!isRun(a)) return false;
      return a.start_date_local.startsWith(dateStr);
    });
    if (activity) {
      setSelectedActivity(activity);
    }
  }, [activities]);

  // Get selected shoe name for filter indicator
  const selectedShoeName = useMemo(() => {
    if (!selectedShoeId) return undefined;
    const shoe = allShoes.find(s => s.id === selectedShoeId);
    return shoe?.name;
  }, [selectedShoeId, allShoes]);

  const athleteLabel = athlete ? `${athlete.firstname} ${athlete.lastname}`.trim() : 'Athlete';
  const currentSummary = useMemo(() => {
    const totalDistanceKm = filteredActivities.reduce((sum, activity) => sum + activity.distance, 0) / 1000;
    const longestRunKm = filteredActivities.reduce((max, activity) => Math.max(max, activity.distance / 1000), 0);

    return {
      runCount: filteredActivities.length,
      totalDistanceKm,
      longestRunKm,
    };
  }, [filteredActivities]);

  const workspaceMeta: Record<DashboardWorkspace, { kicker: string; title: string; detail: string }> = {
    overview: {
      kicker: 'Overview',
      title: 'Current training snapshot',
      detail: 'One glance for recent health, race readiness, and the next thing worth paying attention to.',
    },
    training: {
      kicker: 'Training',
      title: 'Load and trend analysis',
      detail: 'Switch between fitness, volume, and mechanics without stacking every chart onto one page.',
    },
    race: {
      kicker: 'Race',
      title: 'Prediction and pacing',
      detail: 'Keep forecasting and training pace guidance together in one coaching-oriented view.',
    },
    logbook: {
      kicker: 'Logbook',
      title: 'Runs, shoes, and calendar',
      detail: 'Filter the training log, inspect recent runs, and jump through the calendar without leaving the list.',
    },
    tools: {
      kicker: 'Tools',
      title: 'Planning and form review',
      detail: 'Non-daily tools live here so the dashboard stays focused on training decisions.',
    },
  };
  const activeMeta = workspaceMeta[dashboardWorkspace];

  if (authLoading) {
    return (
      <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
        <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
          <BrandWordmark compact />
          <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
          <div>
            <p className="rv-kicker mb-2">System Sync</p>
            <p className="text-lg font-medium text-[var(--rv-text-dim)]">Loading RunViz performance lab...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="rv-grid-lines flex min-h-screen items-center justify-center px-4 py-10">
        <div className="rv-shell-card rv-glow-orb flex w-full max-w-5xl flex-col gap-8 overflow-hidden px-6 py-8 sm:px-10 lg:flex-row lg:items-end lg:px-12 lg:py-12">
          <div className="flex-1 space-y-5">
            <p className="rv-kicker rv-reveal-subtle" style={reveal(0)}>For Ambitious Runners</p>
            <BrandWordmark />
            <h1 className="rv-metric rv-reveal max-w-2xl text-5xl sm:text-6xl lg:text-7xl" style={reveal(80)}>
              Clear training insights for runners getting more serious.
            </h1>
            <p className="rv-body-copy rv-reveal-subtle max-w-xl sm:text-lg" style={reveal(160)}>
              Sign in with Google or magic link, then connect Strava to see your training load, plan routes, review running form, and keep your key metrics in one place.
            </p>
            <p className="rv-mini-label rv-reveal-subtle" style={reveal(220)}>
              Training load, route planning, and video-based form analysis.
            </p>
          </div>
          <div className="rv-panel rv-panel-accent rv-reveal rv-spotlight w-full max-w-md px-6 py-8 sm:px-8" style={reveal(140)}>
            <p className="rv-kicker mb-4">Sign In</p>
            <h2 className="rv-section-title mb-3">Open your RunViz workspace</h2>
            <p className="rv-body-copy-sm mb-6">
              Use Google or a magic link for your RunViz account, then connect Strava to bring in training data.
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setGoogleStatus(null);
                  try {
                    await login();
                  } catch (error) {
                    console.error('Google sign-in failed:', error);
                    setGoogleStatus('Google sign-in is unavailable right now. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the Worker and redeploy.');
                  }
                }}
                className="rv-button-primary flex w-full items-center justify-center gap-3 px-8 py-4 text-sm active:translate-y-0"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
                  <path d="M15.387 0L0 24h6.128l3.054-6.172h3.065L15.387 24l9.109-18.172h6.063L15.387 0z" opacity="0.6" />
                </svg>
                Continue with Google
              </button>
              {googleStatus && (
                <p className="rv-body-copy-sm">
                  {googleStatus}
                </p>
              )}
              <div className="rv-reveal-subtle rounded-3xl border border-white/8 bg-white/[0.04] p-4" style={reveal(240)}>
                <label htmlFor="magic-email" className="rv-mini-label mb-2 block">
                  Magic link
                </label>
                <div className="flex flex-col gap-3">
                  <input
                    id="magic-email"
                    name="email"
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="rv-field w-full px-4 py-3 text-sm"
                  />
                  <button
                    onClick={async () => {
                      if (!magicEmail.trim()) return;
                      setMagicSending(true);
                      setMagicStatus(null);
                      try {
                        await sendMagicLink(magicEmail.trim());
                        setMagicStatus('Check your email for a sign-in link.');
                      } catch (error) {
                        console.error('Magic link failed:', error);
                        setMagicStatus('Unable to send the magic link right now.');
                      } finally {
                        setMagicSending(false);
                      }
                    }}
                    disabled={magicSending}
                    className="rv-button-secondary rv-pill-label flex w-full items-center justify-center px-6 py-3 disabled:cursor-wait"
                  >
                    {magicSending ? 'Sending...' : 'Send magic link'}
                  </button>
                </div>
                {magicStatus && (
                  <p className="rv-body-copy-sm mt-3">
                    {magicStatus}
                  </p>
                )}
              </div>
            </div>
            <p className="rv-mini-label mt-6">Connect Strava during setup after sign-in.</p>
          </div>
        </div>
      </main>
    );
  }

  if (needsStravaConnect) {
    return (
      <SetupPage
        authLoading={authLoading}
        isAuthenticated={isAuthenticated}
        user={user}
        needsStravaConnect={needsStravaConnect}
        login={login}
        connectStrava={connectStrava}
        sendMagicLink={sendMagicLink}
        logout={logout}
      />
    );
  }

  return (
    <div className="min-h-screen text-[var(--rv-text)]">
      {selectedActivity && (
        <Suspense fallback={<ModalFallback />}>
          <RunDetails
            activity={selectedActivity}
            allActivities={activities}
            shoes={allShoes}
            onClose={() => setSelectedActivity(null)}
            onSelect={setSelectedActivity}
          />
        </Suspense>
      )}

      <div className="mx-auto max-w-[1720px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:flex lg:sticky lg:top-4 lg:min-h-[calc(100dvh-2rem)] lg:flex-col lg:justify-between lg:border-r lg:border-[var(--rv-border)] lg:pr-6">
            <div className="space-y-8">
              <div className="pt-2">
                <p className="text-[1.1rem] font-semibold tracking-[-0.06em] text-[var(--rv-text)]">
                  RUN<span className="text-[var(--rv-yellow)]">VIZ</span>
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Training Workspace</p>
              </div>

              <nav className="space-y-1.5">
                <SidebarNavButton
                  label="Overview"
                  detail="KPI view"
                  icon={DashboardIcon}
                  active={dashboardWorkspace === 'overview'}
                  onClick={() => setDashboardWorkspace('overview')}
                />
                <SidebarNavButton
                  label="Training"
                  detail="Load and trends"
                  icon={BarChartIcon}
                  active={dashboardWorkspace === 'training'}
                  onClick={() => setDashboardWorkspace('training')}
                />
                <SidebarNavButton
                  label="Race"
                  detail="Predictions and VDOT"
                  icon={RocketIcon}
                  active={dashboardWorkspace === 'race'}
                  onClick={() => setDashboardWorkspace('race')}
                />
                <SidebarNavButton
                  label="Logbook"
                  detail="Runs and shoes"
                  icon={ActivityLogIcon}
                  active={dashboardWorkspace === 'logbook'}
                  onClick={() => setDashboardWorkspace('logbook')}
                />
                <SidebarNavButton
                  label="Tools"
                  detail="Plan and review"
                  icon={GearIcon}
                  active={dashboardWorkspace === 'tools'}
                  onClick={() => setDashboardWorkspace('tools')}
                />
              </nav>
            </div>

            <div className="space-y-4 pb-2">
              <div className="flex items-center gap-3">
                {athlete?.profile ? (
                  <img src={athlete.profile} className="h-10 w-10 rounded-2xl object-cover" alt="Profile" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-text)_10%,transparent)] text-[var(--rv-text-faint)]">
                    <AvatarIcon className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--rv-text)]">{athleteLabel}</p>
                  <p className="text-xs text-[var(--rv-text-faint)]">{syncing ? 'Syncing now' : formatLastSync(lastSync)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--rv-text-dim)] transition hover:text-[var(--rv-text)] active:translate-y-px"
                >
                  <ExitIcon className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-5 lg:pl-6">
            <header className="sticky top-0 z-30 border-b border-[var(--rv-border)] bg-[color-mix(in_srgb,var(--rv-bg)_92%,transparent)] py-4 backdrop-blur-xl">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 lg:hidden">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-blue)_14%,transparent)] text-[var(--rv-blue)]">
                      <DashboardIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.04em] text-[var(--rv-text)]">RunViz</p>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Training Workspace</p>
                    </div>
                  </div>
                  <p className="mt-4 mb-2 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)] lg:mt-0">{activeMeta.kicker}</p>
                  <h1 className="text-[1.85rem] font-semibold tracking-[-0.05em] text-[var(--rv-text)] sm:text-[2.2rem]">
                    {activeMeta.title}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--rv-text-dim)]">
                    {activeMeta.detail}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:hidden">
                  <div className="flex items-center gap-2 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-3 py-2">
                    {athlete?.profile ? (
                      <img src={athlete.profile} className="h-6 w-6 rounded-full object-cover" alt="Profile" />
                    ) : (
                      <AvatarIcon className="h-4 w-4 text-[var(--rv-text-faint)]" />
                    )}
                    <span className="text-sm font-semibold text-[var(--rv-text-dim)]">{athlete?.firstname ?? 'Athlete'}</span>
                  </div>
                  <ThemeToggle />
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-3 py-2 text-sm font-semibold text-[var(--rv-text-dim)] transition hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)] active:translate-y-px"
                  >
                    <ExitIcon className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar lg:hidden">
                <InlineTabButton active={dashboardWorkspace === 'overview'} onClick={() => setDashboardWorkspace('overview')}>
                  Overview
                </InlineTabButton>
                <InlineTabButton active={dashboardWorkspace === 'training'} onClick={() => setDashboardWorkspace('training')}>
                  Training
                </InlineTabButton>
                <InlineTabButton active={dashboardWorkspace === 'race'} onClick={() => setDashboardWorkspace('race')}>
                  Race
                </InlineTabButton>
                <InlineTabButton active={dashboardWorkspace === 'logbook'} onClick={() => setDashboardWorkspace('logbook')}>
                  Logbook
                </InlineTabButton>
                <InlineTabButton active={dashboardWorkspace === 'tools'} onClick={() => setDashboardWorkspace('tools')}>
                  Tools
                </InlineTabButton>
              </div>

              <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--rv-text-dim)]">
                  <span>{describeViewPeriod(viewPeriod)}</span>
                  <span className="text-[var(--rv-text-faint)]">/</span>
                  <span>{currentSummary.runCount} runs</span>
                  <span className="text-[var(--rv-text-faint)]">/</span>
                  <span>{currentSummary.totalDistanceKm.toFixed(1)} km</span>
                  {selectedShoeName && (
                    <>
                      <span className="text-[var(--rv-text-faint)]">/</span>
                      <span>{selectedShoeName}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] p-1">
                    {([
                      { mode: 'all', label: 'All' },
                      { mode: 'year', label: 'Year' },
                      { mode: 'month', label: 'Month' },
                    ] as const).map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewPeriod((prev) => ({ ...prev, mode }))}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${viewPeriod.mode === mode
                          ? 'bg-[var(--rv-text)] text-[var(--rv-bg)]'
                          : 'text-[var(--rv-text-faint)] hover:text-[var(--rv-text)]'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {viewPeriod.mode !== 'all' && (
                    <select
                      value={viewPeriod.year}
                      onChange={(e) => setViewPeriod((prev) => ({ ...prev, year: parseInt(e.target.value, 10) }))}
                      className="rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--rv-text-dim)] outline-none transition hover:border-[var(--rv-border-strong)] focus:border-[var(--rv-blue)]/60"
                    >
                      {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  )}

                  {viewPeriod.mode === 'month' && (
                    <select
                      value={viewPeriod.month || 0}
                      onChange={(e) => setViewPeriod((prev) => ({ ...prev, month: parseInt(e.target.value, 10) }))}
                      className="rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--rv-text-dim)] outline-none transition hover:border-[var(--rv-border-strong)] focus:border-[var(--rv-blue)]/60"
                    >
                      {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => sync({ forceFull: true })}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--rv-text-dim)] transition hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)] disabled:cursor-wait disabled:opacity-50 active:translate-y-px"
                  >
                    <ReloadIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing' : 'Sync'}
                  </button>
                </div>
              </div>

              {dashboardWorkspace === 'training' && (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <InlineTabButton active={trainingWorkspace === 'fitness'} onClick={() => setTrainingWorkspace('fitness')}>
                    Fitness
                  </InlineTabButton>
                  <InlineTabButton active={trainingWorkspace === 'volume'} onClick={() => setTrainingWorkspace('volume')}>
                    Volume
                  </InlineTabButton>
                  <InlineTabButton active={trainingWorkspace === 'mechanics'} onClick={() => setTrainingWorkspace('mechanics')}>
                    Mechanics
                  </InlineTabButton>
                </div>
              )}

              {dashboardWorkspace === 'race' && (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <InlineTabButton active={raceWorkspace === 'predictions'} onClick={() => setRaceWorkspace('predictions')}>
                    Predictions
                  </InlineTabButton>
                  <InlineTabButton active={raceWorkspace === 'vdot'} onClick={() => setRaceWorkspace('vdot')}>
                    VDOT
                  </InlineTabButton>
                </div>
              )}
            </header>

            {dashboardWorkspace === 'overview' && (
              <section className="space-y-4">
                <StatsOverview activities={filteredActivities} allActivities={activities} period={viewPeriod} />
                <div className="grid gap-4">
                  <Suspense fallback={<PanelFallback title="Fitness" subtitle="Loading training load" heightClassName="h-72" />}>
                    <FitnessChart activities={activities} period={viewPeriod} />
                  </Suspense>
                </div>
                <div className="grid gap-4">
                  <ActivityList
                    activities={filteredActivities}
                    limit={8}
                    onSelect={setSelectedActivity}
                    selectedShoeId={selectedShoeId}
                    selectedShoeName={selectedShoeName}
                    onClearShoeFilter={() => setSelectedShoeId(null)}
                    shoes={allShoes}
                  />
                </div>
              </section>
            )}

            {dashboardWorkspace === 'training' && trainingWorkspace === 'fitness' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                <Suspense fallback={<PanelFallback title="Fitness" subtitle="Loading training load" heightClassName="h-72" />}>
                  <FitnessChart activities={activities} period={viewPeriod} />
                </Suspense>
                <Suspense fallback={<PanelFallback title="Weekly Ramp" subtitle="Loading weekly changes" heightClassName="h-[320px]" />}>
                  <WeeklyRampChart activities={activities} />
                </Suspense>
              </section>
            )}

            {dashboardWorkspace === 'training' && trainingWorkspace === 'volume' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.75fr)]">
                <Suspense fallback={<PanelFallback title="Mileage" subtitle="Loading volume trends" heightClassName="h-[400px]" />}>
                  <MileageTrendChart activities={activities} period={viewPeriod} />
                </Suspense>
                <Suspense fallback={<PanelFallback title="Weekly Ramp" subtitle="Loading weekly changes" heightClassName="h-[320px]" />}>
                  <WeeklyRampChart activities={activities} />
                </Suspense>
              </section>
            )}

            {dashboardWorkspace === 'training' && trainingWorkspace === 'mechanics' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                <Suspense fallback={<PanelFallback title="Cadence" subtitle="Loading run mechanics" />}>
                  <CadenceTrendChart activities={activities} />
                </Suspense>
                <Suspense fallback={<PanelFallback title="Shoes" subtitle="Loading equipment log" />}>
                  <ShoeTracker
                    activities={filteredActivities}
                    shoes={allShoes}
                    selectedShoeId={selectedShoeId}
                    onSelectShoe={(id) => setSelectedShoeId((prev) => prev === id ? null : id)}
                  />
                </Suspense>
              </section>
            )}

            {dashboardWorkspace === 'race' && (
              <section className="min-w-0">
                {raceWorkspace === 'predictions' ? (
                  <Suspense fallback={<PanelFallback title="Race Predictions" subtitle="Loading projections" />}>
                    <RaceTimePredictions activities={activities} period={viewPeriod} />
                  </Suspense>
                ) : (
                  <Suspense fallback={<PanelFallback title="VDOT" subtitle="Loading training pace zones" />}>
                    <VDOTPanel activities={activities} />
                  </Suspense>
                )}
              </section>
            )}

            {dashboardWorkspace === 'logbook' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                <ActivityList
                  activities={filteredActivities}
                  limit={50}
                  onSelect={setSelectedActivity}
                  selectedShoeId={selectedShoeId}
                  selectedShoeName={selectedShoeName}
                  onClearShoeFilter={() => setSelectedShoeId(null)}
                  shoes={allShoes}
                />
                <div className="space-y-4">
                  <Suspense fallback={<PanelFallback title="Shoes" subtitle="Loading equipment log" />}>
                    <ShoeTracker
                      activities={filteredActivities}
                      shoes={allShoes}
                      selectedShoeId={selectedShoeId}
                      onSelectShoe={(id) => setSelectedShoeId((prev) => prev === id ? null : id)}
                    />
                  </Suspense>
                  <section className="rounded-[2rem] border border-[var(--rv-border)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_86%,transparent)] px-5 py-5">
                    <div className="mb-5 flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-[var(--rv-blue)]" />
                      <p className="rv-kicker">Calendar</p>
                    </div>
                    <CalendarHeatmap
                      activities={activities}
                      year={viewPeriod.mode !== 'all' ? viewPeriod.year : undefined}
                      month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
                      onSelectDay={handleSelectDay}
                      selectedDate={selectedActivity?.start_date_local.split('T')[0]}
                    />
                  </section>
                </div>
              </section>
            )}

            {dashboardWorkspace === 'tools' && (
              <section className="space-y-4">
                <Link
                  to="/plan-route"
                  className="block rounded-[2rem] border border-[var(--rv-border)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_86%,transparent)] px-5 py-5 transition hover:border-[var(--rv-border-strong)] hover:bg-[color-mix(in_srgb,var(--rv-bg-panel)_96%,transparent)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-blue)_18%,transparent)] text-[var(--rv-blue)]">
                      <BackpackIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="rv-kicker mb-1">Route Planner</p>
                      <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">Build the next route</h3>
                    </div>
                  </div>
                  <p className="mt-4 max-w-[52ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                    Choose a start point, set a target distance, and export a route without carrying this tool inside the daily dashboard.
                  </p>
                </Link>

                <Link
                  to="/form-analysis"
                  className="block rounded-[2rem] border border-[var(--rv-border)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_86%,transparent)] px-5 py-5 transition hover:border-[var(--rv-border-strong)] hover:bg-[color-mix(in_srgb,var(--rv-bg-panel)_96%,transparent)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-yellow)_18%,transparent)] text-[var(--rv-yellow)]">
                      <RocketIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="rv-kicker mb-1">Form Lab</p>
                      <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">Review running form</h3>
                    </div>
                  </div>
                  <p className="mt-4 max-w-[52ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                    Upload a clip, link it to a run, and keep technical feedback in a dedicated review flow.
                  </p>
                </Link>
              </section>
            )}

            <footer className="border-t border-[var(--rv-border)] px-1 py-4">
              <div className="rv-mini-label flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>RunViz analytics v4.2</span>
                <span>Synced with the Strava API</span>
                <a href="https://github.com/hwong103/runviz" className="transition hover:text-[var(--rv-text)]">Project source</a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarNavButton({
  label,
  detail,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  detail: string;
  icon: IconType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-[1.35rem] px-3 py-3 text-left transition ${active
        ? 'bg-[var(--rv-text)] text-[var(--rv-bg)]'
        : 'text-[var(--rv-text-dim)] hover:bg-[var(--rv-bg-panel)] hover:text-[var(--rv-text)]'
        }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${active
        ? 'bg-[color-mix(in_srgb,var(--rv-bg)_10%,transparent)] text-[var(--rv-bg)]'
        : 'bg-[color-mix(in_srgb,var(--rv-text)_8%,transparent)] text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text)]'
        }`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold tracking-[-0.03em]">{label}</div>
        <div className={`text-xs ${active ? 'text-[color-mix(in_srgb,var(--rv-bg)_70%,transparent)]' : 'text-[var(--rv-text-faint)]'}`}>{detail}</div>
      </div>
    </button>
  );
}

function InlineTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active
        ? 'bg-[var(--rv-blue)] text-white shadow-[0_10px_28px_rgba(74,122,255,0.2)]'
        : 'border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)] hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)]'
        }`}
    >
      {children}
    </button>
  );
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`${compact ? 'text-3xl' : 'text-5xl sm:text-6xl'} font-bold tracking-[-0.08em] text-[var(--rv-text)]`}>
        RUN<span className="text-[var(--rv-yellow)]">VIZ</span>
      </span>
      <span className="rv-pill-label rounded-full border border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 px-3 py-1 text-[var(--rv-yellow)]">
        {compact ? 'Running Lab' : 'Running Training Lab'}
      </span>
    </div>
  );
}

function formatLastSync(lastSync: Date | null) {
  if (!lastSync) return 'Never synced';
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just synced';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;

  return `${Math.floor(diffHrs / 24)}d ago`;
}

function describeViewPeriod(viewPeriod: ViewPeriod) {
  if (viewPeriod.mode === 'all') return 'All time';
  if (viewPeriod.mode === 'year') return String(viewPeriod.year);
  return `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`;
}

function PanelFallback({
  title,
  subtitle,
  heightClassName = 'h-56',
}: {
  title: string;
  subtitle: string;
  heightClassName?: string;
}) {
  return (
    <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
      <div className="mb-6">
        <p className="rv-kicker mb-2">{title}</p>
        <p className="rv-body-copy-sm">{subtitle}</p>
      </div>
      <div className={`${heightClassName} animate-pulse rounded-[1.5rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)]`} />
    </div>
  );
}

function ModalFallback() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_srgb,var(--rv-bg)_92%,transparent)] backdrop-blur-xl p-4">
      <div className="rv-panel rv-panel-strong flex w-full max-w-xl items-center justify-center gap-4 px-8 py-10">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--rv-blue)]/30 border-t-[var(--rv-yellow)]" />
        <div>
          <p className="rv-kicker mb-2">Run Details</p>
          <p className="rv-body-copy-sm">Loading deeper analysis</p>
        </div>
      </div>
    </div>
  );
}

export default App;
