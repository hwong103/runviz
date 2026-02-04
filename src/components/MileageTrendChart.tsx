import { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import type { Activity } from '../types';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler
);

interface MileageTrendChartProps {
    activities: Activity[];
    viewMode: 'month' | 'year' | 'all';
}

export function MileageTrendChart({ activities, viewMode }: MileageTrendChartProps) {
    const data = useMemo(() => {
        const now = startOfDay(new Date());
        let intervalDays = 30;
        let trailingDays = 7;

        if (viewMode === 'year') {
            intervalDays = 365;
            trailingDays = 90;
        } else if (viewMode === 'all') {
            intervalDays = 730; // Last 2 years
            trailingDays = 365;
        }

        const startDate = subDays(now, intervalDays);
        const dateRange = eachDayOfInterval({ start: startDate, end: now });

        // Group activities by date
        const dailyMileage = new Map<string, number>();
        activities.forEach(a => {
            if (a.type !== 'Run' && a.sport_type !== 'Run') return;
            const dateStr = format(new Date(a.start_date_local), 'yyyy-MM-dd');
            dailyMileage.set(dateStr, (dailyMileage.get(dateStr) || 0) + a.distance / 1000);
        });

        const labels = dateRange.map(d => format(d, 'MMM d'));
        const dailyData = dateRange.map(d => dailyMileage.get(format(d, 'yyyy-MM-dd')) || 0);

        // Calculate trailing moving sum
        const allRuns = activities
            .filter(a => a.type === 'Run' || a.sport_type === 'Run')
            .sort((a, b) => new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime());

        const trailingData = dateRange.map(currentDate => {
            const windowStart = subDays(currentDate, trailingDays - 1);
            const windowEnd = currentDate;

            const sum = allRuns
                .filter(a => {
                    const d = new Date(a.start_date_local);
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
    }, [activities, viewMode]);

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
                    maxTicksLimit: 10,
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
                <span>📈</span> Mileage Trends
            </h3>
            <div className="h-[300px]">
                <Chart type="bar" data={data} options={options} />
            </div>
        </div>
    );
}
