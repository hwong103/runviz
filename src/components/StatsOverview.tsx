import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import { HeartPulse, Mountain, PieChart, Scale, Target, TrendingUp } from 'lucide-react';
import type { Activity } from '../types';
import { isRun } from '../types';
import { TrainingHealthTrendChart, type TrainingHealthMetricKey } from './TrainingHealthTrendChart';
import {
    calculateAcwr,
    calculateWeeklyRamp,
    calculateConsistencyScore,
    calculateLongRunRatio,
    calculateEfficiencyIndex,
    calculateGapTrend,
    calculateMonotony,
    calculateStrainScore,
    acwrColorClass,
    rampColorClass,
    consistencyColorClass,
    longRunRatioColorClass,
    efficiencyColorClass,
    gapTrendColorClass,
} from '../analytics/trainingHealth';
import { monotonyColorClass, strainColorClass } from '../analytics/monotony';
import { activityLocalDateKey, parseActivityLocalDate } from '../utils/activityDate';

interface StatsOverviewProps {
    activities: Activity[];
    allActivities: Activity[];
    period: {
        mode: 'all' | 'year' | 'month';
        year: number;
        month: number | null;
    };
    variant?: 'overview' | 'training';
}

type HelpMetric = TrainingHealthMetricKey;

function getSelectedPeriodEnd(period: StatsOverviewProps['period']) {
    const now = new Date();

    if (period.mode === 'all') return now;

    if (period.mode === 'year') {
        if (period.year === now.getFullYear()) return now;
        return new Date(period.year, 11, 31, 23, 59, 59, 999);
    }

    if (period.mode === 'month' && period.month !== null) {
        const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth();
        if (isCurrentMonth) return now;
        return new Date(period.year, period.month + 1, 0, 23, 59, 59, 999);
    }

    return now;
}

