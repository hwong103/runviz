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
import type { Activity } from '../types';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, ScatterController);

interface ActivityScatterChartProps {
    activities: Activity[];
}

export function ActivityScatterChart({ activities }: ActivityScatterChartProps) {
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
                    backgroundColor: 'rgba(16, 185, 129, 0.6)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                },
            ],
        };
    }, [activities]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
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
                    color: 'rgba(255, 255, 255, 0.7)',
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                },
            },
            y: {
                reverse: true, // Lower pace (faster) at top
                title: {
                    display: true,
                    text: 'Pace (min/km)',
                    color: 'rgba(255, 255, 255, 0.7)',
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
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
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10 h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
                <span>🏃‍♂️</span> Pace vs. Distance
            </h3>
            <div className="h-[300px]">
                <Scatter data={data} options={options} />
            </div>
        </div>
    );
}
