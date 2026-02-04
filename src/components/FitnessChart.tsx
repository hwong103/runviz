import { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, startOfDay } from 'date-fns';
import type { Activity } from '../types';
import {
    activitiesToDailyLoads,
    calculateTrainingLoadHistory,
    interpretTSB,
} from '../analytics/trainingLoad';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface FitnessChartProps {
    activities: Activity[];
    period: {
        mode: 'all' | 'year' | 'month';
        year: number;
        month: number | null;
    };
    maxHR?: number;
    restHR?: number;
}

export function FitnessChart({ activities, period, maxHR = 185, restHR = 60 }: FitnessChartProps) {
    const metrics = useMemo(() => {
        if (activities.length === 0) return [];

        const dailyLoads = activitiesToDailyLoads(activities, maxHR, restHR);

        let startDate: Date;
        let endDate: Date;

        if (period.mode === 'month' && period.month !== null) {
            startDate = startOfMonth(new Date(period.year, period.month));
            endDate = endOfMonth(startDate);
        } else if (period.mode === 'year') {
            startDate = startOfYear(new Date(period.year, 0));
            endDate = endOfYear(startDate);
        } else {
            // All time - show last 180 days for clarity (CTL needs long history but display doesn't have to)
            endDate = startOfDay(new Date());
            startDate = subDays(endDate, 180);
        }

        // We calculate from the beginning of time to ensure CTL is accurate, 
        // but we only display the requested window.
        // Actually calculateTrainingLoadHistory handles the rolling calculation.
        // We just need to give it a start date.
        return calculateTrainingLoadHistory(dailyLoads, startDate, endDate);
    }, [activities, period, maxHR, restHR]);

    const latestTSB = metrics.length > 0 ? metrics[metrics.length - 1].tsb : 0;
    const interpretation = interpretTSB(latestTSB);

    const chartData = {
        labels: metrics.map((m) => {
            const date = new Date(m.date);
            return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        }),
        datasets: [
            {
                label: 'Fitness (CTL)',
                data: metrics.map((m) => m.ctl),
                borderColor: '#22C55E',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Fatigue (ATL)',
                data: metrics.map((m) => m.atl),
                borderColor: '#F97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Form (TSB)',
                data: metrics.map((m) => m.tsb),
                borderColor: '#8B5CF6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'top' as const,
                labels: {
                    color: '#9CA3AF',
                    usePointStyle: true,
                    padding: 20,
                    boxWidth: 8,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                titleColor: '#fff',
                bodyColor: '#9CA3AF',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6B7280', maxTicksLimit: 10 },
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6B7280' },
            },
        },
    };

    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>💪</span>
                    <span>Fitness & Freshness</span>
                </h2>

                <div
                    className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: `${interpretation.color}20`, color: interpretation.color, border: `1px solid ${interpretation.color}40` }}
                >
                    {interpretation.description}
                </div>
            </div>

            <div className="h-64">
                {metrics.length > 0 ? (
                    <Line data={chartData} options={options} />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        No activity data for this period
                    </div>
                )}
            </div>

            {/* Current values */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
                <div className="text-center">
                    <div className="text-2xl font-black text-emerald-400">
                        {metrics.length > 0 ? metrics[metrics.length - 1].ctl.toFixed(0) : '-'}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Fitness</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-black text-orange-400">
                        {metrics.length > 0 ? metrics[metrics.length - 1].atl.toFixed(0) : '-'}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Fatigue</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-black text-purple-400">
                        {metrics.length > 0 ? metrics[metrics.length - 1].tsb.toFixed(0) : '-'}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Form</div>
                </div>
            </div>
        </div>
    );
}
