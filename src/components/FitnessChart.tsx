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
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, startOfDay, format, parseISO } from 'date-fns';
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

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const displayMetric = useMemo(() => {
        if (metrics.length === 0) return null;
        const todayMatch = metrics.find(m => m.date === todayStr);
        // If viewing current year/month, show today's stats. 
        // If viewing past period, show the last day of that period.
        return todayMatch || metrics[metrics.length - 1];
    }, [metrics, todayStr]);

    const latestTSB = displayMetric ? displayMetric.tsb : 0;
    const interpretation = interpretTSB(latestTSB);

    const chartData = {
        labels: metrics.map((m) => {
            return format(parseISO(m.date), 'd MMM');
        }),
        datasets: [
            {
                label: 'Fitness (CTL)',
                data: metrics.map((m) => m.ctl),
                borderColor: '#13C38B',
                backgroundColor: 'rgba(19, 195, 139, 0.12)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Fatigue (ATL)',
                data: metrics.map((m) => m.atl),
                borderColor: '#FF8E2B',
                backgroundColor: 'rgba(255, 142, 43, 0.12)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Form (TSB)',
                data: metrics.map((m) => m.tsb),
                borderColor: '#FFF917',
                backgroundColor: 'rgba(255, 249, 23, 0.09)',
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
                    color: 'rgba(246, 242, 241, 0.64)',
                    usePointStyle: true,
                    padding: 20,
                    boxWidth: 8,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(6, 21, 31, 0.95)',
                titleColor: '#F6F2F1',
                bodyColor: 'rgba(246, 242, 241, 0.72)',
                borderColor: 'rgba(246, 242, 241, 0.08)',
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(246, 242, 241, 0.05)' },
                ticks: { color: 'rgba(246, 242, 241, 0.34)', maxTicksLimit: 10 },
            },
            y: {
                grid: { color: 'rgba(246, 242, 241, 0.05)' },
                ticks: { color: 'rgba(246, 242, 241, 0.34)' },
            },
        },
    };

    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <div>
                    <p className="rv-kicker mb-2">Performance Lab</p>
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--rv-text)]">
                        Fitness metrics
                    </h2>
                </div>

                <div
                    className="sm:ml-auto rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.24em]"
                    style={{ backgroundColor: `${interpretation.color}20`, color: interpretation.color, border: `1px solid ${interpretation.color}40` }}
                >
                    {interpretation.description}
                </div>
            </div>

            <div className="h-72">
                {metrics.length > 0 ? (
                    <Line data={chartData} options={options} />
                ) : (
                    <div className="flex h-full items-center justify-center text-[var(--rv-text-dim)]">
                        No activity data for this period
                    </div>
                )}
            </div>

            {/* Current values */}
            <div className="mt-6 grid grid-cols-1 gap-3 border-t border-white/5 pt-6 min-[420px]:grid-cols-3">
                <div className="rounded-[1.4rem] border border-white/[0.06] bg-black/[0.15] px-3 py-4 text-center">
                    <div className="rv-metric text-3xl text-[#13C38B]">
                        {displayMetric ? displayMetric.ctl.toFixed(0) : '-'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Fitness</div>
                </div>
                <div className="rounded-[1.4rem] border border-white/[0.06] bg-black/[0.15] px-3 py-4 text-center">
                    <div className="rv-metric text-3xl text-[#FF8E2B]">
                        {displayMetric ? displayMetric.atl.toFixed(0) : '-'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Fatigue</div>
                </div>
                <div className="rounded-[1.4rem] border border-white/[0.06] bg-black/[0.15] px-3 py-4 text-center">
                    <div className="rv-metric text-3xl text-[var(--rv-yellow)]">
                        {displayMetric ? displayMetric.tsb.toFixed(0) : '-'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Form</div>
                </div>
            </div>
        </div>
    );
}
