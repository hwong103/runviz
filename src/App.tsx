import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
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
  const { isAuthenticated, athlete, loading: authLoading, login, logout } = useAuth();
  const { activities, syncing, sync, lastSync } = useActivities();
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
    mode: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedShoeId, setSelectedShoeId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Store additionally fetched gear (e.g. retired shoes not in athlete profile)
  const [additionalGear, setAdditionalGear] = useState<Map<string, Gear>>(new Map());
  // Track request lifecycle so we do not repeatedly fetch failed/in-flight gear IDs.
  const inFlightGearIds = useRef<Set<string>>(new Set());
  const failedGearIds = useRef<Map<string, number>>(new Map());
  const gearFetchCount = useRef(0);

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
        <div className="rv-panel rv-panel-strong flex w-full max-w-5xl flex-col gap-10 overflow-hidden px-6 py-8 sm:px-10 lg:flex-row lg:items-end lg:px-12 lg:py-12">
          <div className="flex-1 space-y-6">
            <p className="rv-kicker">Session Intelligence</p>
            <BrandWordmark />
            <h1 className="rv-metric max-w-2xl text-5xl sm:text-6xl lg:text-7xl">
              Elite training analytics for runners who care about the details.
            </h1>
            <p className="max-w-xl text-base leading-7 text-[var(--rv-text-dim)] sm:text-lg">
              Bring in your Strava history, monitor training load, explore routes, and inspect form without losing the raw metrics that matter.
            </p>
            <div className="flex flex-wrap gap-3 text-left">
              <span className="rv-chip">Training load intelligence</span>
              <span className="rv-chip">Route generation + GPX export</span>
              <span className="rv-chip">Video-based form analysis</span>
            </div>
          </div>
          <div className="rv-panel w-full max-w-md border-[var(--rv-border-strong)]/70 px-6 py-8 sm:px-8">
            <p className="rv-kicker mb-4">Connect Strava</p>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--rv-text)]">Open the performance lab</h2>
            <p className="mb-8 text-sm leading-6 text-[var(--rv-text-dim)]">
              Authenticate once to unlock your history, benchmark your training blocks, and keep the full dashboard in sync.
            </p>
            <button
              onClick={login}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-[var(--rv-blue)] px-8 py-4 text-sm font-bold uppercase tracking-[0.28em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#0aa8ef] active:translate-y-0"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
                <path d="M15.387 0L0 24h6.128l3.054-6.172h3.065L15.387 24l9.109-18.172h6.063L15.387 0z" opacity="0.6" />
              </svg>
              Connect Strava
            </button>
            <p className="mt-4 text-xs uppercase tracking-[0.25em] text-[var(--rv-text-faint)]">Data remains anchored to your existing RunViz metrics and history.</p>
          </div>
        </div>
      </div>
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

      <div className="flex min-h-screen">
        <aside className="hidden w-24 shrink-0 border-r border-white/5 bg-[#03131f]/90 px-4 py-6 lg:flex lg:flex-col lg:items-center lg:justify-between">
          <div className="space-y-6">
            <div className="flex justify-center">
              <LabGlyph className="h-8 w-8 text-[var(--rv-blue)]" />
            </div>
            <nav className="space-y-4">
              <SidebarLink label="Dashboard" active>
                <DashboardGlyph />
              </SidebarLink>
              <SidebarLink label="Planner" to="/plan-route">
                <MapGlyph />
              </SidebarLink>
              <SidebarLink label="Form Lab" to="/form-analysis">
                <LabGlyph />
              </SidebarLink>
            </nav>
          </div>

          {athlete?.profile ? (
            <button
              onClick={() => setIsMenuOpen((open) => !open)}
              className="relative flex h-[3.25rem] w-[3.25rem] items-center justify-center overflow-hidden rounded-full border border-white/[0.15] bg-white/5 transition hover:border-[var(--rv-blue)]/60"
            >
              <img src={athlete.profile} alt="Profile" className="h-full w-full object-cover" />
            </button>
          ) : (
            <button
              onClick={() => setIsMenuOpen((open) => !open)}
              className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-bold uppercase tracking-[0.25em] text-[var(--rv-text-dim)]"
            >
              RV
            </button>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-white/5 bg-[#051723]/88 backdrop-blur-2xl">
            <div className="mx-auto flex max-w-[1720px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="lg:hidden">
                    <LabGlyph className="h-8 w-8 text-[var(--rv-blue)]" />
                  </div>
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
                    className={`rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.28em] transition ${syncing
                      ? 'cursor-wait border border-white/10 bg-white/5 text-[var(--rv-text-faint)]'
                      : 'border border-[var(--rv-blue)]/45 bg-[var(--rv-blue)]/18 text-[var(--rv-text)] hover:-translate-y-0.5 hover:bg-[var(--rv-blue)]/24'
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
                        <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Athlete #{athlete?.id}</div>
                      </div>
                    </button>

                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                        <div className="rv-panel rv-panel-strong absolute right-0 z-50 mt-3 w-72 overflow-hidden p-2">
                          <div className="border-b border-white/5 px-4 py-4">
                            <div className="text-sm font-bold text-[var(--rv-text)]">{athleteLabel}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Athlete #{athlete?.id}</div>
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

                  <span className="rv-chip">
                    <span className={`h-2.5 w-2.5 rounded-full ${syncing ? 'bg-[var(--rv-yellow)] animate-pulse' : 'bg-[var(--rv-green)]'}`} />
                    {syncing ? 'Sync in progress' : formatLastSync(lastSync)}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto flex max-w-[1720px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <section className="rv-panel rv-panel-strong rv-grid-lines relative overflow-hidden px-6 py-7 sm:px-8 lg:px-10 lg:py-10">
              <div className="absolute -right-24 top-0 h-56 w-56 rounded-full bg-[var(--rv-blue)]/12 blur-[100px]" />
              <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-[var(--rv-yellow)]/8 blur-[90px]" />
              <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-4xl">
                  <p className="rv-kicker mb-4">Session Intelligence</p>
                  <h1 className="rv-metric text-5xl sm:text-6xl xl:text-7xl">
                    Morning run data, route planning, and form review in one cockpit.
                  </h1>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--rv-text-dim)] sm:text-base">
                    The numbers stay untouched. This refresh simply reorganizes the existing metrics, sync controls, and analysis tools into a sharper performance-lab interface.
                  </p>
                </div>
                <div className="grid w-full gap-4 sm:grid-cols-3 xl:max-w-xl">
                  <HeroStat label="Visible Runs" value={filteredActivities.filter(isRun).length.toString()} unit="SESSIONS" />
                  <HeroStat label="Known Gear" value={allShoes.length.toString()} unit="SHOES" accent="blue" />
                  <HeroStat label="Current Filter" value={viewPeriod.mode === 'all' ? 'LIVE' : viewPeriod.mode.toUpperCase()} unit="WINDOW" accent="yellow" />
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
                        <p className="rv-kicker mb-2">Activity Frequency</p>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--rv-text)]">Temporal consistency</h2>
                      </div>
                      <span className="rv-chip hidden sm:inline-flex">Click any day to inspect the run</span>
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
                        <p className="rv-kicker mb-2">System Modules</p>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--rv-text)]">Planner and lab workflows</h2>
                      </div>
                      <span className="text-xs uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Keep existing behavior, sharper shell</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Link to="/plan-route" className="rv-panel rv-panel-accent block px-5 py-5 transition hover:-translate-y-1">
                        <p className="rv-kicker mb-3">Route Planner</p>
                        <h3 className="mb-3 text-2xl font-bold italic tracking-tight text-[var(--rv-text)]">Generate routes and export GPX</h3>
                        <p className="text-sm leading-6 text-[var(--rv-text-dim)]">Search a start point, use map clicks, generate candidates, and keep the export flow intact.</p>
                      </Link>
                      <Link to="/form-analysis" className="rv-panel block px-5 py-5 transition hover:-translate-y-1 hover:border-[var(--rv-blue)]/40">
                        <p className="rv-kicker mb-3">Form Lab</p>
                        <h3 className="mb-3 text-2xl font-bold italic tracking-tight text-[var(--rv-text)]">Analyze run mechanics locally</h3>
                        <p className="text-sm leading-6 text-[var(--rv-text-dim)]">Upload a clip, match it to a run, process cadence and posture metrics, and write back to Strava when needed.</p>
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
              <span>Active protocol: Navigation v4.2</span>
              <span>Geo-engine: Strava enterprise API</span>
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
      <span className="rounded-full border border-[var(--rv-blue)]/35 bg-[var(--rv-blue)]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--rv-blue)]">
        {compact ? 'Planner' : 'Performance Lab'}
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
      <div className={`rv-metric mt-4 text-4xl ${accentClass}`}>{value}</div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">{unit}</div>
    </div>
  );
}

function SidebarLink({
  children,
  label,
  to = '/',
  active = false,
}: {
  children: ReactNode;
  label: string;
  to?: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group flex h-14 w-14 items-center justify-center rounded-2xl border transition ${active
        ? 'border-[var(--rv-blue)]/55 bg-[var(--rv-blue)]/16 text-[var(--rv-text)] shadow-[0_12px_30px_rgba(0,147,214,0.18)]'
        : 'border-white/5 bg-white/[0.04] text-[var(--rv-text-faint)] hover:border-white/[0.15] hover:text-[var(--rv-text)]'
        }`}
      aria-label={label}
      title={label}
    >
      <span className="transition group-hover:scale-110">{children}</span>
    </Link>
  );
}

function DashboardGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
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
  if (!lastSync) return 'Awaiting first sync';
  return `Last sync ${lastSync.toLocaleDateString()}`;
}

export default App;