export function StatsOverview({ activities, allActivities, period, variant = 'overview' }: StatsOverviewProps) {
    const [activeHelp, setActiveHelp] = useState<HelpMetric | null>(null);
    const [activeMetric, setActiveMetric] = useState<TrainingHealthMetricKey>('efficiency');
    const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);
    const selectedPeriodEnd = useMemo(() => getSelectedPeriodEnd(period), [period]);

    useEffect(() => {
        if (!activeHelp) return;

        const handleClickOutside = () => setActiveHelp(null);
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setActiveHelp(null);
        };

        setTimeout(() => {
            window.addEventListener('click', handleClickOutside);
            window.addEventListener('keydown', handleEsc);
        }, 0);

        return () => {
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('keydown', handleEsc);
        };
    }, [activeHelp]);

    const stats = useMemo(() => {
        // Filter activities by period
        const filteredActivities = activities.filter((a) => {
            if (!isRun(a)) return false;

            const date = parseActivityLocalDate(a.start_date_local);
            const year = date.getFullYear();
            const month = date.getMonth();

            if (period.mode === 'all') return true;
            if (period.mode === 'year') return year === period.year;
            if (period.mode === 'month') return year === period.year && month === period.month;

            return false;
        });

        // Basic stats
        const totalDistance = filteredActivities.reduce((sum, a) => sum + a.distance, 0);
        const totalTime = filteredActivities.reduce((sum, a) => sum + a.moving_time, 0);
        const avgPace = totalDistance > 0 ? (totalTime / totalDistance) * 1000 / 60 : 0;
        const avgDurationMins = filteredActivities.length > 0 ? (totalTime / filteredActivities.length) / 60 : 0;
        const longestRunDistance = filteredActivities.reduce((max, a) => Math.max(max, a.distance), 0);

        // Streak calculation
        const streakData = calculateStreaks(filteredActivities);
        const acwr = calculateAcwr(allActivities, selectedPeriodEnd);
        const weeklyRamp = calculateWeeklyRamp(allActivities, selectedPeriodEnd);
        const consistencyScore = calculateConsistencyScore(allActivities, selectedPeriodEnd);
        const longRunRatio = calculateLongRunRatio(allActivities, selectedPeriodEnd);
        const efficiencyIndex = calculateEfficiencyIndex(allActivities, selectedPeriodEnd);
        const gapTrendSecPerKm = calculateGapTrend(allActivities, selectedPeriodEnd);
        const monotony = calculateMonotony(allActivities, selectedPeriodEnd);
        const strain = calculateStrainScore(allActivities, selectedPeriodEnd);

        return {
            runCount: filteredActivities.length,
            totalDistance: totalDistance / 1000, // km
            avgDistance: filteredActivities.length > 0 ? (totalDistance / 1000) / filteredActivities.length : 0,
            avgPace,
            avgDurationMins,
            longestRun: longestRunDistance / 1000,
            acwr,
            weeklyRampKm: weeklyRamp.rampKm,
            weeklyRampPercent: weeklyRamp.rampPercent,
            consistencyScore,
            longRunRatio: longRunRatio.ratio,
            efficiencyIndex,
            gapTrendSecPerKm,
            monotony,
            strain,
            ...streakData,
        };
    }, [activities, allActivities, period, selectedPeriodEnd]);

    const formatPace = (pace: number) => {
        const mins = Math.floor(pace);
        const secs = Math.round((pace - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatSignedSeconds = (seconds: number | null) => {
        if (seconds === null) return '--';
        const abs = Math.abs(seconds);
        const sign = seconds > 0 ? '+' : '-';
        return `${sign}${abs.toFixed(0)}`;
    };

    const isOverview = variant === 'overview';

    return (
        <div className="space-y-4">
            {isOverview ? (
                <>
                    <section className="rv-panel rv-panel-strong px-5 py-5 sm:px-6 sm:py-6" style={reveal(60)}>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <ToplineMetric label="Distance" value={stats.totalDistance.toFixed(1)} unit="km" />
                            <ToplineMetric label="Avg Pace" value={stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--'} unit="/km" />
                            <ToplineMetric label="Longest" value={stats.longestRun.toFixed(1)} unit="km" />
                            <ToplineMetric label="Avg Mileage" value={stats.avgDistance.toFixed(1)} unit="km" />
                        </div>
                    </section>

                    <section className="rv-panel px-5 py-4 sm:px-6 sm:py-5" style={reveal(120)}>
                        <p className="rv-kicker mb-3">Block Snapshot</p>
                        <div className="overflow-hidden rounded-[1.35rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)]">
                            <div className="grid divide-y divide-[var(--rv-border)] bg-[var(--rv-bg-panel)] md:grid-cols-5 md:divide-x md:divide-y-0">
                                <SnapshotCell
                                    label="Runs in View"
                                    value={stats.runCount.toString()}
                                    unit=""
                                    detail={stats.avgDurationMins > 0 ? `${stats.avgDurationMins.toFixed(0)} min avg outing` : 'Avg outing will appear after your next run'}
                                />
                                <SnapshotCell
                                    label="Load Ratio"
                                    value={stats.acwr !== null ? stats.acwr.toFixed(2) : '--'}
                                    unit=""
                                    detail={getAcwrDetail(stats.acwr)}
                                />
                                <SnapshotCell
                                    label="Weekly Change"
                                    value={
                                        stats.weeklyRampPercent !== null
                                            ? `${stats.weeklyRampPercent >= 0 ? '+' : ''}${stats.weeklyRampPercent.toFixed(0)}`
                                            : `${stats.weeklyRampKm >= 0 ? '+' : ''}${stats.weeklyRampKm.toFixed(1)}`
                                    }
                                    unit={stats.weeklyRampPercent !== null ? '%' : 'km'}
                                    detail={getRampDetail(stats.weeklyRampPercent, stats.weeklyRampKm)}
                                />
                                <SnapshotCell
                                    label="Routine"
                                    value={stats.consistencyScore.toString()}
                                    unit="%"
                                    detail={getConsistencyDetail(stats.consistencyScore)}
                                />
                                <SnapshotCell
                                    label="Efficiency"
                                    value={stats.efficiencyIndex !== null ? stats.efficiencyIndex.toFixed(2) : '--'}
                                    unit="m/beat"
                                    detail={getEfficiencyDetail(stats.efficiencyIndex)}
                                />
                            </div>
                        </div>
                    </section>
                </>
            ) : (
                <section className="space-y-3">
                    <div className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-3 xl:grid-cols-4">
                        <StatCard
                            label="Load Ratio"
                            value={stats.acwr !== null ? stats.acwr.toFixed(2) : '--'}
                            unit=""
                            icon={Scale}
                            color={acwrColorClass(stats.acwr)}
                            helpMetric="acwr"
                            helpText="Acute:Chronic Workload Ratio (ACWR), anchored to the selected period end date. Around 0.8-1.3 is generally balanced, and above 1.5 signals a sharp load spike."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getAcwrDetail(stats.acwr)}
                            tone="green"
                            style={reveal(120)}
                            metricKey="acwr"
                            isSelected={activeMetric === 'acwr'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Weekly Change"
                            value={
                                stats.weeklyRampPercent !== null
                                    ? `${stats.weeklyRampPercent >= 0 ? '+' : ''}${stats.weeklyRampPercent.toFixed(0)}`
                                    : `${stats.weeklyRampKm >= 0 ? '+' : ''}${stats.weeklyRampKm.toFixed(1)}`
                            }
                            unit={stats.weeklyRampPercent !== null ? '%' : 'km'}
                            icon={TrendingUp}
                            color={rampColorClass(stats.weeklyRampPercent)}
                            helpMetric="ramp"
                            helpText="Week-over-week distance change, anchored to the selected period end date. Percentage is shown when last week exists; otherwise the absolute kilometre change is used."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getRampDetail(stats.weeklyRampPercent, stats.weeklyRampKm)}
                            tone="blue"
                            style={reveal(160)}
                            metricKey="ramp"
                            isSelected={activeMetric === 'ramp'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Routine"
                            value={stats.consistencyScore.toString()}
                            unit="%"
                            icon={Target}
                            color={consistencyColorClass(stats.consistencyScore)}
                            helpMetric="consistency"
                            helpText="Consistency score from recent weekly run frequency and stability. 75+ suggests a strong routine, 50-74 is building, and below 50 is still uneven."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getConsistencyDetail(stats.consistencyScore)}
                            tone="green"
                            style={reveal(200)}
                            metricKey="consistency"
                            isSelected={activeMetric === 'consistency'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Long Run Share"
                            value={stats.longRunRatio !== null ? stats.longRunRatio.toFixed(0) : '--'}
                            unit="%"
                            icon={PieChart}
                            color={longRunRatioColorClass(stats.longRunRatio)}
                            helpMetric="longRunRatio"
                            helpText="Longest run as a share of that anchored week's total distance. Around 20-35% is common; much higher can indicate the week is too concentrated."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getLongRunDetail(stats.longRunRatio)}
                            tone="gold"
                            style={reveal(240)}
                            metricKey="longRunRatio"
                            isSelected={activeMetric === 'longRunRatio'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Efficiency"
                            value={stats.efficiencyIndex !== null ? stats.efficiencyIndex.toFixed(2) : '--'}
                            unit="m/beat"
                            icon={HeartPulse}
                            color={efficiencyColorClass(stats.efficiencyIndex)}
                            helpMetric="efficiency"
                            helpText="Distance per heartbeat over the trailing 28 days. Higher is better and usually reflects stronger aerobic efficiency."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getEfficiencyDetail(stats.efficiencyIndex)}
                            tone="green"
                            style={reveal(280)}
                            metricKey="efficiency"
                            isSelected={activeMetric === 'efficiency'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Climbing Trend"
                            value={formatSignedSeconds(stats.gapTrendSecPerKm)}
                            unit="s/km"
                            icon={Mountain}
                            color={gapTrendColorClass(stats.gapTrendSecPerKm)}
                            helpMetric="gapTrend"
                            helpText="Change in grade-adjusted pace between the latest 14 days and the 14 days before that. Negative means your climbing effort is getting faster."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getGapTrendDetail(stats.gapTrendSecPerKm)}
                            tone="blue"
                            style={reveal(320)}
                            metricKey="gapTrend"
                            isSelected={activeMetric === 'gapTrend'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Monotony"
                            value={stats.monotony > 0 ? stats.monotony.toFixed(2) : '--'}
                            unit=""
                            icon={Target}
                            color={monotonyColorClass(stats.monotony)}
                            helpMetric="monotony"
                            helpText="Average daily TRIMP divided by day-to-day variation across the last 7 days. Lower values usually mean better variety."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getMonotonyDetail(stats.monotony)}
                            tone="orange"
                            style={reveal(360)}
                            metricKey="monotony"
                            isSelected={activeMetric === 'monotony'}
                            onSelectMetric={setActiveMetric}
                        />
                        <StatCard
                            label="Strain"
                            value={stats.strain > 0 ? stats.strain.toFixed(0) : '--'}
                            unit=""
                            icon={TrendingUp}
                            color={strainColorClass(stats.strain)}
                            helpMetric="strain"
                            helpText="7-day total TRIMP multiplied by monotony. It is a simple check on how much load and repetition are stacking together."
                            activeHelp={activeHelp}
                            onToggleHelp={setActiveHelp}
                            detail={getStrainDetail(stats.strain)}
                            tone="orange"
                            style={reveal(400)}
                            metricKey="strain"
                            isSelected={activeMetric === 'strain'}
                            onSelectMetric={setActiveMetric}
                        />
                    </div>
                    <TrainingHealthTrendChart
                        activities={allActivities}
                        period={period}
                        selectedPeriodEnd={selectedPeriodEnd}
                        metric={activeMetric}
                    />
                </section>
            )}
        </div>
    );
}

function calculateStreaks(activities: Activity[]) {
    if (activities.length === 0) return { longestStreak: 0, longestBreak: 0 };

    // Get unique dates with runs
    const runDates = new Set(
        activities.map(a => activityLocalDateKey(a.start_date_local))
    );

    const sortedDates = Array.from(runDates).sort();
    let longestStreak = 0;
    let currentStreak = 0;

    // Streak logic
    if (sortedDates.length > 0) {
        currentStreak = 1;
        longestStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
            const d1 = parseISO(sortedDates[i - 1]);
            const d2 = parseISO(sortedDates[i]);
            const diffDays = differenceInCalendarDays(d2, d1);

            if (diffDays === 1) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
            longestStreak = Math.max(longestStreak, currentStreak);
        }
    }

    // Break logic
    let longestBreak = 0;
    for (let i = 1; i < sortedDates.length; i++) {
        const d1 = parseISO(sortedDates[i - 1]);
        const d2 = parseISO(sortedDates[i]);
        const diffDays = differenceInCalendarDays(d2, d1) - 1;
        longestBreak = Math.max(longestBreak, diffDays);
    }

    return { longestStreak, longestBreak };
}

interface StatCardProps {
    label: string;
    value: string;
    unit: string;
    icon: LucideIcon;
    color?: string;
    detail?: string;
    style?: CSSProperties;
    helpMetric?: HelpMetric;
    helpText?: string;
    activeHelp?: HelpMetric | null;
    onToggleHelp?: (metric: HelpMetric | null) => void;
    tone?: 'blue' | 'green' | 'gold' | 'orange' | 'neutral';
    metricKey?: TrainingHealthMetricKey;
    isSelected?: boolean;
    onSelectMetric?: (metric: TrainingHealthMetricKey) => void;
}

function SnapshotCell({
    label,
    value,
    unit,
    detail,
}: {
    label: string;
    value: string;
    unit: string;
    detail: string;
}) {
    return (
        <div className="flex min-h-[172px] flex-col justify-between bg-[var(--rv-bg-panel)] px-4 py-4 sm:px-5 sm:py-5">
            <div>
                <p className="rv-mini-label mb-3">{label}</p>
                <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rv-data text-[1.7rem] text-[var(--rv-text)] sm:text-[1.95rem]">
                        {value}
                    </span>
                    {unit ? <span className="rv-mini-label tracking-[0.18em]">{unit}</span> : null}
                </div>
            </div>
            <p className="mt-4 max-w-[18ch] text-sm leading-7 text-[var(--rv-text-dim)]">{detail}</p>
        </div>
    );
}

function ToplineMetric({
    label,
    value,
    unit,
    compact = false,
}: {
    label: string;
    value: string;
    unit: string;
    compact?: boolean;
}) {
    return (
        <div className={`${compact ? 'rounded-[1rem] border border-[var(--rv-border)] px-3 py-3' : ''}`}>
            <p className="rv-mini-label mb-2">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className={`rv-data ${compact ? 'text-[1.5rem]' : 'text-[1.85rem] sm:text-[2rem]'} text-[var(--rv-text)]`}>
                    {value}
                </span>
                {unit ? <span className="rv-mini-label tracking-[0.18em]">{unit}</span> : null}
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    unit,
    icon: Icon,
    color = "text-[var(--rv-text)]",
    detail,
    style,
    helpMetric,
    helpText,
    activeHelp,
    onToggleHelp,
    tone = 'neutral',
    metricKey,
    isSelected = false,
    onSelectMetric,
}: StatCardProps) {
    const showHelp = !!helpMetric && activeHelp === helpMetric;
    const isCompact = !helpMetric;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
    const isInteractive = !!metricKey && !!onSelectMetric;

    useEffect(() => {
        if (!showHelp || !cardRef.current) return;
        const frame = requestAnimationFrame(() => {
            if (!cardRef.current) return;
            const rect = cardRef.current.getBoundingClientRect();
            const TOOLTIP_W = 256;
            const GAP = 8;
            const spaceBelow = window.innerHeight - rect.bottom;
            const left = Math.min(rect.left, window.innerWidth - TOOLTIP_W - 8);

            setTooltipStyle(
                spaceBelow > 160
                    ? { position: 'fixed', top: rect.bottom + GAP, left, width: TOOLTIP_W }
                    : { position: 'fixed', top: rect.top - GAP, left, width: TOOLTIP_W, transform: 'translateY(-100%)' }
            );
        });

        return () => cancelAnimationFrame(frame);
    }, [showHelp]);

    return (
        <div
            ref={cardRef}
            style={style}
            data-tone={tone}
            className={`rv-panel rv-stat-card rv-reveal-subtle rv-spotlight relative overflow-hidden transition-all duration-300 group hover:-translate-y-1 hover:border-[var(--rv-border-strong)] ${isCompact ? 'p-3 sm:p-3.5' : 'p-3.5 sm:p-4'} ${isInteractive ? 'cursor-pointer' : ''} ${isSelected ? 'border-[var(--rv-border-strong)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_82%,white_18%)] shadow-[0_18px_36px_rgba(0,0,0,0.10)]' : ''}`}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            aria-pressed={isInteractive ? isSelected : undefined}
            onClick={() => {
                if (metricKey && onSelectMetric) onSelectMetric(metricKey);
            }}
            onKeyDown={(e) => {
                if (!isInteractive || !metricKey || !onSelectMetric) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMetric(metricKey);
                }
            }}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
            {isInteractive && isSelected ? (
                <div className="absolute left-3 top-3 rounded-full border border-[var(--rv-border-strong)] bg-[var(--rv-bg-elevated)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--rv-text)]">
                    Trend
                </div>
            ) : null}
            <div className={`mb-2.5 flex items-center gap-2 ${isCompact ? 'pr-3' : 'pr-6'} ${isInteractive && isSelected ? 'pt-7' : ''}`}>
                <Icon className={`${isCompact ? 'h-[16px] w-[16px]' : 'h-[18px] w-[18px]'} text-[var(--rv-text-faint)] transition-transform duration-300 group-hover:scale-110 group-hover:text-[var(--rv-text-dim)]`} />
                <span className={`rv-mini-label ${isCompact ? 'tracking-[0.2em]' : 'tracking-[0.24em]'}`}>{label}</span>
            </div>
            {helpMetric && helpText && onToggleHelp && (
                <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleHelp(showHelp ? null : helpMetric);
                        }}
                        className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[10px] text-[var(--rv-text-faint)] transition-colors hover:bg-[var(--rv-bg-elevated)] hover:text-[var(--rv-text)]"
                        aria-label={`Help for ${label}`}
                        title={`Help for ${label}`}
                    >
                        ?
                    </button>
                    {showHelp && createPortal(
                        <div
                            className="rv-panel rv-panel-strong z-[9999] pointer-events-none p-3 shadow-[0_20px_44px_rgba(0,0,0,0.35)]"
                            style={tooltipStyle}
                        >
                            <div className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[var(--rv-blue)]">{label}</div>
                            <div className="text-sm leading-6 font-normal normal-case text-[var(--rv-text-dim)]">
                                {helpText}
                            </div>
                        </div>,
                        document.body
                    )}
                </>
            )}
            <div className="flex flex-wrap items-baseline gap-1.5">
                <span className={`rv-data ${isCompact ? 'text-[1.4rem] sm:text-[1.7rem]' : 'text-[1.65rem] sm:text-[1.95rem]'} ${color}`}>{value}</span>
                <span className="rv-mini-label tracking-[0.18em]">{unit}</span>
            </div>
            {detail && (
                <p className="rv-body-copy-sm mt-1.5 max-w-[22ch] text-[13px] leading-6">
                    {detail}
                </p>
            )}
        </div>
    );
}

