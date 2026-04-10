import { useMemo } from 'react';
import {
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Radio } from 'lucide-react';
import type { Activity } from '../types/activity';
import { extractCadenceHistory } from '../analytics/cadence';
import { useChartTheme } from '../hooks/useChartTheme';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler
);

const referenceLinePlugin = {
    id: 'referenceLine',
    afterDraw(chart: ChartJS) {
        const yScale = chart.scales.y;
        if (!yScale) return;

        const { ctx, chartArea } = chart;
        const y = yScale.getPixelForValue(170);
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.restore();
    },
};

interface CadenceTrendChartProps {
    activities: Activity[];
}

export function CadenceTrendChart({ activities }: CadenceTrendChartProps) {
    const chartTheme = useChartTheme();
    const points = useMemo(() => extractCadenceHistory(activities), [activities]);

    const data = useMemo(() => ({
        labels: points.map((point) => point.dateLabel),
        datasets: [
            {
                label: 'Cadence (SPM)',
                data: points.map((point) => point.spm),
                borderColor: chartTheme.primaryLine,
                backgroundColor: chartTheme.primaryFill,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.35,
                fill: true,
            },
        ],
    }), [chartTheme.primaryFill, chartTheme.primaryLine, points]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
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
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: chartTheme.tickColor, maxTicksLimit: 8 },
            },
            y: {
                min: 140,
                max: 200,
                grid: { color: chartTheme.gridColor },
                ticks: { color: chartTheme.tickColor },
            },
        },
    };

    return (
        <div className="rv-panel px-5 py-5 sm:px-7 sm:py-6">
            <p className="rv-kicker mb-2">Run Mechanics</p>
            <h3 className="flex items-center gap-2 text-lg font-medium text-[var(--rv-text)]">
                <Radio className="h-[18px] w-[18px] text-[var(--rv-blue)]" />
                Cadence trend
            </h3>
            <p className="mt-2 max-w-[48ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                Track how quickly your legs are turning over and compare the trend against the 170 spm reference line.
            </p>

            <div className="mt-6">
                {points.length < 5 ? (
                    <div className="rounded-[1.5rem] border border-dashed border-[var(--rv-border)] px-5 py-10 text-center text-sm text-[var(--rv-text-dim)]">
                        No cadence data - ensure your watch records cadence.
                    </div>
                ) : (
                    <div className="h-[300px]">
                        <Line data={data} options={options} plugins={[referenceLinePlugin]} />
                    </div>
                )}
            </div>
        </div>
    );
}
