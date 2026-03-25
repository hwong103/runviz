import { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    BarController,
    PointElement,
    LineElement,
    LineController,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { format, subDays, startOfDay, eachDayOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import type { Activity } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';
import { useChartTheme } from '../hooks/useChartTheme';

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

interface MileageTrendChartProps {
    activities: Activity[];
    period: {
        mode: 'all' | 'year' | 'month';
        year: number;
        month: number | null;
    };
}

export function MileageTrendChart({ activities, period }: MileageTrendChartProps) {
    const chartTheme = useChartTheme();

    const data = useMemo(() => {
        let startDate: Date;
        let endDate: Date;
        let trailingDays = 7;

        if (period.mode === 'month' && period.month !== null) {
            startDate = startOfMonth(new Date(period.year, period.month));
            endDate = endOfMonth(startDate);
            trailingDays = 7;
        } else if (period.mode === 'year') {
            startDate = startOfYear(new Date(period.year, 0));
            endDate = endOfYear(startDate);
            trailingDays = 90;
        } else {
            // All time - show last 2 years from now
            endDate = startOfDay(new Date());
            startDate = subDays(endDate, 730);
            trailingDays = 365;
        }

        const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

        // Group activities by date
        const dailyMileage = new Map<string, number>();
        activities.forEach(a => {
            if (a.type !== 'Run' && a.sport_type !== 'Run') return;
            const date = parseActivityLocalDate(a.start_date_local);
            if (isWithinInterval(date, { start: startDate, end: endDate })) {
                const dateStr = format(date, 'yyyy-MM-dd');
                dailyMileage.set(dateStr, (dailyMileage.get(dateStr) || 0) + a.distance / 1000);
            }
        });

        const labels = dateRange.map(d => format(d, period.mode === 'month' ? 'd' : 'MMM d'));
        const dailyData = dateRange.map(d => dailyMileage.get(format(d, 'yyyy-MM-dd')) || 0);

        // Calculate trailing moving sum (using ALL activities for accurate rolling totals)
        const allRuns = activities
            .filter(a => a.type === 'Run' || a.sport_type === 'Run')
            .sort((a, b) => parseActivityLocalDate(a.start_date_local).getTime() - parseActivityLocalDate(b.start_date_local).getTime());

        const trailingData = dateRange.map(currentDate => {
            const windowStart = subDays(currentDate, trailingDays - 1);
            const windowEnd = currentDate;

            const sum = allRuns
                .filter(a => {
                    const d = parseActivityLocalDate(a.start_date_local);
                    return d >= windowStart && d <= windowEnd;
                })
                .reduce((s, a) => s + a.distance / 1000, 0);

            return sum;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'line' as const,
                    label: `Trailing ${trailingDays}d (km)`,
                    data: trailingData,
                    borderColor: chartTheme.primaryLine,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: true,
                    backgroundColor: chartTheme.primaryFill,
                    yAxisID: 'y1',
                },
                {
                    type: 'bar' as const,
                    label: 'Daily (km)',
                    data: dailyData,
                    backgroundColor: chartTheme.accentBg,
                    borderRadius: 4,
                    yAxisID: 'y',
                },
            ],
        };
    }, [activities, period, chartTheme]);

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
                },
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipTitle,
                bodyColor: chartTheme.tooltipBody,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
            },
        },
        scales: {
            x: {
                grid: {
                    display: false,
                },
                ticks: {
                    color: chartTheme.tickColor,
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: period.mode === 'month' ? 31 : 12,
                },
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Daily km',
                    color: chartTheme.axisColor,
                },
                grid: {
                    color: chartTheme.gridColor,
                },
                ticks: {
                    color: chartTheme.tickColor,
                },
            },
            y1: {
                beginAtZero: true,
                position: 'right' as const,
                title: {
                    display: true,
                    text: 'Trailing km',
                    color: chartTheme.primaryLine,
                },
                grid: {
                    display: false,
                },
                ticks: {
                    color: chartTheme.primaryLine,
                },
            },
        },
    };

    return (
        <div className="rv-panel rv-panel-strong h-[400px] p-6">
            <div className="mb-6">
                <h3 className="flex items-center gap-2 text-lg font-medium text-[var(--rv-text)]">
                    <TrendingUp className="h-[18px] w-[18px] text-[var(--rv-green)]" />
                    Mileage history ({period.mode === 'all' ? 'Overall' : period.mode === 'year' ? period.year : format(new Date(period.year, period.month!), 'MMMM yyyy')})
                </h3>
                <p className="mt-2 max-w-[48ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                    Daily distance sits against the trailing total for this view, so volume trends are visible without stacking another chart.
                </p>
            </div>
            <div className="h-[300px]">
                <Chart type="bar" data={data} options={options} />
            </div>
        </div>
    );
}
