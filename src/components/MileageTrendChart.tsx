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
import type { Activity } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';

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
                    borderColor: 'rgba(52, 211, 153, 1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    yAxisID: 'y1',
                },
                {
                    type: 'bar' as const,
                    label: 'Daily (km)',
                    data: dailyData,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 4,
                    yAxisID: 'y',
                },
            ],
        };
    }, [activities, period]);

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
                    color: 'rgba(255, 255, 255, 0.7)',
                    usePointStyle: true,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
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
                    color: 'rgba(255, 255, 255, 0.5)',
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
                    color: 'rgba(255, 255, 255, 0.5)',
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.5)',
                },
            },
            y1: {
                beginAtZero: true,
                position: 'right' as const,
                title: {
                    display: true,
                    text: 'Trailing km',
                    color: 'rgba(52, 211, 153, 0.7)',
                },
                grid: {
                    display: false,
                },
                ticks: {
                    color: 'rgba(52, 211, 153, 0.7)',
                },
            },
        },
    };

    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10 h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
                <span>📈</span> Mileage Trends ({period.mode === 'all' ? 'Overall' : period.mode === 'year' ? period.year : format(new Date(period.year, period.month!), 'MMMM yyyy')})
            </h3>
            <div className="h-[300px]">
                <Chart type="bar" data={data} options={options} />
            </div>
        </div>
    );
}
