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
import { useChartTheme } from '../hooks/useChartTheme';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { buildFitnessPayload } from '@/utils/insightPayloads';

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
    allActivities?: Activity[];
    period: {
        mode: 'all' | 'year' | 'month' | '30d' | '90d' | '365d';
        year: number;
        month: number | null;
    };
    maxHR?: number;
    restHR?: number;
    mostRecentActivityId?: number;
}

export function FitnessChart({ activities, allActivities, period, maxHR = 185, restHR = 60, mostRecentActivityId }: FitnessChartProps) {
    const chartTheme = useChartTheme();

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
        } else if (period.mode === '30d') {
            endDate = startOfDay(new Date());
            startDate = subDays(endDate, 30);
        } else if (period.mode === '90d') {
            endDate = startOfDay(new Date());
            startDate = subDays(endDate, 90);
        } else if (period.mode === '365d') {
            endDate = startOfDay(new Date());
            startDate = subDays(endDate, 365);
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
                borderColor: chartTheme.primaryLine,
                backgroundColor: chartTheme.primaryFill,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Fatigue (ATL)',
                data: metrics.map((m) => m.atl),
                borderColor: chartTheme.secondaryLine,
                backgroundColor: chartTheme.secondaryFill,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Form (TSB)',
                data: metrics.map((m) => m.tsb),
                borderColor: chartTheme.tertiaryLine,
                backgroundColor: chartTheme.tertiaryFill,
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
                        color: chartTheme.legendColor,
                        usePointStyle: true,
                        padding: 20,
                        boxWidth: 8,
                    },
                },
                tooltip: {
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: chartTheme.tooltipTitle,
                    bodyColor: chartTheme.tooltipBody,
                    borderColor: chartTheme.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        afterBody: (items: Array<{ dataIndex: number }>) => {
                            const first = items[0];
                            if (!first) return [];
                            const payload = metrics[first.dataIndex];
                            return payload ? [`TRIMP: ${payload.trimp}`] : [];
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: chartTheme.gridColor },
                    ticks: { color: chartTheme.tickColor, maxTicksLimit: 10 },
                },
                y: {
                    grid: { color: chartTheme.gridColor },
                    ticks: { color: chartTheme.tickColor },
                },
            },
        };

    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <div>
                    <p className="rv-kicker mb-2">Training Load</p>
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--rv-text)]">
                        Fitness, fatigue, and form
                    </h2>
                    <p className="mt-2 max-w-[52ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                        CTL tracks longer-term fitness, ATL captures recent fatigue, and TSB shows how fresh you are heading into the next session.
                    </p>
                </div>

                <div
                    className="sm:ml-auto rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.24em]"
                    style={{ backgroundColor: `${interpretation.color}20`, color: interpretation.color, border: `1px solid ${interpretation.color}40` }}
                >
                    Form status: {interpretation.description}
                </div>
            </div>

            <div className="h-56 sm:h-60">
                {metrics.length > 0 ? (
                    <Line data={chartData} options={options} />
                ) : (
                    <div className="flex h-full items-center justify-center text-[var(--rv-text-dim)]">
                        No activity data for this period
                    </div>
                )}
            </div>

            {/* Current values */}
            <div className="mt-5 grid grid-cols-1 gap-0 border-t border-[color-mix(in_srgb,var(--rv-text)_8%,transparent)] pt-5 min-[420px]:grid-cols-3">
                <div className="border-b border-[var(--rv-border)] px-1 py-3 text-center min-[420px]:border-b-0 min-[420px]:border-r">
                    <div className="rv-data text-3xl text-[var(--rv-text)]">
                        {displayMetric ? displayMetric.ctl.toFixed(0) : '-'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Fitness (CTL)</div>
                </div>
                <div className="border-b border-[var(--rv-border)] px-1 py-3 text-center min-[420px]:border-b-0 min-[420px]:border-r">
                    <div className="rv-data text-3xl text-[var(--rv-text)]">
                        {displayMetric ? displayMetric.atl.toFixed(0) : '-'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Fatigue (ATL)</div>
                </div>
                <div className="px-1 py-3 text-center">
                    <div className="rv-data text-3xl text-[var(--rv-text)]">
                        {displayMetric ? displayMetric.tsb.toFixed(0) : '-'}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">Form (TSB)</div>
                </div>
            </div>

            {mostRecentActivityId && allActivities && (
                <div className="mt-5">
                    <AIInsightCard
                        insightType="fitness"
                        payload={buildFitnessPayload(allActivities)}
                        mostRecentActivityId={mostRecentActivityId}
                        windowLabel="Based on last 60 days"
                    />
                </div>
            )}
        </div>
    );
}
