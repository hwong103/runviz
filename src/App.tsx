import { useState, useMemo } from 'react';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
import { StatsOverview } from './components/StatsOverview';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { ActivityList } from './components/ActivityList';
import { FitnessChart } from './components/FitnessChart';
import { ActivityScatterChart } from './components/ActivityScatterChart';
import { MileageTrendChart } from './components/MileageTrendChart';

interface ViewPeriod {
  mode: 'all' | 'year' | 'month';
  year: number;
  month: number | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function App() {
  const { isAuthenticated, athlete, loading: authLoading, login, logout } = useAuth();
  const { activities, syncing, sync, lastSync } = useActivities();
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
    mode: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

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
      if (a.type !== 'Run' && a.sport_type !== 'Run') return false;
      const date = new Date(a.start_date_local);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (viewPeriod.mode === 'all') return true;
      if (viewPeriod.mode === 'year') return year === viewPeriod.year;
      if (viewPeriod.mode === 'month') return year === viewPeriod.year && month === viewPeriod.month;
      return false;
    });
  }, [activities, viewPeriod]);

  // --- Conditional Returns MUST happen after all Hooks ---

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-white text-xl font-medium">Loading RunViz...</div>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
            <h1 className="text-5xl font-extrabold text-white mb-2 tracking-tight italic">
              <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                RUNVIZ
              </span>
            </h1>
            <p className="text-gray-400 mb-8 text-lg">
              Unlock your Strava history with elite analytics.
            </p>

            <button
              onClick={login}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
                <path d="M15.387 0L0 24h6.128l3.054-6.172h3.065L15.387 24l9.109-18.172h6.063L15.387 0z" opacity="0.6" />
              </svg>
              Connect with Strava
            </button>

            <div className="mt-10 grid grid-cols-2 gap-4 text-left">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <span className="text-emerald-400 block font-bold text-lg">FREE</span>
                <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Analytics</span>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <span className="text-blue-400 block font-bold text-lg">SMASHRUN</span>
                <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Parity</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-gray-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0c10]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🏃‍♂️</span>
            <h1 className="text-2xl font-black italic tracking-tighter">
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                RUNVIZ
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => sync()}
              disabled={syncing}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm ${syncing
                ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                : 'bg-white/5 hover:bg-white/10 text-white'
                }`}
            >
              <span>{syncing ? '⌛' : '🔄'}</span>
              <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync Data'}</span>
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-white/10 text-sm">
              <span className="text-gray-400 hidden lg:inline font-medium">Hello,</span>
              <span className="font-bold text-white">{athlete?.firstname}</span>
              {athlete?.profile && (
                <img src={athlete.profile} className="w-8 h-8 rounded-full border border-white/20" alt="Profile" />
              )}
              <button
                onClick={logout}
                className="text-gray-500 hover:text-white transition-colors ml-2 font-bold"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Navigation / Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white/5 p-6 rounded-3xl border border-white/10">
          <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5">
            {(['all', 'year', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewPeriod(prev => ({ ...prev, mode }))}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${viewPeriod.mode === mode
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-gray-500 hover:text-white'
                  }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {viewPeriod.mode !== 'all' && (
              <select
                value={viewPeriod.year}
                onChange={(e) => setViewPeriod(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                className="bg-black/60 text-white px-5 py-3 rounded-xl border border-white/10 outline-none focus:border-emerald-500 transition-colors font-bold text-sm"
              >
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}

            {viewPeriod.mode === 'month' && (
              <select
                value={viewPeriod.month || 0}
                onChange={(e) => setViewPeriod(prev => ({ ...prev, month: parseInt(e.target.value) }))}
                className="bg-black/60 text-white px-5 py-3 rounded-xl border border-white/10 outline-none focus:border-emerald-500 transition-colors font-bold text-sm"
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}

            {lastSync && (
              <div className="text-[10px] text-gray-600 uppercase font-black tracking-widest hidden sm:block pl-4 border-l border-white/5">
                Sync: {lastSync.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Highlight Stats */}
        <StatsOverview activities={activities} period={viewPeriod} />

        {/* Charts & Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="lg:col-span-2">
            <MileageTrendChart activities={activities} viewMode={viewPeriod.mode} />
          </div>

          <ActivityScatterChart activities={filteredActivities} />
          <FitnessChart activities={activities} />

          <div className="lg:col-span-2">
            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                <span className="text-2xl">📊</span>
                Activity Frequency
              </h3>
              <CalendarHeatmap
                activities={activities}
                year={viewPeriod.mode !== 'all' ? viewPeriod.year : undefined}
                month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <ActivityList activities={filteredActivities} limit={50} />
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-16 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-gray-600 text-[10px] font-black uppercase tracking-[0.4em] mb-6">RunViz Project</div>
          <p className="text-gray-500 text-sm font-medium">
            Powered by Strava. Built for athletes.{' '}
            <a href="https://github.com/hwong103/runviz" className="text-emerald-500 hover:text-emerald-400 transition-colors font-bold underline underline-offset-4">Open Source</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
