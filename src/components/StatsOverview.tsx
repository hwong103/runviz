import { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
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
        <div className="relative z-20 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-4">
            <StatCard
                label="Runs"
                value={stats.runCount.toString()}
                unit=""
                icon="🏃"
            />
            <StatCard
                label="Distance"
                value={stats.totalDistance.toFixed(1)}
                unit="km"
                icon="📏"
            />
            <StatCard
                label="Avg Duration"
                value={stats.avgDurationMins > 0 ? stats.avgDurationMins.toFixed(0) : '--'}
                unit="min"
                icon="⏱️"
                color="text-cyan-400"
            />
            <StatCard
                label="Avg Pace"
                value={stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--'}
                unit="/km"
                icon="⚡"
            />
            <StatCard
                label="Longest"
                value={stats.longestRun.toFixed(1)}
                unit="km"
                icon="🏆"
            />
            <StatCard
                label="Max Streak"
                value={stats.longestStreak.toString()}
                unit="days"
                icon="🔥"
                color="text-orange-400"
            />
            <StatCard
                label="ACWR"
                value={stats.acwr !== null ? stats.acwr.toFixed(2) : '--'}
                unit=""
                icon="⚖️"
                color={acwrColorClass(stats.acwr)}
                helpMetric="acwr"
                helpText="Acute:Chronic Workload Ratio (ATL/CTL), anchored to the selected period end date. 0.8-1.3 is generally balanced, >1.5 means a sharp load spike."
                activeHelp={activeHelp}
                onToggleHelp={setActiveHelp}
            />
            <StatCard
                label="Ramp"
                value={
                    stats.weeklyRampPercent !== null
                        ? `${stats.weeklyRampPercent >= 0 ? '+' : ''}${stats.weeklyRampPercent.toFixed(0)}`
                        : `${stats.weeklyRampKm >= 0 ? '+' : ''}${stats.weeklyRampKm.toFixed(1)}`
                }
                unit={stats.weeklyRampPercent !== null ? '%' : 'km/wk'}
                icon="📈"
                color={rampColorClass(stats.weeklyRampPercent)}
                helpMetric="ramp"
                helpText="Week-over-week distance change (7 days vs prior 7), anchored to the selected period end date. Displayed as % when prior-week distance exists; otherwise km/wk."
                activeHelp={activeHelp}
                onToggleHelp={setActiveHelp}
            />
            <StatCard
                label="Consistency"
                value={stats.consistencyScore.toString()}
                unit="%"
                icon="🎯"
                color={consistencyColorClass(stats.consistencyScore)}
                helpMetric="consistency"
                helpText="Score from recent weekly run frequency and stability, anchored to the selected period end date. 75+ strong routine, 50-74 building, below 50 inconsistent."
                activeHelp={activeHelp}
                onToggleHelp={setActiveHelp}
            />
            <StatCard
                label="Long Run %"
                value={stats.longRunRatio !== null ? stats.longRunRatio.toFixed(0) : '--'}
                unit="%"
                icon="🧱"
                color={longRunRatioColorClass(stats.longRunRatio)}
                helpMetric="longRunRatio"
                helpText="Longest run as a % of that anchored week's total distance. Around 20-35% is common; very high values may indicate imbalance."
                activeHelp={activeHelp}
                onToggleHelp={setActiveHelp}
            />
            <StatCard
                label="Efficiency"
                value={stats.efficiencyIndex !== null ? stats.efficiencyIndex.toFixed(2) : '--'}
                unit="m/beat"
                icon="❤️"
                color={efficiencyColorClass(stats.efficiencyIndex)}
                helpMetric="efficiency"
                helpText="Distance per heartbeat over trailing 28 days (anchored). Higher is better. Rough guide: <1.00 low, 1.00-1.19 moderate, >=1.20 strong. Example: 0.94 means ~0.94m per heartbeat and suggests room to improve aerobic efficiency."
                activeHelp={activeHelp}
                onToggleHelp={setActiveHelp}
            />
            <StatCard
                label="GAP Trend"
                value={formatSignedSeconds(stats.gapTrendSecPerKm)}
                unit="s/km"
                icon="⛰️"
                color={gapTrendColorClass(stats.gapTrendSecPerKm)}
                helpMetric="gapTrend"
                helpText="Change in estimated GAP pace: latest 14 days vs prior 14 (anchored). Negative is improving (faster), positive is slowing."
                activeHelp={activeHelp}
                onToggleHelp={setActiveHelp}
            />
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
    icon: string;
    color?: string;
    helpMetric?: HelpMetric;
    helpText?: string;
    activeHelp?: HelpMetric | null;
    onToggleHelp?: (metric: HelpMetric | null) => void;
}

function StatCard({
    label,
    value,
    unit,
    icon,
    color = "text-white",
    helpMetric,
    helpText,
    activeHelp,
    onToggleHelp,
}: StatCardProps) {
    const showHelp = !!helpMetric && activeHelp === helpMetric;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [tooltipAlign, setTooltipAlign] = useState<'left' | 'right'>('right');

    useEffect(() => {
        if (!showHelp || !cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const viewportMidpoint = window.innerWidth / 2;
        setTooltipAlign(rect.left < viewportMidpoint ? 'left' : 'right');
    }, [showHelp]);

    return (
        <div ref={cardRef} className={`relative bg-white/5 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/10 hover:border-white/20 transition-all duration-300 group ${showHelp ? 'z-30' : 'z-0'}`}>
            <div className="flex items-center gap-2 mb-3 pr-6">
                <span className="text-xl group-hover:scale-110 transition-transform duration-300">{icon}</span>
                <span className="text-[9px] sm:text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">{label}</span>
            </div>
            {helpMetric && helpText && onToggleHelp && (
                <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleHelp(showHelp ? null : helpMetric);
                        }}
                        className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-gray-400 hover:text-white transition-colors flex items-center justify-center"
                        aria-label={`Help for ${label}`}
                        title={`Help for ${label}`}
                    >
                        ?
                    </button>
                    {showHelp && (
                        <div className={`absolute top-10 z-50 w-64 max-w-[calc(100vw-1rem)] bg-[#1a1d24] border border-white/10 rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-200 ${tooltipAlign === 'left' ? 'left-2 right-auto' : 'right-2 left-auto'}`}>
                            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">{label}</div>
                            <div className="text-[11px] text-gray-300 leading-relaxed font-medium normal-case">
                                {helpText}
                            </div>
                        </div>
                    )}
                </>
            )}
            <div className="flex items-baseline gap-1 flex-wrap">
                <span className={`text-2xl sm:text-3xl font-black tracking-tighter ${color}`}>{value}</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{unit}</span>
            </div>
        </div>
    );
}
