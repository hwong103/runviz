import { useMemo } from 'react';
import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    ScatterController,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { Footprints } from 'lucide-react';
import type { Activity } from '../types/activity';
import { useChartTheme } from '../hooks/useChartTheme';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, ScatterController);

interface ActivityScatterChartProps {
    activities: Activity[];
}

export function ActivityScatterChart({ activities }: ActivityScatterChartProps) {
    const chartTheme = useChartTheme();

    const data = useMemo(() => {
        const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run');

        return {
            datasets: [
                {
                    label: 'Runs',
                    data: runs.map(a => ({
                        x: a.distance / 1000, // Distance in km
                        y: (a.moving_time / a.distance) * 1000 / 60, // Pace in min/km
                    })),
                    backgroundColor: chartTheme.primaryLine,
                    borderColor: chartTheme.primaryLine,
                    borderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                },
            ],
        };
    }, [activities, chartTheme]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label: (context: any) => {
                        const pace = context.raw.y;
                        const distance = context.raw.x;
                        const mins = Math.floor(pace);
                        const secs = Math.round((pace - mins) * 60);
                        return `${distance.toFixed(1)}km @ ${mins}:${secs.toString().padStart(2, '0')}/km`;
                    },
                },
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Distance (km)',
                    color: chartTheme.axisColor,
                },
                grid: {
                    color: chartTheme.gridColor,
                },
                ticks: {
                    color: chartTheme.tickColor,
                },
            },
            y: {
                reverse: true, // Lower pace (faster) at top
                title: {
                    display: true,
                    text: 'Pace (min/km)',
                    color: chartTheme.axisColor,
                },
                grid: {
                    color: chartTheme.gridColor,
                },
                ticks: {
                    color: chartTheme.tickColor,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    callback: (value: any) => {
                        const mins = Math.floor(value);
                        const secs = Math.round((value - mins) * 60);
                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                    },
                },
            },
        },
    };

    return (
        <div className="rv-panel rv-panel-strong h-[400px] p-6">
            <h3 className="mb-6 flex items-center gap-2 text-lg font-medium text-[var(--rv-text)]">
                <Footprints className="h-[18px] w-[18px] text-[var(--rv-green)]" />
                Pace vs. Distance
            </h3>
            <div className="h-[300px]">
                <Scatter data={data} options={options} />
            </div>
        </div>
    );
}
