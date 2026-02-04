import { useMemo } from 'react';
import type { Activity } from '../types';
import { isRun } from '../types';

interface StatsOverviewProps {
    activities: Activity[];
    period: {
        mode: 'all' | 'year' | 'month';
        year: number;
        month: number | null;
    };
}

export function StatsOverview({ activities, period }: StatsOverviewProps) {
    const stats = useMemo(() => {
        // Filter activities by period
        const filteredActivities = activities.filter((a) => {
            if (!isRun(a)) return false;

            const date = new Date(a.start_date_local);
            const year = date.getFullYear();
            const month = date.getMonth();

            if (period.mode === 'all') return true;
            if (period.mode === 'year') return year === period.year;
            if (period.mode === 'month') return year === period.year && month === period.month;

            return false;
        });

        // Basic stats
        const totalDistance = filteredActivities.reduce((sum, a) => sum + a.distance, 0);
        const totalTime = filteredActivities.reduce((sum, a) => sum + a.moving_time, 0);
        const avgPace = totalDistance > 0 ? (totalTime / totalDistance) * 1000 / 60 : 0;
        const longestRunDistance = filteredActivities.reduce((max, a) => Math.max(max, a.distance), 0);

        // Streak calculation
        const streakData = calculateStreaks(filteredActivities);

        return {
            runCount: filteredActivities.length,
            totalDistance: totalDistance / 1000, // km
            avgDistance: filteredActivities.length > 0 ? (totalDistance / 1000) / filteredActivities.length : 0,
            avgPace,
            longestRun: longestRunDistance / 1000,
            ...streakData
        };
    }, [activities, period]);

    const formatPace = (pace: number) => {
        const mins = Math.floor(pace);
        const secs = Math.round((pace - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
                label="Runs"
                value={stats.runCount.toString()}
                unit=""
                icon="🏃"
            />
            <StatCard
                label="Distance"
                value={stats.totalDistance.toFixed(1)}
                unit="km"
                icon="📏"
            />
            <StatCard
                label="Avg Pace"
                value={stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--'}
                unit="/km"
                icon="⚡"
            />
            <StatCard
                label="Longest"
                value={stats.longestRun.toFixed(1)}
                unit="km"
                icon="🏆"
            />
            <StatCard
                label="Max Streak"
                value={stats.longestStreak.toString()}
                unit="days"
                icon="🔥"
                color="text-orange-400"
            />
            <StatCard
                label="Avg Dist"
                value={stats.avgDistance.toFixed(1)}
                unit="km"
                icon="📏"
                color="text-blue-400"
            />
        </div>
    );
}

function calculateStreaks(activities: Activity[]) {
    if (activities.length === 0) return { longestStreak: 0, longestBreak: 0 };

    // Get unique dates with runs
    const runDates = new Set(
        activities.map(a => new Date(a.start_date_local).toISOString().split('T')[0])
    );

    const sortedDates = Array.from(runDates).sort();
    let longestStreak = 0;
    let currentStreak = 0;

    // Streak logic
    if (sortedDates.length > 0) {
        currentStreak = 1;
        longestStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
            const d1 = new Date(sortedDates[i - 1]);
            const d2 = new Date(sortedDates[i]);
            const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
            longestStreak = Math.max(longestStreak, currentStreak);
        }
    }

    // Break logic
    let longestBreak = 0;
    for (let i = 1; i < sortedDates.length; i++) {
        const d1 = new Date(sortedDates[i - 1]);
        const d2 = new Date(sortedDates[i]);
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) - 1;
        longestBreak = Math.max(longestBreak, diffDays);
    }

    return { longestStreak, longestBreak };
}

interface StatCardProps {
    label: string;
    value: string;
    unit: string;
    icon: string;
    color?: string;
}

function StatCard({ label, value, unit, icon, color = "text-white" }: StatCardProps) {
    return (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 hover:border-white/20 transition-all duration-300 group">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xl group-hover:scale-110 transition-transform duration-300">{icon}</span>
                <span className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">{label}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-black tracking-tighter ${color}`}>{value}</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{unit}</span>
            </div>
        </div>
    );
}
