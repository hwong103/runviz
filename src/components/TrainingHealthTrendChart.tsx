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
import {
    eachDayOfInterval,
    eachWeekOfInterval,
    endOfWeek,
    format,
    isSameDay,
    startOfDay,
    startOfMonth,
    startOfYear,
    subDays,
} from 'date-fns';
import type { Activity } from '../types/activity';
import {
    calculateAcwr,
    calculateConsistencyScore,
    calculateEfficiencyIndex,
    calculateGapTrend,
    calculateLongRunRatio,
    calculateMonotony,
    calculateStrainScore,
    calculateWeeklyRamp,
} from '../analytics/trainingHealth';
import { useChartTheme } from '../hooks/useChartTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export type TrainingHealthMetricKey =
    | 'acwr'
    | 'ramp'
    | 'consistency'
    | 'longRunRatio'
    | 'efficiency'
    | 'gapTrend'
    | 'monotony'
    | 'strain';

interface ViewPeriod {
    mode: 'all' | 'year' | 'month' | '30d' | '90d' | '365d';
    year: number;
    month: number | null;
}

interface TrainingHealthTrendChartProps {
    activities: Activity[];
    period: ViewPeriod;
    selectedPeriodEnd: Date;
    metric: TrainingHealthMetricKey;
    maxHR?: number;
}

interface MetricSeriesPoint {
    anchorDate: Date;
    value: number | null;
}

interface MetricDefinition {
    label: string;
    unit: string;
    trendRule: string;
    context: string;
    emptyState: string;
    formatValue: (value: number | null) => string;
    formatDelta: (value: number) => string;
    compute: (activities: Activity[], anchorDate: Date, maxHR: number) => number | null;
}

