import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarIcon,
} from '@radix-ui/react-icons';
import { Backpack, ChevronDown, Rocket } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
import { AppShell } from './components/layout/app-shell';
import { SetupPage } from './components/SetupPage';
import { StatsOverview } from './components/StatsOverview';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { ActivityList } from './components/ActivityList';
import { Button } from './components/ui/button';
import { PeriodComboButton } from './components/ui/PeriodComboButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Toggle } from './components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from './components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import type { Activity, Gear } from './types';
import { isRun } from './types';
import { gear as gearApi } from './services/api';
import { parseActivityLocalDate } from './utils/activityDate';
import {
  DASHBOARD_WORKSPACE_META,
  MONTHS,
  type DashboardWorkspace,
  type RaceWorkspace,
  type TrainingWorkspace,
  type ViewPeriod,
  isDashboardWorkspace,
} from './lib/dashboard';

const FitnessChart = lazy(() =>
  import('./components/FitnessChart').then((module) => ({ default: module.FitnessChart }))
);
const MileageTrendChart = lazy(() =>
  import('./components/MileageTrendChart').then((module) => ({ default: module.MileageTrendChart }))
);
const YearOnYearChart = lazy(() =>
  import('./components/YearOnYearChart').then((module) => ({ default: module.YearOnYearChart }))
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

const GEAR_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const GEAR_FAILURE_RETRY_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_GEAR_FETCH_PER_SESSION = 10;
const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);
const workspaceTabTriggerClass =
  "min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-[0.8rem] text-foreground/75 hover:text-foreground sm:px-4 sm:py-2 sm:text-sm data-[state=active]:!border-foreground/20 data-[state=active]:!bg-foreground data-[state=active]:!text-background dark:data-[state=active]:!bg-foreground dark:data-[state=active]:!text-background";
const LOADING_QUIPS = [
  'Tying shoelaces...',
  'Stretching hamstrings...',
  'Pinning on the race bib...',
  'Calibrating the GPS watch...',
  'Warming up on the track...',
  'Checking the weather forecast...',
  'Lacing up the race shoes...',
  'Eating the pre-run banana...',
  'Consulting the training plan...',
  'Calculating the optimal pace...',
  'Checking heart rate zones...',
  'Plotting the route on the map...',
  'Filling the water bottle...',
  'Queuing up the race playlist...',
  'Applying the anti-chafe balm...',
  'Reviewing last week\'s mileage...',
  'Setting the interval timer...',
  'Checking for elevation on the course...',
  'Syncing the Garmin...',
  'Taking a deep breath at the start line...',
] as const;

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

