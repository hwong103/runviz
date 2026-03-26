import { useEffect, useMemo, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    LineController,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { BarChart2 } from 'lucide-react';
import type { Activity } from '../types';
import { computeYearOnYear } from '../analytics/yearOnYear';
import { useChartTheme } from '../hooks/useChartTheme';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    LineController,
    Tooltip,
    Legend,
    Filler
);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STORAGE_KEY = 'runviz_year_on_year_hidden_years';

const YEAR_COLORS = [
    { line: '#13C38B', fill: 'rgba(19, 195, 139, 0.08)' },
    { line: '#4A7AFF', fill: 'rgba(74, 122, 255, 0.08)' },
    { line: '#FF8E2B', fill: 'rgba(255, 142, 43, 0.08)' },
    { line: '#D9B36A', fill: 'rgba(217, 179, 106, 0.08)' },
    { line: '#E25A8F', fill: 'rgba(226, 90, 143, 0.08)' },
    { line: '#7EC8E3', fill: 'rgba(126, 200, 227, 0.08)' },
];

interface YearOnYearChartProps {
    activities: Activity[];
}

export function YearOnYearChart({ activities }: YearOnYearChartProps) {
    const chartTheme = useChartTheme();
    const series = useMemo(() => computeYearOnYear(activities), [activities]);
    const [hiddenYears, setHiddenYears] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];

        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
        } catch {
            return [];
        }
    });

    // For the current year, only plot up to and including the current month
    // so the line doesn't flatline at the last cumulative value through Dec.
    const currentYear = new Date().getFullYear();
    const currentMonthIndex = new Date().getMonth();
    const availableYears = useMemo(() => series.map((entry) => String(entry.year)), [series]);

    useEffect(() => {
        setHiddenYears((previous) => {
            const next = previous.filter((year) => availableYears.includes(year));

            if (next.length === previous.length) {
                return previous;
            }

            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Ignore storage write failures.
            }

            return next;
        });
    }, [availableYears]);

    const data = useMemo(
        () => ({
            labels: MONTH_LABELS,
            datasets: series.map((yearSeries, index) => {
                const palette = YEAR_COLORS[index % YEAR_COLORS.length];
                const isCurrentYear = yearSeries.year === currentYear;

                return {
                    label: String(yearSeries.year),
                    data: yearSeries.months.map((month) => {
                        // For the current year, null out future months so the line ends today
                        if (isCurrentYear && month.monthIndex > currentMonthIndex) return null;
                        return month.km > 0 ? month.km : null;
                    }),
                    hidden: hiddenYears.includes(String(yearSeries.year)),
                    borderColor: palette.line,
                    backgroundColor: palette.fill,
                    borderWidth: isCurrentYear ? 2.5 : 1.5,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.35,
                    fill: false,
                    spanGaps: false,
                };
            }),
        }),
        [series, currentYear, currentMonthIndex, hiddenYears]
    );

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
                onClick: (_event: unknown, legendItem: { text?: string }) => {
                    const yearLabel = legendItem.text;
                    if (!yearLabel) return;

                    setHiddenYears((previous) => {
                        const next = previous.includes(yearLabel)
                            ? previous.filter((year) => year !== yearLabel)
                            : [...previous, yearLabel];

                        try {
                            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                        } catch {
                            // Ignore storage write failures.
                        }

                        return next;
                    });
                },
                labels: {
                    color: chartTheme.legendColor,
                    usePointStyle: true,
                    pointStyleWidth: 16,
                },
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipTitle,
                bodyColor: chartTheme.tooltipBody,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (context: { dataset: { label?: string }; parsed: { y: number | null } }) => {
                        if (context.parsed.y === null) return `${context.dataset.label}: no data`;
                        return `${context.dataset.label}: ${context.parsed.y} km`;
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
                ticks: {
                    color: chartTheme.tickColor,
                    callback: (value: number | string) => `${value} km`,
                },
                title: {
                    display: true,
                    text: 'cumulative km',
                    color: chartTheme.axisColor,
                },
            },
        },
    };

    if (series.length === 0) {
        return (
            <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
                <p className="rv-kicker mb-2">Year on Year</p>
                <div className="flex h-48 items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--rv-border)] text-sm text-[var(--rv-text-dim)]">
                    No activity data yet.
                </div>
            </div>
        );
    }

    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-6">
                <p className="rv-kicker mb-2">Year on Year</p>
                <h3 className="flex items-center gap-2 text-lg font-medium text-[var(--rv-text)]">
                    <BarChart2 className="h-[18px] w-[18px] text-[var(--rv-blue)]" />
                    Cumulative mileage by year
                </h3>
                <p className="mt-2 max-w-[48ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                    Each line is one calendar year. Where the current year sits relative to prior years shows whether annual volume is growing.
                </p>
            </div>
            <div className="h-[320px]">
                <Line data={data} options={options} />
            </div>
        </div>
    );
}
