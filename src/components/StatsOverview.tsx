import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import { Clock3, Flame, Footprints, Gauge, HeartPulse, Mountain, PieChart, Ruler, Scale, Target, TrendingUp, Trophy } from 'lucide-react';
import type { Activity } from '../types';
import { isRun } from '../types';
import {
    calculateAcwr,
    calculateWeeklyRamp,
    calculateConsistencyScore,
    calculateLongRunRatio,
    calculateEfficiencyIndex,
    calculateGapTrend,
    acwrColorClass,
    rampColorClass,
    consistencyColorClass,
    longRunRatioColorClass,
    efficiencyColorClass,
    gapTrendColorClass,
} from '../analytics/trainingHealth';
import { activityLocalDateKey, parseActivityLocalDate } from '../utils/activityDate';

interface StatsOverviewProps {
    activities: Activity[];
    allActivities: Activity[];
    period: {
        mode: 'all' | 'year' | 'month';
        year: number;
        month: number | null;
    };
}

type HelpMetric = 'acwr' | 'ramp' | 'consistency' | 'longRunRatio' | 'efficiency' | 'gapTrend';

export function StatsOverview({ activities, allActivities, period }: StatsOverviewProps) {
    const [activeHelp, setActiveHelp] = useState<HelpMetric | null>(null);
    const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);

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
        const now = new Date();
        const selectedPeriodEnd = (() => {
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
        })();

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
            ...streakData,
        };
    }, [activities, allActivities, period]);

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

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:grid-cols-6">
                <StatCard
                    label="Runs"
                    value={stats.runCount.toString()}
                    unit=""
                    icon={Footprints}
                    detail={stats.runCount > 0 ? `${stats.avgDistance.toFixed(1)} km average outing` : 'No runs in this slice yet'}
                    tone="blue"
                    style={reveal(40)}
                />
                <StatCard
                    label="Distance"
                    value={stats.totalDistance.toFixed(1)}
                    unit="km"
                    icon={Ruler}
                    detail={stats.totalDistance > 0 ? 'Total distance in the current view' : 'Mileage will appear after your next run'}
                    tone="blue"
                    style={reveal(80)}
                />
                <StatCard
                    label="Avg Duration"
                    value={stats.avgDurationMins > 0 ? stats.avgDurationMins.toFixed(0) : '--'}
                    unit="min"
                    icon={Clock3}
                    color="text-cyan-400"
                    detail={stats.avgDurationMins > 0 ? 'Time on feet per run' : 'Waiting for enough activity to average'}
                    tone="blue"
                    style={reveal(120)}
                />
                <StatCard
                    label="Avg Pace"
                    value={stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--'}
                    unit="/km"
                    icon={Gauge}
                    detail={stats.avgPace > 0 ? 'Average moving pace across this block' : 'Pace comes through once a run is logged'}
                    tone="blue"
                    style={reveal(160)}
                />
                <StatCard
                    label="Longest"
                    value={stats.longestRun.toFixed(1)}
                    unit="km"
                    icon={Trophy}
                    detail={stats.longestRun > 0 ? 'Biggest single outing in this view' : 'No long run recorded here yet'}
                    tone="gold"
                    style={reveal(200)}
                />
                <StatCard
                    label="Max Streak"
                    value={stats.longestStreak.toString()}
                    unit="days"
                    icon={Flame}
                    color="text-orange-400"
                    detail={stats.longestStreak >= 5 ? 'Rhythm like this compounds nicely' : 'Consistency is built one repeat day at a time'}
                    tone="orange"
                    style={reveal(240)}
                />
            </div>

            <div>
                <p className="rv-kicker mb-2 px-1">Training Health</p>
                <div className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 lg:grid-cols-6">
                    <StatCard
                        label="ACWR"
                        value={stats.acwr !== null ? stats.acwr.toFixed(2) : '--'}
                        unit=""
                        icon={Scale}
                        color={acwrColorClass(stats.acwr)}
                        helpMetric="acwr"
                        helpText="Acute:Chronic Workload Ratio (ATL/CTL), anchored to the selected period end date. 0.8-1.3 is generally balanced, >1.5 means a sharp load spike."
                        activeHelp={activeHelp}
                        onToggleHelp={setActiveHelp}
                        detail={getAcwrDetail(stats.acwr)}
                        tone="green"
                        style={reveal(120)}
                    />
                    <StatCard
                        label="Ramp"
                        value={
                            stats.weeklyRampPercent !== null
                                ? `${stats.weeklyRampPercent >= 0 ? '+' : ''}${stats.weeklyRampPercent.toFixed(0)}`
                                : `${stats.weeklyRampKm >= 0 ? '+' : ''}${stats.weeklyRampKm.toFixed(1)}`
                        }
                        unit={stats.weeklyRampPercent !== null ? '%' : 'km/wk'}
                        icon={TrendingUp}
                        color={rampColorClass(stats.weeklyRampPercent)}
                        helpMetric="ramp"
                        helpText="Week-over-week distance change (7 days vs prior 7), anchored to the selected period end date. Displayed as % when prior-week distance exists; otherwise km/wk."
                        activeHelp={activeHelp}
                        onToggleHelp={setActiveHelp}
                        detail={getRampDetail(stats.weeklyRampPercent, stats.weeklyRampKm)}
                        tone="blue"
                        style={reveal(160)}
                    />
                    <StatCard
                        label="Consistency"
                        value={stats.consistencyScore.toString()}
                        unit="%"
                        icon={Target}
                        color={consistencyColorClass(stats.consistencyScore)}
                        helpMetric="consistency"
                        helpText="Score from recent weekly run frequency and stability, anchored to the selected period end date. 75+ strong routine, 50-74 building, below 50 inconsistent."
                        activeHelp={activeHelp}
                        onToggleHelp={setActiveHelp}
                        detail={getConsistencyDetail(stats.consistencyScore)}
                        tone="green"
                        style={reveal(200)}
                    />
                    <StatCard
                        label="Long Run %"
                        value={stats.longRunRatio !== null ? stats.longRunRatio.toFixed(0) : '--'}
                        unit="%"
                        icon={PieChart}
                        color={longRunRatioColorClass(stats.longRunRatio)}
                        helpMetric="longRunRatio"
                        helpText="Longest run as a % of that anchored week's total distance. Around 20-35% is common; very high values may indicate imbalance."
                        activeHelp={activeHelp}
                        onToggleHelp={setActiveHelp}
                        detail={getLongRunDetail(stats.longRunRatio)}
                        tone="gold"
                        style={reveal(240)}
                    />
                    <StatCard
                        label="Efficiency"
                        value={stats.efficiencyIndex !== null ? stats.efficiencyIndex.toFixed(2) : '--'}
                        unit="m/beat"
                        icon={HeartPulse}
                        color={efficiencyColorClass(stats.efficiencyIndex)}
                        helpMetric="efficiency"
                        helpText="Distance per heartbeat over trailing 28 days (anchored). Higher is better. Rough guide: <1.00 low, 1.00-1.19 moderate, >=1.20 strong. Example: 0.94 means ~0.94m per heartbeat and suggests room to improve aerobic efficiency."
                        activeHelp={activeHelp}
                        onToggleHelp={setActiveHelp}
                        detail={getEfficiencyDetail(stats.efficiencyIndex)}
                        tone="green"
                        style={reveal(280)}
                    />
                    <StatCard
                        label="GAP Trend"
                        value={formatSignedSeconds(stats.gapTrendSecPerKm)}
                        unit="s/km"
                        icon={Mountain}
                        color={gapTrendColorClass(stats.gapTrendSecPerKm)}
                        helpMetric="gapTrend"
                        helpText="Change in estimated GAP pace: latest 14 days vs prior 14 (anchored). Negative is improving (faster), positive is slowing."
                        activeHelp={activeHelp}
                        onToggleHelp={setActiveHelp}
                        detail={getGapTrendDetail(stats.gapTrendSecPerKm)}
                        tone="blue"
                        style={reveal(320)}
                    />
                </div>
            </div>
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
}: StatCardProps) {
    const showHelp = !!helpMetric && activeHelp === helpMetric;
    const isCompact = !helpMetric;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});

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
            className={`rv-panel rv-stat-card rv-reveal-subtle rv-spotlight relative overflow-hidden transition-all duration-300 group hover:-translate-y-1 hover:border-[var(--rv-border-strong)] ${isCompact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'}`}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
            <div className={`mb-3 flex items-center gap-2 ${isCompact ? 'pr-3' : 'pr-6'}`}>
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
                <span className={`rv-data ${isCompact ? 'text-[1.5rem] sm:text-[1.85rem]' : 'text-[1.8rem] sm:text-[2.15rem]'} ${color}`}>{value}</span>
                <span className="rv-mini-label tracking-[0.18em]">{unit}</span>
            </div>
            {detail && (
                <p className="rv-body-copy-sm mt-2 max-w-[24ch]">
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
