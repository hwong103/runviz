import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
import { SetupPage } from './components/SetupPage';
import { StatsOverview } from './components/StatsOverview';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { ActivityList } from './components/ActivityList';
import { FitnessChart } from './components/FitnessChart';
import { RunDetails } from './components/RunDetails';
import { ShoeTracker } from './components/ShoeTracker';
import { RaceTimePredictions } from './components/RaceTimePredictions';
import type { Activity, Gear } from './types';
import { isRun } from './types';
import { gear as gearApi } from './services/api';
import { parseActivityLocalDate } from './utils/activityDate';

interface ViewPeriod {
  mode: 'all' | 'year' | 'month';
  year: number;
  month: number | null;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const GEAR_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const GEAR_FAILURE_RETRY_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_GEAR_FETCH_PER_SESSION = 10;

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
  const { activities, syncing, sync, lastSync } = useActivities();
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
    mode: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedShoeId, setSelectedShoeId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
  const activePeriodLabel = viewPeriod.mode === 'all'
    ? 'Live sync'
    : viewPeriod.mode === 'year'
      ? `${viewPeriod.year} overview`
      : `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`;

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
      <div className="rv-grid-lines flex min-h-screen items-center justify-center px-4 py-10">
        <div className="rv-shell-card flex w-full max-w-5xl flex-col gap-8 overflow-hidden px-6 py-8 sm:px-10 lg:flex-row lg:items-end lg:px-12 lg:py-12">
          <div className="flex-1 space-y-5">
            <p className="rv-kicker">For Ambitious Runners</p>
            <BrandWordmark />
            <h1 className="rv-metric max-w-2xl text-5xl sm:text-6xl lg:text-7xl">
              Clear training insights for runners getting more serious.
            </h1>
            <p className="max-w-xl text-base leading-7 text-[var(--rv-text-dim)] sm:text-lg">
              Sign in with Google or magic link, then connect Strava to see your training load, plan routes, review running form, and keep your key metrics in one place.
            </p>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">
              Training load, route planning, and video-based form analysis.
            </p>
          </div>
          <div className="rv-panel rv-panel-accent w-full max-w-md px-6 py-8 sm:px-8">
            <p className="rv-kicker mb-4">Sign In</p>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--rv-text)]">Open your RunViz workspace</h2>
            <p className="mb-6 text-sm leading-6 text-[var(--rv-text-dim)]">
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
                <p className="text-xs leading-5 text-[var(--rv-text-dim)]">
                  {googleStatus}
                </p>
              )}
              <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--rv-text-faint)]">
                  Magic link
                </label>
                <div className="flex flex-col gap-3">
                  <input
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--rv-text)] outline-none transition placeholder:text-[var(--rv-text-faint)] focus:border-[var(--rv-blue)]"
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
                    className="rv-button-secondary flex w-full items-center justify-center px-6 py-3 text-xs uppercase tracking-[0.24em] disabled:cursor-wait"
                  >
                    {magicSending ? 'Sending...' : 'Send magic link'}
                  </button>
                </div>
                {magicStatus && (
                  <p className="mt-3 text-xs leading-5 text-[var(--rv-text-dim)]">
                    {magicStatus}
                  </p>
                )}
              </div>
            </div>
            <p className="mt-6 text-xs uppercase tracking-[0.25em] text-[var(--rv-text-faint)]">Connect Strava during setup after sign-in.</p>
          </div>
        </div>
      </div>
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
        <RunDetails
          activity={selectedActivity}
          allActivities={activities}
          shoes={allShoes}
          onClose={() => setSelectedActivity(null)}
          onSelect={setSelectedActivity}
        />
      )}

      <div className="min-h-screen">
        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-white/5 bg-[#051723]/88 backdrop-blur-2xl">
            <div className="mx-auto flex max-w-[1720px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <LabGlyph className="h-8 w-8 text-[var(--rv-blue)]" />
                  <div>
                    <BrandWordmark compact />
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">
                      {activePeriodLabel}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Link
                    to="/plan-route"
                    className="rv-chip transition hover:border-[var(--rv-blue)]/50 hover:text-[var(--rv-text)]"
                  >
                    <MapGlyph className="h-4 w-4 text-[var(--rv-blue)]" />
                    Route Planner
                  </Link>
                  <Link
                    to="/form-analysis"
                    className="rv-chip transition hover:border-[var(--rv-blue)]/50 hover:text-[var(--rv-text)]"
                  >
                    <LabGlyph className="h-4 w-4 text-[var(--rv-yellow)]" />
                    Form Lab
                  </Link>
                  <button
                    onClick={() => sync({ forceFull: true })}
                    disabled={syncing}
                    className={`px-5 py-3 text-xs ${syncing
                      ? 'cursor-wait border border-white/10 bg-white/5 text-[var(--rv-text-faint)]'
                      : 'rv-button-secondary border-[var(--rv-blue)]/45 bg-[var(--rv-blue)]/18 text-[var(--rv-text)] hover:bg-[var(--rv-blue)]/24'
                      }`}
                  >
                    {syncing ? 'Syncing...' : 'Sync Data'}
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setIsMenuOpen((open) => !open)}
                      className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-white/20"
                    >
                      {athlete?.profile ? (
                        <img src={athlete.profile} className="h-9 w-9 rounded-full object-cover" alt="Profile" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold uppercase tracking-[0.18em]">RV</div>
                      )}
                      <div className="hidden text-left sm:block">
                        <div className="text-sm font-bold text-[var(--rv-text)]">{athleteLabel}</div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Athlete</div>
                      </div>
                    </button>

                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                        <div className="rv-panel rv-panel-strong absolute right-0 z-50 mt-3 w-72 overflow-hidden p-2">
                          <div className="border-b border-white/5 px-4 py-4">
                            <div className="text-sm font-bold text-[var(--rv-text)]">{athleteLabel}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">RunViz account</div>
                          </div>
                          <div className="space-y-1 px-2 py-2">
                            <button
                              onClick={() => {
                                sync({ forceFull: true });
                                setIsMenuOpen(false);
                              }}
                              disabled={syncing}
                              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:bg-white/5"
                            >
                              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--rv-text)]">Full Sync</span>
                              <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--rv-blue)]">{syncing ? 'Running' : 'Start'}</span>
                            </button>
                            <button
                              onClick={logout}
                              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:bg-red-500/10"
                            >
                              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--rv-text)]">Logout</span>
                              <span className="text-[10px] uppercase tracking-[0.22em] text-[#ff7f64]">Exit</span>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
                  {([
                    { mode: 'all', label: 'Live' },
                    { mode: 'year', label: 'Year' },
                    { mode: 'month', label: 'Month' },
                  ] as const).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => setViewPeriod(prev => ({ ...prev, mode }))}
                      className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] transition sm:px-6 ${viewPeriod.mode === mode
                        ? 'bg-[var(--rv-blue)] text-white shadow-[0_10px_24px_rgba(0,147,214,0.3)]'
                        : 'text-[var(--rv-text-faint)] hover:text-[var(--rv-text)]'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {viewPeriod.mode !== 'all' && (
                    <select
                      value={viewPeriod.year}
                      onChange={(e) => setViewPeriod(prev => ({ ...prev, year: parseInt(e.target.value, 10) }))}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--rv-text)] outline-none transition focus:border-[var(--rv-blue)]"
                    >
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}

                  {viewPeriod.mode === 'month' && (
                    <select
                      value={viewPeriod.month || 0}
                      onChange={(e) => setViewPeriod(prev => ({ ...prev, month: parseInt(e.target.value, 10) }))}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--rv-text)] outline-none transition focus:border-[var(--rv-blue)]"
                    >
                      {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                  )}

                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">
                    <span className={`h-2.5 w-2.5 rounded-full ${syncing ? 'bg-[var(--rv-yellow)] animate-pulse' : 'bg-[var(--rv-green)]'}`} />
                    <span className="ml-2">{syncing ? 'Sync in progress' : formatLastSync(lastSync)}</span>
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto flex max-w-[1720px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <section className="rv-panel rv-panel-strong px-6 py-8 sm:px-8 lg:px-12 lg:py-12">
              <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-4xl">
                  <p className="rv-kicker mb-4">Training Overview</p>
                  <h1 className="rv-metric text-6xl sm:text-7xl xl:text-[5.8rem]">
                    Track progress without the clutter.
                  </h1>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--rv-text-dim)] sm:text-base">
                    See your recent training, compare effort over time, manage shoe usage, and jump into route planning or form review.
                  </p>
                </div>
                <div className="grid w-full gap-4 sm:grid-cols-3 xl:max-w-xl">
                  <HeroStat label="Runs Shown" value={filteredActivities.filter(isRun).length.toString()} unit="SESSIONS" />
                  <HeroStat label="Shoes Tracked" value={allShoes.length.toString()} unit="SHOES" accent="blue" />
                  <HeroStat label="Time Range" value={viewPeriod.mode === 'all' ? 'LIVE' : viewPeriod.mode.toUpperCase()} unit="FILTER" accent="yellow" />
                </div>
              </div>
            </section>

            <StatsOverview activities={filteredActivities} allActivities={activities} period={viewPeriod} />

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="space-y-6 xl:col-span-8">
                <FitnessChart activities={activities} period={viewPeriod} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <section className="rv-panel px-5 py-5 sm:px-7 sm:py-6 lg:col-span-5">
                    <div className="mb-6 flex items-center justify-between gap-3">
                      <div>
                        <p className="rv-kicker mb-2">Training Calendar</p>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--rv-text)]">Runs by day</h2>
                      </div>
                      <span className="hidden text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)] sm:inline">Click a day to inspect a run</span>
                    </div>
                    <CalendarHeatmap
                      activities={activities}
                      year={viewPeriod.mode !== 'all' ? viewPeriod.year : undefined}
                      month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
                      onSelectDay={handleSelectDay}
                      selectedDate={selectedActivity?.start_date_local.split('T')[0]}
                    />
                  </section>

                  <section className="rv-panel px-5 py-5 sm:px-7 sm:py-6 lg:col-span-7">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="rv-kicker mb-2">Tools</p>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--rv-text)]">Planner and form lab</h2>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Link to="/plan-route" className="rv-panel rv-panel-accent block px-5 py-5 transition hover:-translate-y-1">
                        <p className="rv-kicker mb-3">Route Planner</p>
                        <h3 className="mb-3 text-2xl font-bold italic tracking-tight text-[var(--rv-text)]">Plan your next route</h3>
                        <p className="text-sm leading-6 text-[var(--rv-text-dim)]">Choose a starting point, set a distance target, and export a route as GPX.</p>
                      </Link>
                      <Link to="/form-analysis" className="rv-panel block px-5 py-5 transition hover:-translate-y-1 hover:border-[var(--rv-blue)]/40">
                        <p className="rv-kicker mb-3">Form Lab</p>
                        <h3 className="mb-3 text-2xl font-bold italic tracking-tight text-[var(--rv-text)]">Review running form</h3>
                        <p className="text-sm leading-6 text-[var(--rv-text-dim)]">Upload a video, match it to a run, and save a form analysis you can revisit later.</p>
                      </Link>
                    </div>
                  </section>
                </div>
              </div>

              <div className="space-y-6 xl:col-span-4">
                <RaceTimePredictions activities={activities} period={viewPeriod} />
                <ShoeTracker
                  activities={filteredActivities}
                  shoes={allShoes}
                  selectedShoeId={selectedShoeId}
                  onSelectShoe={(id) => setSelectedShoeId(prev => prev === id ? null : id)}
                />
              </div>
            </section>

            <ActivityList
              activities={filteredActivities}
              limit={50}
              onSelect={setSelectedActivity}
              selectedShoeId={selectedShoeId}
              selectedShoeName={selectedShoeName}
              onClearShoeFilter={() => setSelectedShoeId(null)}
              shoes={allShoes}
            />
          </main>

          <footer className="border-t border-white/5 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1720px] flex-col gap-4 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)] sm:flex-row sm:items-center sm:justify-between">
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
      <span className="rounded-full border border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--rv-yellow)]">
        {compact ? 'Running Lab' : 'Running Training Lab'}
      </span>
    </div>
  );
}

function HeroStat({
  label,
  value,
  unit,
  accent = 'green',
}: {
  label: string;
  value: string;
  unit: string;
  accent?: 'green' | 'blue' | 'yellow';
}) {
  const accentClass = accent === 'yellow'
    ? 'text-[var(--rv-yellow)]'
    : accent === 'blue'
      ? 'text-[var(--rv-blue)]'
      : 'text-[var(--rv-green)]';

  return (
    <div className="rv-panel px-4 py-4 sm:px-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">{label}</div>
      <div className={`rv-metric mt-4 text-5xl ${accentClass}`}>{value}</div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">{unit}</div>
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
  if (!lastSync) return 'No sync yet';
  return `Last sync ${lastSync.toLocaleDateString()}`;
}

export default App;
