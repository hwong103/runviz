import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
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
import { RefreshCw } from 'lucide-react';

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

type DashboardWorkspace = 'overview' | 'metrics' | 'logbook';
type MetricsWorkspace = 'load' | 'race' | 'mechanics';

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
  const [metricsWorkspace, setMetricsWorkspace] = useState<MetricsWorkspace>('load');

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedShoeId, setSelectedShoeId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
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

  useEffect(() => {
    if (!isMenuOpen || !avatarRef.current) return;

    const updateMenuPos = () => {
      if (!avatarRef.current) return;

      const rect = avatarRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 10,
        right: Math.max(window.innerWidth - rect.right, 16),
      });
    };

    updateMenuPos();
    window.addEventListener('resize', updateMenuPos);
    window.addEventListener('scroll', updateMenuPos, true);

    return () => {
      window.removeEventListener('resize', updateMenuPos);
      window.removeEventListener('scroll', updateMenuPos, true);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (avatarRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isMenuOpen]);

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

      <div className="min-h-screen">
        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-[var(--rv-border)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_88%,transparent)] backdrop-blur-2xl">
            <div className="mx-auto flex min-h-[60px] max-w-[1720px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-0 lg:px-8">
              <div className="flex shrink-0 items-center gap-2.5">
                <LabGlyph className="h-6 w-6 text-[var(--rv-blue)]" />
                <span className="text-[1.35rem] font-bold tracking-[-0.06em] text-[var(--rv-text)]">
                  RUN<span className="text-[var(--rv-yellow)]">VIZ</span>
                </span>
              </div>

              <div className="hidden h-5 w-px shrink-0 bg-[var(--rv-border)] sm:block" />

              <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
                <div className="flex flex-wrap items-center gap-0.5 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] p-0.5">
                  {([
                    { mode: 'all', label: 'All' },
                    { mode: 'year', label: 'Year' },
                    { mode: 'month', label: 'Month' },
                  ] as const).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => setViewPeriod(prev => ({ ...prev, mode }))}
                      className={`rv-pill-label rounded-full px-2.5 py-1 transition-all duration-200 ${viewPeriod.mode === mode
                        ? 'bg-[var(--rv-blue)] text-white shadow-[0_4px_12px_rgba(74,122,255,0.35)]'
                        : 'text-[var(--rv-text-faint)] hover:-translate-y-0.5 hover:text-[var(--rv-text-dim)]'
                        }`}
                      style={viewPeriod.mode === mode ? { color: '#fff' } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {viewPeriod.mode !== 'all' && (
                  <select
                    value={viewPeriod.year}
                    onChange={(e) => setViewPeriod(prev => ({ ...prev, year: parseInt(e.target.value, 10) }))}
                    className="rv-pill-label min-w-0 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-2.5 py-1 text-[var(--rv-text-dim)] outline-none transition hover:border-[var(--rv-border-strong)] focus:border-[var(--rv-blue)]/60"
                  >
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}

                {viewPeriod.mode === 'month' && (
                  <select
                    value={viewPeriod.month || 0}
                    onChange={(e) => setViewPeriod(prev => ({ ...prev, month: parseInt(e.target.value, 10) }))}
                    className="rv-pill-label min-w-0 rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-2.5 py-1 text-[var(--rv-text-dim)] outline-none transition hover:border-[var(--rv-border-strong)] focus:border-[var(--rv-blue)]/60"
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                )}

              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
                <button
                  onClick={() => sync({ forceFull: true })}
                  disabled={syncing}
                  type="button"
                  title={syncing ? 'Syncing...' : 'Sync Data'}
                  data-syncing={syncing}
                  className="rv-sync-button flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-faint)] transition hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text-dim)] disabled:cursor-wait disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                </button>

                  <button
                    type="button"
                    ref={avatarRef}
                    onClick={() => {
                      if (!isMenuOpen && avatarRef.current) {
                        const rect = avatarRef.current.getBoundingClientRect();
                        setMenuPos({
                          top: rect.bottom + 8,
                          right: Math.max(window.innerWidth - rect.right, 16),
                        });
                      }
                      setIsMenuOpen((open) => !open);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] transition hover:border-[var(--rv-border-strong)]"
                  >
                    {athlete?.profile ? (
                      <img src={athlete.profile} className="h-full w-full object-cover" alt="Profile" />
                    ) : (
                      <span className="rv-mini-label tracking-[0.1em] text-[var(--rv-text-dim)]">
                        {athlete?.firstname?.[0] ?? 'R'}
                      </span>
                    )}
                  </button>
              </div>
            </div>
          </header>

          {isMenuOpen && createPortal(
            <>
              <div
                ref={menuRef}
                className="rv-panel rv-panel-strong fixed z-[60] w-72 overflow-hidden p-2 animate-in fade-in zoom-in-95 duration-150"
                style={{ top: menuPos.top, right: menuPos.right }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-[var(--rv-border)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    {athlete?.profile ? (
                      <img src={athlete.profile} className="h-8 w-8 rounded-full object-cover" alt="Profile" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-sm font-semibold uppercase">
                        {athlete?.firstname?.[0] ?? 'R'}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-[var(--rv-text)]">{athleteLabel}</div>
                      <div className="rv-mini-label">RunViz account</div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-[var(--rv-border)] px-2 py-3">
                  <div className="flex justify-center px-4">
                    <ThemeToggle />
                  </div>
                </div>

                <div className="border-b border-[var(--rv-border)] px-2 py-2">
                  <Link
                    to="/plan-route"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition hover:bg-[var(--rv-bg-elevated)]"
                  >
                    <MapGlyph className="h-4 w-4 text-[var(--rv-blue)]" />
                    <span className="rv-mini-label text-[var(--rv-text)]">Route Planner</span>
                  </Link>
                  <Link
                    to="/form-analysis"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition hover:bg-[var(--rv-bg-elevated)]"
                  >
                    <LabGlyph className="h-4 w-4 text-[var(--rv-yellow)]" />
                    <span className="rv-mini-label text-[var(--rv-text)]">Form Lab</span>
                  </Link>
                </div>

                <div className="border-b border-[var(--rv-border)] px-2 py-2">
                  <div className="flex items-center justify-between rounded-2xl px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${syncing ? 'animate-pulse bg-[var(--rv-yellow)]' : 'bg-[var(--rv-green)]'}`} />
                      <span className="rv-mini-label">
                        {syncing ? 'Sync in progress' : formatLastSync(lastSync)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sync({ forceFull: true });
                      setIsMenuOpen(false);
                    }}
                    disabled={syncing}
                    className="flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-left transition hover:bg-[var(--rv-bg-elevated)] disabled:opacity-50"
                  >
                    <span className="rv-mini-label text-[var(--rv-text)]">Full Sync</span>
                    <span className="rv-mini-label text-[var(--rv-blue)]">{syncing ? 'Running' : 'Start'}</span>
                  </button>
                </div>

                <div className="px-2 py-2">
                  <button
                    onClick={logout}
                    className="flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-left transition hover:bg-red-500/10"
                  >
                    <span className="rv-mini-label text-[var(--rv-text)]">Logout</span>
                    <span className="rv-mini-label text-[#ff7f64]">Exit</span>
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}

          <main className="mx-auto flex max-w-[1720px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <section className="rv-panel rv-panel-strong overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <p className="rv-kicker mb-2">Workspace</p>
                  <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.05em] text-[var(--rv-text)]">
                    A shorter dashboard with one clear mode at a time.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--rv-text-dim)] sm:text-base">
                    Keep the top KPIs visible, then move between overview, deep metrics, and the training log without carrying every panel on the same page.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
                  <div className="rounded-[1.4rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3">
                    <div className="rv-mini-label">Visible Runs</div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--rv-text)]">{filteredActivities.length}</div>
                  </div>
                  <div className="rounded-[1.4rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3">
                    <div className="rv-mini-label">Last Sync</div>
                    <div className="mt-2 text-sm font-semibold text-[var(--rv-text)]">{formatLastSync(lastSync)}</div>
                  </div>
                  <div className="rounded-[1.4rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3">
                    <div className="rv-mini-label">Shoe Filter</div>
                    <div className="mt-2 text-sm font-semibold text-[var(--rv-text)]">{selectedShoeName ?? 'All gear'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-4 border-t border-[var(--rv-border)] pt-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: 'overview', label: 'Overview' },
                    { key: 'metrics', label: 'Metrics Lab' },
                    { key: 'logbook', label: 'Logbook' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDashboardWorkspace(key)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold tracking-[-0.02em] transition ${dashboardWorkspace === key
                        ? 'bg-[var(--rv-text)] text-[var(--rv-bg)]'
                        : 'border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)] hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)]'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link to="/plan-route" className="rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--rv-text-dim)] transition hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)]">
                    Route Planner
                  </Link>
                  <Link to="/form-analysis" className="rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--rv-text-dim)] transition hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)]">
                    Form Lab
                  </Link>
                </div>
              </div>
            </section>

            <StatsOverview activities={filteredActivities} allActivities={activities} period={viewPeriod} />

            {dashboardWorkspace === 'overview' && (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="space-y-6 xl:col-span-8">
                  <Suspense fallback={<PanelFallback title="Performance Lab" subtitle="Loading fitness metrics" heightClassName="h-72" />}>
                    <FitnessChart activities={activities} period={viewPeriod} />
                  </Suspense>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <section className="rv-panel px-5 py-5 sm:px-7 sm:py-6 lg:col-span-7">
                      <div className="mb-6 flex items-center justify-between gap-3">
                        <div>
                          <p className="rv-kicker mb-2">Training Calendar</p>
                          <h2 className="rv-section-title text-[1.55rem]">Runs by day</h2>
                        </div>
                        <span className="rv-mini-label hidden sm:inline">Click a day to inspect a run</span>
                      </div>
                      <CalendarHeatmap
                        activities={activities}
                        year={viewPeriod.mode !== 'all' ? viewPeriod.year : undefined}
                        month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
                        onSelectDay={handleSelectDay}
                        selectedDate={selectedActivity?.start_date_local.split('T')[0]}
                      />
                    </section>

                    <section className="rv-panel px-5 py-5 sm:px-7 sm:py-6 lg:col-span-5">
                      <div className="mb-6">
                        <p className="rv-kicker mb-2">Utilities</p>
                        <h2 className="rv-section-title text-[1.55rem]">Quick actions</h2>
                      </div>
                      <div className="space-y-3">
                        <Link to="/plan-route" className="rv-panel rv-panel-accent block px-5 py-5 transition hover:-translate-y-1">
                          <p className="rv-kicker mb-3">Route Planner</p>
                          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">Plan the next route</h3>
                          <p className="rv-body-copy-sm mt-2">Set a target distance and export a route as GPX.</p>
                        </Link>
                        <Link to="/form-analysis" className="rv-panel block px-5 py-5 transition hover:-translate-y-1 hover:border-[var(--rv-blue)]/40">
                          <p className="rv-kicker mb-3">Form Lab</p>
                          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">Review running form</h3>
                          <p className="rv-body-copy-sm mt-2">Upload a clip and keep your analysis linked to a run.</p>
                        </Link>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="space-y-6 xl:col-span-4">
                  <Suspense fallback={<PanelFallback title="Race Predictions" subtitle="Loading projections" />}>
                    <RaceTimePredictions activities={activities} period={viewPeriod} />
                  </Suspense>
                  <Suspense fallback={<PanelFallback title="VDOT Guidance" subtitle="Loading training pace zones" />}>
                    <VDOTPanel activities={activities} />
                  </Suspense>
                </div>
              </section>
            )}

            {dashboardWorkspace === 'metrics' && (
              <section className="space-y-6">
                <div className="rv-panel px-5 py-5 sm:px-7 sm:py-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="rv-kicker mb-2">Metrics Lab</p>
                      <h2 className="rv-section-title text-[1.55rem]">Focus one lens at a time</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { key: 'load', label: 'Load' },
                        { key: 'race', label: 'Race' },
                        { key: 'mechanics', label: 'Mechanics' },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMetricsWorkspace(key)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${metricsWorkspace === key
                            ? 'bg-[var(--rv-blue)] text-white shadow-[0_10px_30px_rgba(74,122,255,0.2)]'
                            : 'border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)] hover:border-[var(--rv-border-strong)] hover:text-[var(--rv-text)]'
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {metricsWorkspace === 'load' && (
                  <section className="space-y-6">
                    <Suspense fallback={<PanelFallback title="Performance Lab" subtitle="Loading fitness metrics" heightClassName="h-72" />}>
                      <FitnessChart activities={activities} period={viewPeriod} />
                    </Suspense>
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <div className="xl:col-span-8">
                        <Suspense fallback={<PanelFallback title="Mileage Trends" subtitle="Loading volume history" heightClassName="h-[400px]" />}>
                          <MileageTrendChart activities={activities} period={viewPeriod} />
                        </Suspense>
                      </div>
                      <div className="xl:col-span-4">
                        <Suspense fallback={<PanelFallback title="Weekly Volume" subtitle="Loading weekly ramp history" heightClassName="h-[320px]" />}>
                          <WeeklyRampChart activities={activities} />
                        </Suspense>
                      </div>
                    </div>
                  </section>
                )}

                {metricsWorkspace === 'race' && (
                  <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <div className="xl:col-span-6">
                      <Suspense fallback={<PanelFallback title="Race Predictions" subtitle="Loading projections" />}>
                        <RaceTimePredictions activities={activities} period={viewPeriod} />
                      </Suspense>
                    </div>
                    <div className="xl:col-span-6">
                      <Suspense fallback={<PanelFallback title="VDOT Guidance" subtitle="Loading training pace zones" />}>
                        <VDOTPanel activities={activities} />
                      </Suspense>
                    </div>
                  </section>
                )}

                {metricsWorkspace === 'mechanics' && (
                  <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <div className="xl:col-span-8">
                      <Suspense fallback={<PanelFallback title="Cadence Trend" subtitle="Loading cadence history" />}>
                        <CadenceTrendChart activities={activities} />
                      </Suspense>
                    </div>
                    <div className="xl:col-span-4">
                      <Suspense fallback={<PanelFallback title="Equipment Log" subtitle="Loading shoe usage" />}>
                        <ShoeTracker
                          activities={filteredActivities}
                          shoes={allShoes}
                          selectedShoeId={selectedShoeId}
                          onSelectShoe={(id) => setSelectedShoeId(prev => prev === id ? null : id)}
                        />
                      </Suspense>
                    </div>
                  </section>
                )}
              </section>
            )}

            {dashboardWorkspace === 'logbook' && (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <ActivityList
                    activities={filteredActivities}
                    limit={50}
                    onSelect={setSelectedActivity}
                    selectedShoeId={selectedShoeId}
                    selectedShoeName={selectedShoeName}
                    onClearShoeFilter={() => setSelectedShoeId(null)}
                    shoes={allShoes}
                  />
                </div>

                <div className="space-y-6 xl:col-span-4">
                  <Suspense fallback={<PanelFallback title="Equipment Log" subtitle="Loading shoe usage" />}>
                    <ShoeTracker
                      activities={filteredActivities}
                      shoes={allShoes}
                      selectedShoeId={selectedShoeId}
                      onSelectShoe={(id) => setSelectedShoeId(prev => prev === id ? null : id)}
                    />
                  </Suspense>
                  <section className="rv-panel px-5 py-5 sm:px-7 sm:py-6">
                    <div className="mb-6 flex items-center justify-between gap-3">
                      <div>
                        <p className="rv-kicker mb-2">Calendar</p>
                        <h2 className="rv-section-title text-[1.55rem]">Training map</h2>
                      </div>
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
          </main>

          <footer className="border-t border-[var(--rv-border)] px-4 py-8 sm:px-6 lg:px-8">
            <div className="rv-mini-label mx-auto flex max-w-[1720px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <span>RunViz analytics v4.2</span>
              <span>Synced with the Strava API</span>
              <a href="https://github.com/hwong103/runviz" className="transition hover:text-[var(--rv-text)]">Project source</a>
            </div>
          </footer>
        </div>
      </div>
    </div>
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

function MapGlyph({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4.5 3.8 6.6A1 1 0 0 0 3 7.52v11.03a1 1 0 0 0 1.37.93L9 17.5l6 2 5.2-2.08a1 1 0 0 0 .8-.93V5.46a1 1 0 0 0-1.37-.93L15 6.5l-6-2Z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </svg>
  );
}

function LabGlyph({ className = 'h-5 w-5 text-current' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 17.5 9.5 12l3.5 3.5L20 8.5" />
      <path d="M4 6v12h16" />
      <circle cx="9.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="13" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
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