const METRIC_DEFINITIONS: Record<TrainingHealthMetricKey, MetricDefinition> = {
    acwr: {
        label: 'Load Ratio',
        unit: '',
        trendRule: 'Daily anchors for month, weekly anchors for longer views',
        context: 'Balanced blocks usually sit around 0.8-1.3.',
        emptyState: 'Need more recent workload data before load ratio can be charted.',
        formatValue: (value) => (value === null ? '--' : value.toFixed(2)),
        formatDelta: (value) => formatSigned(value, 2),
        compute: (activities, anchorDate, maxHR) => calculateAcwr(activities, anchorDate, maxHR),
    },
    ramp: {
        label: 'Weekly Change',
        unit: '%',
        trendRule: 'Week-over-week distance percentage at each anchor',
        context: 'Large positive spikes can be worth watching.',
        emptyState: 'Need at least two anchored weeks before weekly change can be charted.',
        formatValue: (value) => (value === null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`),
        formatDelta: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`,
        compute: (activities, anchorDate) => calculateWeeklyRamp(activities, anchorDate).rampPercent,
    },
    consistency: {
        label: 'Routine',
        unit: '%',
        trendRule: '6-week rolling consistency score',
        context: '75%+ usually signals a well-settled routine.',
        emptyState: 'Need more runs before routine consistency becomes meaningful.',
        formatValue: (value) => (value === null ? '--' : `${value.toFixed(0)}%`),
        formatDelta: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)} pts`,
        compute: (activities, anchorDate) => calculateConsistencyScore(activities, anchorDate),
    },
    longRunRatio: {
        label: 'Long Run Share',
        unit: '%',
        trendRule: 'Trailing 7-day long-run share at each anchor',
        context: 'Around 20-35% is a common healthy balance.',
        emptyState: 'Need fuller weekly volume before long-run share can be charted.',
        formatValue: (value) => (value === null ? '--' : `${value.toFixed(0)}%`),
        formatDelta: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)} pts`,
        compute: (activities, anchorDate) => calculateLongRunRatio(activities, anchorDate).ratio,
    },
    efficiency: {
        label: 'Efficiency',
        unit: 'm/beat',
        trendRule: '28-day rolling aerobic efficiency',
        context: 'Higher is better, but gaps reflect missing heart-rate coverage.',
        emptyState: 'Heart-rate data is still too sparse to draw an efficiency trend.',
        formatValue: (value) => (value === null ? '--' : value.toFixed(2)),
        formatDelta: (value) => formatSigned(value, 2),
        compute: calculateEfficiencyIndex,
    },
    gapTrend: {
        label: 'Climbing Trend',
        unit: 's/km',
        trendRule: '14-day GAP compared against the 14 days before it',
        context: 'Negative values mean your climbing pace is improving.',
        emptyState: 'Need more climbing data before the terrain-adjusted trend is reliable.',
        formatValue: (value) => (value === null ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(0)} s/km`),
        formatDelta: (value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} s/km`,
        compute: calculateGapTrend,
    },
    monotony: {
        label: 'Monotony',
        unit: '',
        trendRule: '7-day rolling TRIMP monotony',
        context: 'Lower values usually mean healthier variation.',
        emptyState: 'Need a fuller week of load to chart monotony.',
        formatValue: (value) => (value === null ? '--' : value.toFixed(2)),
        formatDelta: (value) => formatSigned(value, 2),
        compute: (activities, anchorDate, maxHR) => {
            const monotony = calculateMonotony(activities, anchorDate, maxHR);
            return monotony > 0 ? monotony : null;
        },
    },
    strain: {
        label: 'Strain',
        unit: '',
        trendRule: '7-day rolling strain score',
        context: 'This stacks total load with monotony to show how hard the block feels.',
        emptyState: 'Need more recent TRIMP data before strain can be charted.',
        formatValue: (value) => (value === null ? '--' : value.toFixed(0)),
        formatDelta: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}`,
        compute: (activities, anchorDate, maxHR) => {
            const strain = calculateStrainScore(activities, anchorDate, maxHR);
            return strain > 0 ? strain : null;
        },
    },
};

function formatSigned(value: number, digits: number) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function getTrendStartDate(period: ViewPeriod, selectedPeriodEnd: Date) {
    if (period.mode === 'month' && period.month !== null) {
        return startOfMonth(new Date(period.year, period.month));
    }

    if (period.mode === 'year') {
        return startOfYear(new Date(period.year, 0));
    }

    if (period.mode === '30d') {
        return subDays(startOfDay(selectedPeriodEnd), 30);
    }

    if (period.mode === '90d') {
        return subDays(startOfDay(selectedPeriodEnd), 90);
    }

    if (period.mode === '365d') {
        return subDays(startOfDay(selectedPeriodEnd), 365);
    }

    return subDays(startOfDay(selectedPeriodEnd), 180);
}

function getTrendAnchors(period: ViewPeriod, startDate: Date, selectedPeriodEnd: Date) {
    if (period.mode === 'month') {
        return eachDayOfInterval({ start: startDate, end: selectedPeriodEnd });
    }

    if (period.mode === '30d' || period.mode === '90d') {
        // Use daily anchors for shorter relative periods
        return eachDayOfInterval({ start: startDate, end: selectedPeriodEnd });
    }

    return eachWeekOfInterval(
        { start: startDate, end: selectedPeriodEnd },
        { weekStartsOn: 1 }
    ).map((weekStart) => {
        const anchoredWeekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        return anchoredWeekEnd > selectedPeriodEnd ? selectedPeriodEnd : anchoredWeekEnd;
    }).filter((anchor, index, anchors) => index === 0 || !isSameDay(anchor, anchors[index - 1]));
}

export function TrainingHealthTrendChart({
    activities,
    period,
    selectedPeriodEnd,
    metric,
    maxHR = 185,
}: TrainingHealthTrendChartProps) {
    const chartTheme = useChartTheme();
    const metricDefinition = METRIC_DEFINITIONS[metric];

    const series = useMemo(() => {
        const startDate = getTrendStartDate(period, selectedPeriodEnd);
        const anchors = getTrendAnchors(period, startDate, selectedPeriodEnd);

        return anchors.map((anchorDate): MetricSeriesPoint => ({
            anchorDate,
            value: metricDefinition.compute(activities, anchorDate, maxHR),
        }));
    }, [activities, maxHR, metricDefinition, period, selectedPeriodEnd]);

    const nonNullPoints = series.filter((point): point is MetricSeriesPoint & { value: number } => point.value !== null);
    const latestPoint = nonNullPoints[nonNullPoints.length - 1] ?? null;
    const firstPoint = nonNullPoints[0] ?? null;
    const changeInView = latestPoint && firstPoint ? latestPoint.value - firstPoint.value : null;
    const hasData = nonNullPoints.length > 0;
    const isDaily = period.mode === 'month';

    const chartData = useMemo(() => ({
        labels: series.map((point) => format(point.anchorDate, isDaily ? 'd MMM' : 'd MMM')),
        datasets: [
            {
                label: metricDefinition.label,
                data: series.map((point) => point.value),
                borderColor: chartTheme.primaryLine,
                backgroundColor: chartTheme.primaryFill,
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: series.length <= 40 ? 2 : 0,
                pointHoverRadius: 4,
                spanGaps: false,
            },
        ],
    }), [chartTheme.primaryFill, chartTheme.primaryLine, isDaily, metricDefinition.label, series]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipTitle,
                bodyColor: chartTheme.tooltipBody,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (context: { parsed: { y: number | null } }) => {
                        const value = context.parsed.y;
                        if (value === null) return 'No data';
                        const formatted = metricDefinition.formatValue(value);
                        return metricDefinition.unit ? `${formatted}` : formatted;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: {
                    display: false,
                },
                ticks: {
                    color: chartTheme.tickColor,
                    autoSkip: true,
                    maxTicksLimit: isDaily ? 8 : 10,
                },
            },
            y: {
                grid: {
                    color: chartTheme.gridColor,
                },
                ticks: {
                    color: chartTheme.tickColor,
                    callback: (value: string | number) => {
                        const numeric = typeof value === 'number' ? value : Number(value);
                        if (!Number.isFinite(numeric)) return value;
                        if (metric === 'ramp' || metric === 'consistency' || metric === 'longRunRatio') {
                            return `${numeric.toFixed(0)}%`;
                        }
                        if (metric === 'gapTrend') {
                            return `${numeric.toFixed(0)}s`;
                        }
                        if (Math.abs(numeric) >= 100) return numeric.toFixed(0);
                        return numeric.toFixed(2).replace(/\.00$/, '');
                    },
                },
            },
        },
    }), [chartTheme.gridColor, chartTheme.tickColor, chartTheme.tooltipBg, chartTheme.tooltipBody, chartTheme.tooltipBorder, chartTheme.tooltipTitle, isDaily, metric, metricDefinition]);

    return (
        <section className="rv-panel rv-panel-strong px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 border-b border-[var(--rv-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="rv-kicker mb-2">Metric Trend</p>
                    <h3 className="text-[1.8rem] font-bold tracking-tight text-[var(--rv-text)] sm:text-[2rem]">
                        {metricDefinition.label} over time
                    </h3>
                    <p className="mt-1.5 max-w-[54ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                        {metricDefinition.trendRule}. {metricDefinition.context}
                    </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:min-w-[400px]">
                    <TrendChip
                        label="Latest"
                        value={latestPoint ? metricDefinition.formatValue(latestPoint.value) : '--'}
                    />
                    <TrendChip
                        label="Change in view"
                        value={changeInView !== null ? metricDefinition.formatDelta(changeInView) : '--'}
                    />
                    <TrendChip
                        label="Sampling"
                        value={isDaily ? 'Daily' : 'Weekly'}
                    />
                </div>
            </div>

            <div className="mt-4 h-[240px] sm:h-[250px]">
                {hasData ? (
                    <Line data={chartData} options={options} />
                ) : (
                    <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-dashed border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-6 text-center text-sm leading-6 text-[var(--rv-text-dim)]">
                        {metricDefinition.emptyState}
                    </div>
                )}
            </div>

        </section>
    );
}

function TrendChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[0.95rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-3 py-2.5">
            <div className="rv-mini-label mb-1.5">{label}</div>
            <div className="text-sm font-semibold text-[var(--rv-text)] sm:text-[0.98rem]">{value}</div>
        </div>
    );
}
