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
    maxHR?: number;
    restHR?: number;
}

export function FitnessChart({ activities, maxHR = 185, restHR = 60 }: FitnessChartProps) {
    const metrics = useMemo(() => {
        if (activities.length === 0) return [];

        const dailyLoads = activitiesToDailyLoads(activities, maxHR, restHR);

        // Calculate for last 90 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        return calculateTrainingLoadHistory(dailyLoads, startDate, endDate);
    }, [activities, maxHR, restHR]);

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
            },
            {
                label: 'Fatigue (ATL)',
                data: metrics.map((m) => m.atl),
                borderColor: '#F97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                fill: true,
                tension: 0.4,
            },
            {
                label: 'Form (TSB)',
                data: metrics.map((m) => m.tsb),
                borderColor: '#8B5CF6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top' as const,
                labels: {
                    color: '#9CA3AF',
                    usePointStyle: true,
                    padding: 20,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>💪</span>
                    <span>Fitness & Freshness</span>
                </h2>

                <div
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: `${interpretation.color}20`, color: interpretation.color }}
                >
                    {interpretation.description}
                </div>
            </div>

            <div className="h-64">
                {metrics.length > 0 ? (
                    <Line data={chartData} options={options} />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        No activity data to display
                    </div>
                )}
            </div>

            {/* Current values */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/10">
                <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">
                        {metrics.length > 0 ? metrics[metrics.length - 1].ctl.toFixed(0) : '-'}
                    </div>
                    <div className="text-xs text-gray-400">Fitness</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-orange-400">
                        {metrics.length > 0 ? metrics[metrics.length - 1].atl.toFixed(0) : '-'}
                    </div>
                    <div className="text-xs text-gray-400">Fatigue</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">
                        {metrics.length > 0 ? metrics[metrics.length - 1].tsb.toFixed(0) : '-'}
                    </div>
                    <div className="text-xs text-gray-400">Form</div>
                </div>
            </div>
        </div>
    );
}
