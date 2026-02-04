import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useActivities } from './hooks/useActivities';
import { StatsOverview } from './components/StatsOverview';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { ActivityList } from './components/ActivityList';
import { FitnessChart } from './components/FitnessChart';

function App() {
  const { isAuthenticated, athlete, loading: authLoading, login, logout } = useAuth();
  const { activities, syncing, sync, lastSync } = useActivities();
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
            <h1 className="text-4xl font-bold text-white mb-2">
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                RunViz
              </span>
            </h1>
            <p className="text-gray-400 mb-8">
              Beautiful running stats with advanced analytics
            </p>

            <button
              onClick={login}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-500/30"
            >
              <span className="flex items-center justify-center gap-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
                  <path d="M15.387 0L0 24h6.128l3.054-6.172h3.065L15.387 24l9.109-18.172h6.063L15.387 0z" opacity="0.6" />
                </svg>
                Connect with Strava
              </span>
            </button>

            <div className="mt-8 space-y-2 text-sm text-gray-500">
              <p>✓ Free Strava analytics</p>
              <p>✓ Grade Adjusted Pace</p>
              <p>✓ Training Load & Fitness</p>
              <p>✓ Heart Rate Zones</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated - show dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              RunViz
            </span>
          </h1>

          <div className="flex items-center gap-4">
            {/* Sync button */}
            <button
              onClick={() => sync()}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all disabled:opacity-50"
            >
              <span className={syncing ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync'}</span>
            </button>

            {/* Profile */}
            <div className="flex items-center gap-3">
              {athlete?.profile && (
                <img
                  src={athlete.profile}
                  alt={athlete.firstname}
                  className="w-8 h-8 rounded-full border border-white/20"
                />
              )}
              <span className="text-white hidden sm:inline">
                {athlete?.firstname}
              </span>
              <button
                onClick={logout}
                className="text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Period selector */}
        <div className="flex items-center gap-2">
          {(['week', 'month', 'year', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${period === p
                ? 'bg-emerald-500 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}

          {lastSync && (
            <span className="ml-auto text-sm text-gray-500">
              Last sync: {lastSync.toLocaleString()}
            </span>
          )}
        </div>

        {/* Stats overview */}
        <StatsOverview activities={activities} period={period} />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Calendar heatmap */}
          <div className="lg:col-span-2">
            <CalendarHeatmap activities={activities} />
          </div>

          {/* Fitness chart */}
          <FitnessChart activities={activities} />

          {/* Activity list */}
          <ActivityList activities={activities} limit={10} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>
            RunViz - Open source running analytics.{' '}
            <a
              href="https://github.com/hwong103/runviz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Fork on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
