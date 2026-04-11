import { differenceInCalendarDays, parseISO } from 'date-fns';

import {
    calculateAcwr,
    calculateConsistencyScore,
    calculateEfficiencyIndex,
    calculateGapTrend,
    calculateLongRunRatio,
    calculateMonotony,
    calculateStrainScore,
    calculateWeeklyRamp,
    acwrColorClass,
    consistencyColorClass,
    efficiencyColorClass,
    gapTrendColorClass,
    longRunRatioColorClass,
    rampColorClass,
} from '@/analytics/trainingHealth';
import { monotonyColorClass, strainColorClass } from '@/analytics/monotony';
import { activityLocalDateKey, parseActivityLocalDate } from '@/utils/activityDate';
import type { Activity } from '@/types/activity';
import { isRun } from '@/types/activity';
import type { ViewPeriod } from '@/lib/dashboard';
import type { TrainingHealthMetricKey } from '@/features/dashboard/stats/TrainingHealthTrendChart';

export interface StatsOverviewStats {
    runCount: number;
    totalDistance: number;
    avgDistance: number;
    avgPace: number;
    avgDurationMins: number;
    longestRun: number;
    acwr: number | null;
    weeklyRampKm: number;
    weeklyRampPercent: number | null;
    consistencyScore: number;
    longRunRatio: number | null;
    efficiencyIndex: number | null;
    gapTrendSecPerKm: number | null;
    monotony: number;
    strain: number;
    longestStreak: number;
    longestBreak: number;
}

export interface ToplineMetricModel {
    label: string;
    value: string;
    unit: string;
}

export interface SnapshotMetricModel {
    label: string;
    value: string;
    unit: string;
    detail: string;
}

export interface TrainingMetricModel {
    label: string;
    value: string;
    unit: string;
    color?: string;
    helpMetric: TrainingHealthMetricKey;
    helpText: string;
    detail: string;
    tone: 'blue' | 'green' | 'gold' | 'orange' | 'neutral';
    metricKey: TrainingHealthMetricKey;
    icon: 'scale' | 'trending' | 'target' | 'pie' | 'heart' | 'mountain';
}

export interface StatsOverviewModel {
    stats: StatsOverviewStats;
    overviewToplineMetrics: ToplineMetricModel[];
    snapshotMetrics: SnapshotMetricModel[];
    trainingMetrics: TrainingMetricModel[];
}

export function getSelectedPeriodEnd(period: ViewPeriod) {
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

function filterRunActivitiesByPeriod(activities: Activity[], period: ViewPeriod) {
    return activities.filter((activity) => {
        if (!isRun(activity)) return false;

        const date = parseActivityLocalDate(activity.start_date_local);
        const year = date.getFullYear();
        const month = date.getMonth();

        if (period.mode === 'all') return true;
        if (period.mode === 'year') return year === period.year;
        if (period.mode === 'month') return year === period.year && month === period.month;
        if (period.mode === '30d') {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            cutoff.setHours(0, 0, 0, 0);
            return date >= cutoff;
        }
        if (period.mode === '90d') {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 90);
            cutoff.setHours(0, 0, 0, 0);
            return date >= cutoff;
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 365);
        cutoff.setHours(0, 0, 0, 0);
        return date >= cutoff;
    });
}

function calculateStreaks(activities: Activity[]) {
    if (activities.length === 0) return { longestStreak: 0, longestBreak: 0 };

    const runDates = new Set(activities.map((activity) => activityLocalDateKey(activity.start_date_local)));
    const sortedDates = Array.from(runDates).sort();
    let longestStreak = 0;
    let currentStreak = 0;

    if (sortedDates.length > 0) {
        currentStreak = 1;
        longestStreak = 1;
        for (let index = 1; index < sortedDates.length; index += 1) {
            const previousDate = parseISO(sortedDates[index - 1]);
            const nextDate = parseISO(sortedDates[index]);
            const diffDays = differenceInCalendarDays(nextDate, previousDate);

            if (diffDays === 1) {
                currentStreak += 1;
            } else {
                currentStreak = 1;
            }

            longestStreak = Math.max(longestStreak, currentStreak);
        }
    }

    let longestBreak = 0;
    for (let index = 1; index < sortedDates.length; index += 1) {
        const previousDate = parseISO(sortedDates[index - 1]);
        const nextDate = parseISO(sortedDates[index]);
        const diffDays = differenceInCalendarDays(nextDate, previousDate) - 1;
        longestBreak = Math.max(longestBreak, diffDays);
    }

    return { longestStreak, longestBreak };
}

