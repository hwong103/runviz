import { useMemo } from 'react';
import {
    BarController,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { TrendingUp } from 'lucide-react';
import type { Activity } from '@/types/activity';
import { computeWeeklyVolume } from '@/analytics/weeklyVolume';
import { useChartTheme } from '@/hooks/useChartTheme';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    BarController,
    PointElement,
    LineElement,
    LineController,
    Tooltip,
    Legend,
    Filler
);

interface WeeklyRampChartProps {
    activities: Activity[];
}

export function WeeklyRampChart({ activities }: WeeklyRampChartProps) {
    const chartTheme = useChartTheme();
    const buckets = useMemo(() => computeWeeklyVolume(activities), [activities]);

    const data = useMemo(() => ({
        labels: buckets.map((bucket) => bucket.weekLabel),
        datasets: [
            {
                type: 'bar' as const,
                label: 'Weekly km',
                data: buckets.map((bucket) => Number(bucket.totalKm.toFixed(1))),
                backgroundColor: buckets.map((bucket) =>
                    bucket.isWarning ? 'rgba(251, 191, 36, 0.6)' : chartTheme.accentBg
                ),
                borderRadius: 4,
                yAxisID: 'y',
            },
            {
                type: 'line' as const,
                label: '4-week avg',
                data: buckets.map((_, index) => {
                    const slice = buckets.slice(Math.max(0, index - 3), index + 1);
                    return Number((slice.reduce((sum, bucket) => sum + bucket.totalKm, 0) / slice.length).toFixed(1));
                }),
                borderColor: 'rgba(52, 211, 153, 1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4,
                fill: false,
                yAxisID: 'y',
            },
        ],
    }), [buckets, chartTheme.accentBg]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                labels: {
                    color: chartTheme.legendColor,
                    usePointStyle: true,
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
                        const bucket = buckets[items[0]?.dataIndex ?? -1];
                        if (!bucket?.isWarning || bucket.rampPct === null) return [];
                        return [`⚠️ +${bucket.rampPct.toFixed(0)}% - consider an easy week`];
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: chartTheme.tickColor },
            },
            y: {
                beginAtZero: true,
                grid: { color: chartTheme.gridColor },
                ticks: { color: chartTheme.tickColor },
            },
        },
    };

    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-6">
                <h3 className="flex items-center gap-2 text-lg font-medium text-[var(--rv-text)]">
                    <TrendingUp className="h-[18px] w-[18px] text-[var(--rv-yellow)]" />
                    Weekly volume history
                </h3>
                <p className="mt-2 max-w-[46ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                    Compare each week against the rolling four-week average so rapid changes are easy to spot.
                </p>
            </div>
            <div className="h-[320px]">
                <Chart type="bar" data={data} options={options} />
            </div>
        </div>
    );
}
