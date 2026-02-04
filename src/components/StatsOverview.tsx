import { useMemo } from 'react';
import type { Activity } from '../types';
import { formatDuration } from '../analytics/heartRateZones';

interface StatsOverviewProps {
    activities: Activity[];
    period: 'week' | 'month' | 'year' | 'all';
}

export function StatsOverview({ activities, period }: StatsOverviewProps) {
    const stats = useMemo(() => {
        const now = new Date();
        let startDate: Date;

        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(0);
        }

        const runs = activities.filter((a) => {
            const date = new Date(a.start_date_local);
            return (a.type === 'Run' || a.sport_type === 'Run') && date >= startDate;
        });

        const totalDistance = runs.reduce((sum, a) => sum + a.distance, 0);
        const totalTime = runs.reduce((sum, a) => sum + a.moving_time, 0);
        const totalElevation = runs.reduce((sum, a) => sum + a.total_elevation_gain, 0);
        const avgPace = totalDistance > 0 ? (totalTime / totalDistance) * 1000 / 60 : 0;

        return {
            runCount: runs.length,
            totalDistance: totalDistance / 1000, // km
            totalTime,
            totalElevation,
            avgPace,
        };
    }, [activities, period]);

    const formatPace = (pace: number) => {
        const mins = Math.floor(pace);
        const secs = Math.round((pace - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                label="Time"
                value={formatDuration(stats.totalTime)}
                unit=""
                icon="⏱️"
            />
            <StatCard
                label="Avg Pace"
                value={stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--'}
                unit="/km"
                icon="⚡"
            />
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: string;
    unit: string;
    icon: string;
}

function StatCard({ label, value, unit, icon }: StatCardProps) {
    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{icon}</span>
                <span className="text-sm text-gray-400">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{value}</span>
                <span className="text-sm text-gray-400">{unit}</span>
            </div>
        </div>
    );
}
