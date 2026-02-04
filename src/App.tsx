import { useState, useMemo, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
import { StatsOverview } from './components/StatsOverview';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { ActivityList } from './components/ActivityList';
import { FitnessChart } from './components/FitnessChart';
import { ActivityScatterChart } from './components/ActivityScatterChart';
import { MileageTrendChart } from './components/MileageTrendChart';
import { RunDetails } from './components/RunDetails';
import { ShoeTracker } from './components/ShoeTracker';
import type { Activity } from './types';
import { isRun } from './types';

interface ViewPeriod {
  mode: 'all' | 'year' | 'month';
  year: number;
  month: number | null;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function App() {
  const { isAuthenticated, athlete, loading: authLoading, login, logout } = useAuth();
  const { activities, syncing, sync } = useActivities();
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
    mode: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  // Calculate available years from activities
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    activities.forEach(a => {
      const year = new Date(a.start_date_local).getFullYear();
      years.add(year);
    });
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  // Filter activities for the current view
  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (!isRun(a)) return false;
      const date = new Date(a.start_date_local);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (viewPeriod.mode === 'all') return true;
      if (viewPeriod.mode === 'year') return year === viewPeriod.year;
      if (viewPeriod.mode === 'month') return year === viewPeriod.year && month === viewPeriod.month;
      return false;
    });
  }, [activities, viewPeriod]);

  const handleSelectDay = useCallback((dateStr: string) => {
    const activity = activities.find(a => {
      if (!isRun(a)) return false;
      return a.start_date_local.startsWith(dateStr);
    });
    if (activity) {
      setSelectedActivity(activity);
    }
  }, [activities]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-white text-xl font-medium tracking-tight">Loading RunViz...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-12 border border-white/10 shadow-2xl">
            <h1 className="text-6xl font-black text-white mb-4 tracking-tighter italic">
              <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                RUNVIZ
              </span>
            </h1>
            <p className="text-gray-400 mb-10 text-lg font-medium leading-relaxed">
              Unlock your Strava history with elite analytics.
            </p>

            <button
              onClick={login}
              className="w-full bg-[#FC4C02] hover:bg-[#E34402] text-white font-black py-5 px-8 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-[#FC4C02]/20 flex items-center justify-center gap-3 text-lg uppercase tracking-widest"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
                <path d="M15.387 0L0 24h6.128l3.054-6.172h3.065L15.387 24l9.109-18.172h6.063L15.387 0z" opacity="0.6" />
              </svg>
              Connect Strava
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-gray-200">
      {selectedActivity && (
        <RunDetails
          activity={selectedActivity}
          allActivities={activities}
          shoes={athlete?.shoes || []}
          onClose={() => setSelectedActivity(null)}
        />
      )}

      {/* Sticky Header with Controls */}
      <header className="sticky top-0 z-50 bg-[#0a0c10]/80 backdrop-blur-2xl border-b border-white/5 py-3">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between gap-8">
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-3xl">🏃‍♂️</span>
            <h1 className="text-2xl font-black italic tracking-tighter hidden lg:block">
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                RUNVIZ
              </span>
            </h1>
          </div>

          {/* Time Controls in Header */}
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/5 max-w-fit">
              {(['all', 'year', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewPeriod(prev => ({ ...prev, mode }))}
                  className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${viewPeriod.mode === mode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'text-gray-500 hover:text-white'
                    }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {viewPeriod.mode !== 'all' && (
              <select
                value={viewPeriod.year}
                onChange={(e) => setViewPeriod(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                className="bg-black/60 text-white px-3 py-2 rounded-xl border border-white/10 outline-none focus:border-emerald-500 transition-colors font-bold text-xs"
              >
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}

            {viewPeriod.mode === 'month' && (
              <select
                value={viewPeriod.month || 0}
                onChange={(e) => setViewPeriod(prev => ({ ...prev, month: parseInt(e.target.value) }))}
                className="bg-black/60 text-white px-3 py-2 rounded-xl border border-white/10 outline-none focus:border-emerald-500 transition-colors font-bold text-xs"
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button
              onClick={() => sync({ forceFull: true })}
              disabled={syncing}
              className={`p-2.5 rounded-xl transition-all ${syncing
                ? 'bg-emerald-500/20 text-emerald-400 animate-spin'
                : 'bg-white/5 hover:bg-white/10 text-white'
                }`}
              title="Sync Strava Data"
            >
              🔄
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              {athlete?.profile && (
                <img src={athlete.profile} className="w-9 h-9 rounded-full border-2 border-emerald-500/20 ring-4 ring-black" alt="Profile" />
              )}
              <div className="hidden sm:flex flex-col">
                <span className="font-black text-xs text-white leading-none">{athlete?.firstname}</span>
                <button onClick={logout} className="text-[9px] text-gray-500 font-bold uppercase tracking-widest hover:text-white transition-colors mt-1">Logout</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-10 space-y-10">
        {/* Highlight Stats */}
        <StatsOverview activities={activities} period={viewPeriod} />

        {/* Top Section: Trends & Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <MileageTrendChart activities={activities} period={viewPeriod} />
          </div>
          <ActivityScatterChart activities={filteredActivities} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <FitnessChart activities={activities} period={viewPeriod} />
          </div>
          <ShoeTracker activities={filteredActivities} shoes={athlete?.shoes || []} />
        </div>

        {/* Bottom Section: Heatmap & List side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10 h-full">
            <h3 className="text-xl font-black text-white mb-8 flex items-center gap-3 tracking-tight">
              <span className="text-2xl">📊</span>
              ACTIVITY FREQUENCY
            </h3>
            <CalendarHeatmap
              activities={activities}
              year={viewPeriod.mode !== 'all' ? viewPeriod.year : undefined}
              month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
              onSelectDay={handleSelectDay}
              selectedDate={selectedActivity?.start_date_local.split('T')[0]}
            />
          </div>

          <ActivityList activities={filteredActivities} limit={50} onSelect={setSelectedActivity} />
        </div>
      </main>

      <footer className="border-t border-white/5 py-20 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="h-[1px] w-12 bg-white/10" />
            <span className="text-gray-600 text-xs font-black uppercase tracking-[0.5em]">RunViz Elite</span>
            <div className="h-[1px] w-12 bg-white/10" />
          </div>
          <p className="text-gray-500 text-sm font-medium">
            Powered by Strava API. Specialized performance analytics.
          </p>
          <p className="mt-4">
            <a href="https://github.com/hwong103/runviz" className="text-emerald-500/50 hover:text-emerald-500 transition-colors text-[10px] font-black uppercase tracking-[0.2em] decoration-emerald-500/20 underline underline-offset-8 decoration-2">GitHub Project Source</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