function formatPace(pace: number) {
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatSignedSeconds(seconds: number | null) {
    if (seconds === null) return '--';
    const abs = Math.abs(seconds);
    const sign = seconds > 0 ? '+' : '-';
    return `${sign}${abs.toFixed(0)}`;
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
    if (monotony > 2) return 'Recent load has been very repetitive';
    if (monotony > 1.5) return 'Variation is a little limited';
    return 'Training variety looks healthy';
}

function getStrainDetail(strain: number) {
    if (strain <= 0) return 'Need more recent TRIMP data to score strain';
    if (strain > 6000) return 'Load and repetition are both running hot';
    if (strain > 3000) return 'This block is carrying notable stress';
    return 'Overall stress looks manageable';
}

export function buildStatsOverviewModel({
    activities,
    period,
    selectedPeriodEnd,
    maxHR,
}: {
    activities: Activity[];
    period: ViewPeriod;
    selectedPeriodEnd: Date;
    maxHR: number;
}): StatsOverviewModel {
    const filteredActivities = filterRunActivitiesByPeriod(activities, period);
    const totalDistance = filteredActivities.reduce((sum, activity) => sum + activity.distance, 0);
    const totalTime = filteredActivities.reduce((sum, activity) => sum + activity.moving_time, 0);
    const avgPace = totalDistance > 0 ? (totalTime / totalDistance) * 1000 / 60 : 0;
    const avgDurationMins = filteredActivities.length > 0 ? totalTime / filteredActivities.length / 60 : 0;
    const longestRunDistance = filteredActivities.reduce((max, activity) => Math.max(max, activity.distance), 0);

    const streakData = calculateStreaks(filteredActivities);
    const acwr = calculateAcwr(filteredActivities, selectedPeriodEnd, maxHR);
    const weeklyRamp = calculateWeeklyRamp(filteredActivities, selectedPeriodEnd);
    const consistencyScore = calculateConsistencyScore(filteredActivities, selectedPeriodEnd);
    const longRunRatio = calculateLongRunRatio(filteredActivities, selectedPeriodEnd);
    const efficiencyIndex = calculateEfficiencyIndex(filteredActivities, selectedPeriodEnd);
    const gapTrendSecPerKm = calculateGapTrend(filteredActivities, selectedPeriodEnd);
    const monotony = calculateMonotony(filteredActivities, selectedPeriodEnd, maxHR);
    const strain = calculateStrainScore(filteredActivities, selectedPeriodEnd, maxHR);

    const stats: StatsOverviewStats = {
        runCount: filteredActivities.length,
        totalDistance: totalDistance / 1000,
        avgDistance: filteredActivities.length > 0 ? totalDistance / 1000 / filteredActivities.length : 0,
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

    return {
        stats,
        overviewToplineMetrics: [
            { label: 'Distance', value: stats.totalDistance.toFixed(1), unit: 'km' },
            { label: 'Avg Pace', value: stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--', unit: '/km' },
            { label: 'Longest', value: stats.longestRun.toFixed(1), unit: 'km' },
            { label: 'Avg Mileage', value: stats.avgDistance.toFixed(1), unit: 'km' },
        ],
        snapshotMetrics: [
            {
                label: 'Runs in View',
                value: stats.runCount.toString(),
                unit: '',
                detail: stats.avgDurationMins > 0
                    ? `${stats.avgDurationMins.toFixed(0)} min avg outing`
                    : 'Avg outing will appear after your next run',
            },
            {
                label: 'Load Ratio',
                value: stats.acwr !== null ? stats.acwr.toFixed(2) : '--',
                unit: '',
                detail: getAcwrDetail(stats.acwr),
            },
            {
                label: 'Weekly Change',
                value: stats.weeklyRampPercent !== null
                    ? `${stats.weeklyRampPercent >= 0 ? '+' : ''}${stats.weeklyRampPercent.toFixed(0)}`
                    : `${stats.weeklyRampKm >= 0 ? '+' : ''}${stats.weeklyRampKm.toFixed(1)}`,
                unit: stats.weeklyRampPercent !== null ? '%' : 'km',
                detail: getRampDetail(stats.weeklyRampPercent, stats.weeklyRampKm),
            },
            {
                label: 'Routine',
                value: stats.consistencyScore.toString(),
                unit: '%',
                detail: getConsistencyDetail(stats.consistencyScore),
            },
            {
                label: 'Efficiency',
                value: stats.efficiencyIndex !== null ? stats.efficiencyIndex.toFixed(2) : '--',
                unit: 'm/beat',
                detail: getEfficiencyDetail(stats.efficiencyIndex),
            },
        ],
        trainingMetrics: [
            {
                label: 'Load Ratio',
                value: stats.acwr !== null ? stats.acwr.toFixed(2) : '--',
                unit: '',
                icon: 'scale',
                color: acwrColorClass(stats.acwr),
                helpMetric: 'acwr',
                helpText: 'Acute:Chronic Workload Ratio (ACWR), anchored to the selected period end date. Around 0.8-1.3 is generally balanced, and above 1.5 signals a sharp load spike.',
                detail: getAcwrDetail(stats.acwr),
                tone: 'green',
                metricKey: 'acwr',
            },
            {
                label: 'Weekly Change',
                value: stats.weeklyRampPercent !== null
                    ? `${stats.weeklyRampPercent >= 0 ? '+' : ''}${stats.weeklyRampPercent.toFixed(0)}`
                    : `${stats.weeklyRampKm >= 0 ? '+' : ''}${stats.weeklyRampKm.toFixed(1)}`,
                unit: stats.weeklyRampPercent !== null ? '%' : 'km',
                icon: 'trending',
                color: rampColorClass(stats.weeklyRampPercent),
                helpMetric: 'ramp',
                helpText: 'Week-over-week distance change, anchored to the selected period end date. Percentage is shown when last week exists; otherwise the absolute kilometre change is used.',
                detail: getRampDetail(stats.weeklyRampPercent, stats.weeklyRampKm),
                tone: 'blue',
                metricKey: 'ramp',
            },
            {
                label: 'Routine',
                value: stats.consistencyScore.toString(),
                unit: '%',
                icon: 'target',
                color: consistencyColorClass(stats.consistencyScore),
                helpMetric: 'consistency',
                helpText: 'Consistency score from recent weekly run frequency and stability. 75+ suggests a strong routine, 50-74 is building, and below 50 is still uneven.',
                detail: getConsistencyDetail(stats.consistencyScore),
                tone: 'green',
                metricKey: 'consistency',
            },
            {
                label: 'Long Run Share',
                value: stats.longRunRatio !== null ? stats.longRunRatio.toFixed(0) : '--',
                unit: '%',
                icon: 'pie',
                color: longRunRatioColorClass(stats.longRunRatio),
                helpMetric: 'longRunRatio',
                helpText: 'Longest run as a share of that anchored week\'s total distance. Around 20-35% is common; much higher can indicate the week is too concentrated.',
                detail: getLongRunDetail(stats.longRunRatio),
                tone: 'gold',
                metricKey: 'longRunRatio',
            },
            {
                label: 'Efficiency',
                value: stats.efficiencyIndex !== null ? stats.efficiencyIndex.toFixed(2) : '--',
                unit: 'm/beat',
                icon: 'heart',
                color: efficiencyColorClass(stats.efficiencyIndex),
                helpMetric: 'efficiency',
                helpText: 'Distance per heartbeat over the trailing 28 days. Higher is better and usually reflects stronger aerobic efficiency.',
                detail: getEfficiencyDetail(stats.efficiencyIndex),
                tone: 'green',
                metricKey: 'efficiency',
            },
            {
                label: 'Climbing Trend',
                value: formatSignedSeconds(stats.gapTrendSecPerKm),
                unit: 's/km',
                icon: 'mountain',
                color: gapTrendColorClass(stats.gapTrendSecPerKm),
                helpMetric: 'gapTrend',
                helpText: 'Change in grade-adjusted pace between the latest 14 days and the 14 days before that. Negative means your climbing effort is getting faster.',
                detail: getGapTrendDetail(stats.gapTrendSecPerKm),
                tone: 'blue',
                metricKey: 'gapTrend',
            },
            {
                label: 'Monotony',
                value: stats.monotony > 0 ? stats.monotony.toFixed(2) : '--',
                unit: '',
                icon: 'target',
                color: monotonyColorClass(stats.monotony),
                helpMetric: 'monotony',
                helpText: 'Average daily TRIMP divided by day-to-day variation across the last 7 days. Lower values usually mean better variety.',
                detail: getMonotonyDetail(stats.monotony),
                tone: 'orange',
                metricKey: 'monotony',
            },
            {
                label: 'Strain',
                value: stats.strain > 0 ? stats.strain.toFixed(0) : '--',
                unit: '',
                icon: 'trending',
                color: strainColorClass(stats.strain),
                helpMetric: 'strain',
                helpText: '7-day total TRIMP multiplied by monotony. It is a simple check on how much load and repetition are stacking together.',
                detail: getStrainDetail(stats.strain),
                tone: 'orange',
                metricKey: 'strain',
            },
        ],
    };
}