function getAcwrDetail(acwr: number | null) {
    if (acwr === null) return 'Needs more recent workload data';
    if (acwr > 1.5) return 'Load is spiking sharply';
    if (acwr >= 0.8) return 'Stress and durability look balanced';
    return 'Load is a little light right now';
}

function getRampDetail(rampPercent: number | null, rampKm: number) {
    if (rampPercent !== null) {
        if (rampPercent > 15) return 'Mileage is rising quickly';
        if (rampPercent >= -5) return 'Week-to-week build looks controlled';
        return 'Volume has eased back this week';
    }
    if (rampKm > 0) return 'Extra distance is starting to stack';
    if (rampKm < 0) return 'This week is lighter than the last';
    return 'Waiting for a second week to compare';
}

function getConsistencyDetail(score: number) {
    if (score >= 75) return 'Routine is settling into place';
    if (score >= 50) return 'You are building dependable rhythm';
    return 'A steadier cadence of runs would help';
}

function getLongRunDetail(ratio: number | null) {
    if (ratio === null) return 'Waiting for a fuller training week';
    if (ratio > 38) return 'Long run is carrying a lot of the week';
    if (ratio >= 20) return 'Long run share looks nicely balanced';
    return 'The week is spread fairly evenly';
}

function getEfficiencyDetail(efficiency: number | null) {
    if (efficiency === null) return 'Heart-rate data is still sparse here';
    if (efficiency >= 1.2) return 'Engine looks efficient';
    if (efficiency >= 1.0) return 'Aerobic efficiency is trending solid';
    return 'There is room for easier aerobic support';
}

function getGapTrendDetail(gapTrend: number | null) {
    if (gapTrend === null) return 'Not enough grade-adjusted pace yet';
    if (gapTrend < -5) return 'Climbing pace is improving';
    if (gapTrend <= 5) return 'Effort is holding steady';
    return 'Recent runs look a touch slower uphill';
}

function getMonotonyDetail(monotony: number) {
    if (monotony <= 0) return 'Waiting for a full week of training load';
    if (monotony > 2.0) return 'Recent load has been very repetitive';
    if (monotony > 1.5) return 'Variation is a little limited';
    return 'Training variety looks healthy';
}

function getStrainDetail(strain: number) {
    if (strain <= 0) return 'Need more recent TRIMP data to score strain';
    if (strain > 6000) return 'Load and repetition are both running hot';
    if (strain > 3000) return 'This block is carrying notable stress';
    return 'Overall stress looks manageable';
}