function useLoadingQuip(): string {
  const [quip, setQuip] = useState(
    () => LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setQuip(LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return quip;
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
  const [filterStyle, setFilterStyle] = useState<'relative' | 'calendar'>('relative');
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
    mode: '90d',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [dashboardWorkspace, setDashboardWorkspace] = useState<DashboardWorkspace>('overview');
  const [trainingWorkspace, setTrainingWorkspace] = useState<TrainingWorkspace>('health');
  const [raceWorkspace, setRaceWorkspace] = useState<RaceWorkspace>('predictions');

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedShoeId, setSelectedShoeId] = useState<string | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSending, setMagicSending] = useState(false);
  const [magicStatus, setMagicStatus] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const loadingQuip = useLoadingQuip();

  // Store additionally fetched gear (e.g. retired shoes not in athlete profile)
  const [additionalGear, setAdditionalGear] = useState<Map<string, Gear>>(new Map());
  // Track request lifecycle so we do not repeatedly fetch failed/in-flight gear IDs.
  const inFlightGearIds = useRef<Set<string>>(new Set());
  const failedGearIds = useRef<Map<string, number>>(new Map());
  const gearFetchCount = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();

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

  useEffect(() => {
    const workspace = searchParams.get('workspace');
    if (isDashboardWorkspace(workspace)) {
      setDashboardWorkspace(workspace);
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

  // Get most recent activity ID for AI insights cache key
  const mostRecentActivityId = useMemo(() => {
    if (activities.length === 0) return undefined;
    const sorted = [...activities].sort((a, b) => 
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
    return sorted[0]?.id;
  }, [activities]);

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
    return Array.from(years).sort((a, b) => a - b);
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
      if (viewPeriod.mode === '30d') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        cutoff.setHours(0, 0, 0, 0);
        return date >= cutoff;
      }
      if (viewPeriod.mode === '90d') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        cutoff.setHours(0, 0, 0, 0);
        return date >= cutoff;
      }
      if (viewPeriod.mode === '365d') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 365);
        cutoff.setHours(0, 0, 0, 0);
        return date >= cutoff;
      }
      return false;
    }).filter(a => {
      // Secondary filter: Shoe
      if (selectedShoeId) return a.gear_id === selectedShoeId;
      return true;
    });
  }, [activities, viewPeriod, selectedShoeId]);

  const handleSelectDay = useCallback((dateStr: string) => {
    const activity = filteredActivities.find(a => {
      if (!isRun(a)) return false;
      return a.start_date_local.startsWith(dateStr);
    });
    if (activity) {
      setSelectedActivity(activity);
    }
  }, [filteredActivities]);

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

  const activeMeta = DASHBOARD_WORKSPACE_META[dashboardWorkspace];

  const handleWorkspaceSelect = useCallback((workspace: DashboardWorkspace) => {
    setDashboardWorkspace(workspace);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('workspace', workspace);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  if (authLoading) {
    return (
      <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
        <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
          <BrandWordmark compact />
          <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
          <div>
            <p className="rv-kicker mb-2">System Sync</p>
            <p className="text-lg font-medium text-[var(--rv-text-dim)]">{loadingQuip}</p>
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
            <p className="rv-mini-label mt-6 text-[0.68rem] sm:text-[0.7rem] lg:whitespace-nowrap">
              Connect Strava during setup after sign-in.
            </p>
            <div className="mt-6 pt-4 text-center">
              <Link
                to="/privacy"
                className="rv-mini-label transition hover:text-foreground"
              >
                Privacy Policy
              </Link>
            </div>
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
    <AppShell
      eyebrow={activeMeta.kicker}
      title={activeMeta.title}
      subtitle={activeMeta.description}
      currentWorkspace={dashboardWorkspace}
      onWorkspaceSelect={handleWorkspaceSelect}
      athleteName={athleteLabel}
      athleteImage={athlete?.profile ?? null}
      statusText={syncing ? 'Syncing now' : formatLastSync(lastSync)}
      syncing={syncing}
      onSync={() => sync({ forceFull: true })}
      onLogout={logout}
      headerActions={
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span>{describeViewPeriod(viewPeriod)}</span>
            <span className="text-border">/</span>
            <span>{currentSummary.runCount} runs</span>
            <span className="text-border">/</span>
            <span>{currentSummary.totalDistanceKm.toFixed(1)} km</span>
            {selectedShoeName ? (
              <>
                <span className="text-border">/</span>
                <span>{selectedShoeName}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-md border border-input bg-transparent p-0.5">
              <Toggle
                pressed={filterStyle === 'relative'}
                onPressedChange={() => {
                  setFilterStyle('relative');
                  setViewPeriod({ mode: '90d', year: viewPeriod.year, month: viewPeriod.month });
                }}
                size="sm"
                className="data-[state=on]:bg-muted"
              >
                Relative
              </Toggle>
              <Toggle
                pressed={filterStyle === 'calendar'}
                onPressedChange={() => {
                  setFilterStyle('calendar');
                  setViewPeriod({ mode: 'year', year: new Date().getFullYear(), month: new Date().getMonth() });
                }}
                size="sm"
                className="data-[state=on]:bg-muted"
              >
                Calendar
              </Toggle>
            </div>

            {filterStyle === 'relative' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-8 justify-between gap-2 px-3 min-w-[120px]">
                    {viewPeriod.mode === '30d' ? 'Last 30 days' : viewPeriod.mode === '90d' ? 'Last 90 days' : 'Last 365 days'}
                    <ChevronDown className="size-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px]">
                  <DropdownMenuRadioGroup
                    value={viewPeriod.mode}
                    onValueChange={(value) => {
                      setViewPeriod((prev) => ({ ...prev, mode: value as ViewPeriod['mode'] }));
                    }}
                  >
                    <DropdownMenuRadioItem value="30d">Last 30 days</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="90d">Last 90 days</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="365d">Last 365 days</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <ToggleGroup
                  type="single"
                  value={viewPeriod.mode}
                  onValueChange={(value) => {
                    if (!value) return;
                    setViewPeriod((prev) => ({ ...prev, mode: value as ViewPeriod['mode'] }));
                  }}
                  variant="outline"
                  spacing={1}
                  className="w-auto"
                >
                  <ToggleGroupItem value="all" className="flex-1 sm:flex-none">
                    All
                  </ToggleGroupItem>
                  <ToggleGroupItem value="year" className="flex-1 sm:flex-none">
                    Year
                  </ToggleGroupItem>
                  <ToggleGroupItem value="month" className="flex-1 sm:flex-none">
                    Month
                  </ToggleGroupItem>
                </ToggleGroup>

                <PeriodComboButton
                  viewPeriod={viewPeriod}
                  availableYears={availableYears}
                  onViewPeriodChange={setViewPeriod}
                />
              </>
            )}
          </div>
        </div>
      }
    >
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

      <div className="mx-auto max-w-[1720px] space-y-5">
        {dashboardWorkspace === 'overview' && (
          <section className="space-y-4">
            <StatsOverview activities={filteredActivities} allActivities={activities} period={viewPeriod} variant="overview" mostRecentActivityId={mostRecentActivityId} />
            <Suspense fallback={<PanelFallback title="Year on Year" subtitle="Loading annual comparison" heightClassName="h-[400px]" />}>
              <YearOnYearChart activities={activities} />
            </Suspense>
          </section>
        )}

        {dashboardWorkspace === 'training' && (
          <Tabs
            value={trainingWorkspace}
            onValueChange={(value) => setTrainingWorkspace(value as TrainingWorkspace)}
            className="space-y-4"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="rv-kicker mb-2">Training Views</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Start with block health, then move into the chart or mechanics view you want.
                </p>
              </div>
              <TabsList variant="line" className="grid h-auto w-full grid-cols-4 gap-2 bg-transparent p-0 sm:flex sm:w-auto sm:flex-wrap sm:justify-start">
                <TabsTrigger value="health" className={workspaceTabTriggerClass}>
                  Health
                </TabsTrigger>
                <TabsTrigger value="fitness" className={workspaceTabTriggerClass}>
                  Fitness
                </TabsTrigger>
                <TabsTrigger value="volume" className={workspaceTabTriggerClass}>
                  Volume
                </TabsTrigger>
                <TabsTrigger value="mechanics" className={workspaceTabTriggerClass}>
                  Mechanics
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="health" className="mt-0">
              <StatsOverview activities={filteredActivities} allActivities={activities} period={viewPeriod} variant="training" mostRecentActivityId={mostRecentActivityId} />
            </TabsContent>
            <TabsContent value="fitness" className="mt-0">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                <Suspense fallback={<PanelFallback title="Fitness" subtitle="Loading training load" heightClassName="h-72" />}>
                  <FitnessChart activities={activities} allActivities={activities} period={viewPeriod} mostRecentActivityId={mostRecentActivityId} />
                </Suspense>
                <Suspense fallback={<PanelFallback title="Weekly Ramp" subtitle="Loading weekly changes" heightClassName="h-[320px]" />}>
                  <WeeklyRampChart activities={activities} />
                </Suspense>
              </div>
            </TabsContent>
            <TabsContent value="volume" className="mt-0">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.75fr)]">
                <Suspense fallback={<PanelFallback title="Mileage" subtitle="Loading volume trends" heightClassName="h-[400px]" />}>
                  <MileageTrendChart activities={activities} allActivities={activities} period={viewPeriod} mostRecentActivityId={mostRecentActivityId} />
                </Suspense>
                <Suspense fallback={<PanelFallback title="Weekly Ramp" subtitle="Loading weekly changes" heightClassName="h-[320px]" />}>
                  <WeeklyRampChart activities={activities} />
                </Suspense>
              </div>
            </TabsContent>
            <TabsContent value="mechanics" className="mt-0">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
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
              </div>
            </TabsContent>
          </Tabs>
        )}

        {dashboardWorkspace === 'race' && (
          <Tabs
            value={raceWorkspace}
            onValueChange={(value) => setRaceWorkspace(value as RaceWorkspace)}
            className="space-y-4"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="rv-kicker mb-2">Race Views</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Compare race forecasts with training paces without carrying both surfaces in the header.
                </p>
              </div>
              <TabsList variant="line" className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:flex sm:w-auto sm:flex-wrap sm:justify-start">
                <TabsTrigger value="predictions" className={workspaceTabTriggerClass}>
                  Predictions
                </TabsTrigger>
                <TabsTrigger value="vdot" className={workspaceTabTriggerClass}>
                  Pace Guide
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="predictions" className="mt-0">
              <Suspense fallback={<PanelFallback title="Race Predictions" subtitle="Loading projections" />}>
                <RaceTimePredictions activities={activities} allActivities={activities} period={viewPeriod} mostRecentActivityId={mostRecentActivityId} />
              </Suspense>
            </TabsContent>
            <TabsContent value="vdot" className="mt-0">
              <Suspense fallback={<PanelFallback title="VDOT" subtitle="Loading training pace zones" />}>
                <VDOTPanel
                    activities={activities}
                    allActivities={activities}
                    mostRecentActivityId={mostRecentActivityId}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}

        {dashboardWorkspace === 'logbook' && (
          <section className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-[var(--rv-blue)]" />
                  <p className="rv-kicker">Calendar</p>
                </div>
                <p className="mb-4 text-sm leading-6 text-muted-foreground xl:max-w-[72ch]">
                  Scan the whole block at a glance, then drop into the daily log or shoe rotation below.
                </p>
                <CalendarHeatmap
                  activities={filteredActivities}
                  year={viewPeriod.mode !== 'all' && !['30d', '90d', '365d'].includes(viewPeriod.mode) ? viewPeriod.year : undefined}
                  month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
                  startDate={viewPeriod.mode === '30d' ? (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })() : viewPeriod.mode === '90d' ? (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d; })() : viewPeriod.mode === '365d' ? (() => { const d = new Date(); d.setDate(d.getDate() - 365); return d; })() : undefined}
                  endDate={['30d', '90d', '365d'].includes(viewPeriod.mode) ? new Date() : undefined}
                  onSelectDay={handleSelectDay}
                  selectedDate={selectedActivity?.start_date_local.split('T')[0]}
                />
              </div>
              <Suspense fallback={<PanelFallback title="Shoes" subtitle="Loading equipment log" />}>
                <ShoeTracker
                  activities={filteredActivities}
                  shoes={allShoes}
                  selectedShoeId={selectedShoeId}
                  onSelectShoe={(id) => setSelectedShoeId((prev) => prev === id ? null : id)}
                />
              </Suspense>
            </div>

            <ActivityList
              activities={filteredActivities}
              limit={50}
              onSelect={setSelectedActivity}
              selectedShoeId={selectedShoeId}
              selectedShoeName={selectedShoeName}
              onClearShoeFilter={() => setSelectedShoeId(null)}
              shoes={allShoes}
            />
          </section>
        )}

        {dashboardWorkspace === 'tools' && (
          <section className="grid gap-4 lg:grid-cols-2">
            <Link
              to="/plan-route"
              className="rounded-[1.4rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground/15 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-blue)_18%,transparent)] text-[var(--rv-blue)]">
                  <Backpack className="h-5 w-5" />
                </div>
                <div>
                  <p className="rv-kicker mb-1">Route Planner</p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                    Build the next route
                  </h3>
                </div>
              </div>
              <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted-foreground">
                Choose a start point, set a target distance, and export a route without carrying this tool inside the daily dashboard.
              </p>
            </Link>

            <Link
              to="/form-analysis"
              className="rounded-[1.4rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground/15 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-yellow)_18%,transparent)] text-[var(--rv-yellow)]">
                  <Rocket className="h-5 w-5" />
                </div>
                <div>
                  <p className="rv-kicker mb-1">Form Lab</p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                    Review running form
                  </h3>
                </div>
              </div>
              <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted-foreground">
                Upload a clip, link it to a run, and keep technical feedback in a dedicated review flow.
              </p>
            </Link>
          </section>
        )}

        <footer className="border-t border-border px-1 py-4">
          <div className="rv-mini-label flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>RunViz analytics v4.5</span>
            <span>Synced with the Strava API</span>
            <a href="https://github.com/hwong103/runviz" className="transition hover:text-foreground">
              Project source
            </a>
            <Link to="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col ${compact ? 'items-center gap-2' : 'items-start gap-2'}`}>
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
  if (viewPeriod.mode === 'month') return `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`;
  if (viewPeriod.mode === '30d') return 'Last 30 days';
  if (viewPeriod.mode === '90d') return 'Last 90 days';
  if (viewPeriod.mode === '365d') return 'Last 365 days';
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
