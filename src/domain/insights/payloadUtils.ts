import { activitiesToDailyLoads, calculateTrainingLoadHistory } from '@/analytics/trainingLoad';
import type { ViewPeriod } from '@/lib/dashboard';
import type { Activity } from '@/types/activity';
import type { TrainingLoadMetrics } from '@/types/analytics';
import { isRun } from '@/types/activity';
import { parseActivityLocalDate } from '@/utils/activityDate';

import type { TrainingPhaseContext } from './payloadTypes';

export function roundTo(value: number, digits = 1): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

export function toRunActivities(activities: Activity[]): Activity[] {
    return activities
        .filter(isRun)
        .sort((left, right) => parseActivityLocalDate(left.start_date_local).getTime() - parseActivityLocalDate(right.start_date_local).getTime());
}

export function getSelectedPeriodEnd(period?: ViewPeriod): Date {
    const now = new Date();
    if (!period || period.mode === 'all') return now;

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

export function viewPeriodToDays(viewPeriod: ViewPeriod): number {
    if (viewPeriod.mode === '30d') return 30;
    if (viewPeriod.mode === '365d') return 365;
    if (viewPeriod.mode === 'year') return 365;
    if (viewPeriod.mode === 'month') return 30;
    return 90;
}

export function getInsightWindowLabel(days: number): string {
    return `Based on last ${days} days`;
}

export function getWindowBounds(anchorDate: Date, days: number): { start: Date; end: Date } {
    const end = new Date(anchorDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end };
}

export function getActivitiesInWindowEndingAt(activities: Activity[], anchorDate: Date, days: number): Activity[] {
    const { start, end } = getWindowBounds(anchorDate, days);
    return toRunActivities(activities).filter((activity) => {
        const date = parseActivityLocalDate(activity.start_date_local);
        return date >= start && date <= end;
    });
}

export function getPriorWindowActivities(activities: Activity[], anchorDate: Date, days: number): Activity[] {
    const priorEnd = getPriorWindowEnd(anchorDate, days);
    return getActivitiesInWindowEndingAt(activities, priorEnd, days);
}

export function getPriorWindowEnd(anchorDate: Date, days: number): Date {
    const currentWindow = getWindowBounds(anchorDate, days);
    const priorEnd = new Date(currentWindow.start);
    priorEnd.setDate(priorEnd.getDate() - 1);
    priorEnd.setHours(23, 59, 59, 999);
    return priorEnd;
}

export function getAveragePaceMinPerKm(activities: Activity[]): number {
    const totals = activities.reduce(
        (acc, activity) => {
            acc.distance += activity.distance;
            acc.time += activity.moving_time;
            return acc;
        },
        { distance: 0, time: 0 }
    );

    if (totals.distance <= 0 || totals.time <= 0) return 0;
    return (totals.time / totals.distance) * 1000 / 60;
}

export function getAverageOutingMinutes(activities: Activity[]): number {
    if (activities.length === 0) return 0;
    return activities.reduce((sum, activity) => sum + activity.moving_time / 60, 0) / activities.length;
}

export function getTotalDistanceKm(activities: Activity[]): number {
    return activities.reduce((sum, activity) => sum + activity.distance / 1000, 0);
}

export function countActiveWeeks(activities: Activity[]): number {
    const weeks = new Set(
        activities.map((activity) => {
            const date = parseActivityLocalDate(activity.start_date_local);
            const year = date.getFullYear();
            const startOfYear = new Date(year, 0, 1);
            const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
            return `${year}-${Math.floor(dayOfYear / 7)}`;
        })
    );
    return weeks.size;
}

export function getWeeklyTotalsEndingAt(activities: Activity[], anchorDate: Date, weeks: number): number[] {
    const totals: number[] = [];

    for (let index = weeks - 1; index >= 0; index -= 1) {
        const weekEnd = new Date(anchorDate);
        weekEnd.setHours(23, 59, 59, 999);
        weekEnd.setDate(weekEnd.getDate() - index * 7);

        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);

        const total = toRunActivities(activities).reduce((sum, activity) => {
            const date = parseActivityLocalDate(activity.start_date_local);
            if (date < weekStart || date > weekEnd) return sum;
            return sum + activity.distance / 1000;
        }, 0);

        totals.push(roundTo(total, 1));
    }

    return totals;
}

export function countActiveRollingWeeks(activities: Activity[], anchorDate: Date, weeks: number): number {
    return getWeeklyTotalsEndingAt(activities, anchorDate, weeks).filter((total) => total > 0).length;
}

export function get3WeekRampRate(weeklyTotals: number[]): number {
    if (weeklyTotals.length < 4) return 0;
    const recent = weeklyTotals.slice(-3);
    const previous = weeklyTotals.slice(-6, -3);
    if (recent.length === 0 || previous.length === 0) return 0;

    const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const previousAvg = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (previousAvg <= 0) return 0;

    return ((recentAvg - previousAvg) / previousAvg) * 100;
}

export function getLatestTrainingMetrics(activities: Activity[], endDate: Date, days: number, maxHR = 185): TrainingLoadMetrics[] {
    const runs = toRunActivities(activities);
    if (runs.length === 0) return [];

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const dailyLoads = activitiesToDailyLoads(runs, maxHR, 60);
    return calculateTrainingLoadHistory(dailyLoads, startDate, endDate);
}

export function getConsecutiveRunDays(activities: Activity[], anchorDate: Date): number {
    const runDays = new Set(
        toRunActivities(activities)
            .filter((activity) => parseActivityLocalDate(activity.start_date_local) <= anchorDate)
            .map((activity) => parseActivityLocalDate(activity.start_date_local).toDateString())
    );

    let streak = 0;
    const cursor = new Date(anchorDate);
    cursor.setHours(0, 0, 0, 0);

    while (runDays.has(cursor.toDateString())) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

export function getRunDaysInWindow(activities: Activity[], anchorDate: Date, days: number): Date[] {
    const runDays = new Set(
        getActivitiesInWindowEndingAt(activities, anchorDate, days).map((activity) =>
            parseActivityLocalDate(activity.start_date_local).toDateString()
        )
    );

    return Array.from(runDays)
        .map((date) => new Date(date))
        .sort((left, right) => left.getTime() - right.getTime());
}

export function getLongestGapDaysInWindow(activities: Activity[], anchorDate: Date, days: number): number {
    const { start, end } = getWindowBounds(anchorDate, days);
    const runDays = getRunDaysInWindow(activities, anchorDate, days);

    if (runDays.length === 0) {
        return days;
    }

    let longestGap = Math.max(
        0,
        Math.floor((runDays[0].getTime() - start.getTime()) / 86400000)
    );

    for (let index = 1; index < runDays.length; index += 1) {
        const diffDays = Math.floor((runDays[index].getTime() - runDays[index - 1].getTime()) / 86400000) - 1;
        longestGap = Math.max(longestGap, diffDays);
    }

    const trailingGap = Math.max(
        0,
        Math.floor((end.getTime() - runDays[runDays.length - 1].getTime()) / 86400000)
    );

    return Math.max(longestGap, trailingGap);
}

export function deriveTrainingPhaseContext(
    activities: Activity[],
    anchorDate: Date,
    baselineAvgWeeklyKm: number,
    weeklyChange: number | null,
): TrainingPhaseContext {
    const recent14RunDays = getRunDaysInWindow(activities, anchorDate, 14).length;
    const weeklyTotals = getWeeklyTotalsEndingAt(activities, anchorDate, 6);
    const activeWeeksLast6 = countActiveRollingWeeks(activities, anchorDate, 6);
    const longestGapDaysLast42 = getLongestGapDaysInWindow(activities, anchorDate, 42);
    const currentWeeklyKm = weeklyTotals[weeklyTotals.length - 1] ?? 0;
    const previousWeeklyKm = weeklyTotals[weeklyTotals.length - 2] ?? 0;
    const lowBaseline = baselineAvgWeeklyKm > 0 && currentWeeklyKm <= baselineAvgWeeklyKm * 0.7;

    if (longestGapDaysLast42 >= 7 || activeWeeksLast6 <= 3 || recent14RunDays <= 4) {
        return {
            trainingPhase: 'rebuild',
            phaseExplanation: 'Recent gaps or a shallow recent baseline suggest you are rebuilding rather than overloading.',
            activeWeeksLast6,
            longestGapDaysLast42,
            recentRunDays14d: recent14RunDays,
            currentWeeklyKm: roundTo(currentWeeklyKm, 1),
            previousWeeklyKm: roundTo(previousWeeklyKm, 1),
        };
    }

    if ((weeklyChange ?? 0) <= -15 || lowBaseline) {
        return {
            trainingPhase: 'down-week',
            phaseExplanation: 'Recent volume is below baseline, which looks more like consolidation or a down week than a hard push.',
            activeWeeksLast6,
            longestGapDaysLast42,
            recentRunDays14d: recent14RunDays,
            currentWeeklyKm: roundTo(currentWeeklyKm, 1),
            previousWeeklyKm: roundTo(previousWeeklyKm, 1),
        };
    }

    if ((weeklyChange ?? 0) >= 8 || (previousWeeklyKm > 0 && currentWeeklyKm > previousWeeklyKm * 1.08)) {
        return {
            trainingPhase: 'build',
            phaseExplanation: 'This looks like a building phase, so some upward pressure in load can be appropriate if other markers stay stable.',
            activeWeeksLast6,
            longestGapDaysLast42,
            recentRunDays14d: recent14RunDays,
            currentWeeklyKm: roundTo(currentWeeklyKm, 1),
            previousWeeklyKm: roundTo(previousWeeklyKm, 1),
        };
    }

    return {
        trainingPhase: 'steady',
        phaseExplanation: 'Recent volume and routine look broadly stable relative to your baseline.',
        activeWeeksLast6,
        longestGapDaysLast42,
        recentRunDays14d: recent14RunDays,
        currentWeeklyKm: roundTo(currentWeeklyKm, 1),
        previousWeeklyKm: roundTo(previousWeeklyKm, 1),
    };
}

export function hasExtendedGap(activities: Activity[], gapDays = 21): boolean {
    const runs = toRunActivities(activities);
    for (let index = 1; index < runs.length; index += 1) {
        const previous = parseActivityLocalDate(runs[index - 1].start_date_local);
        const current = parseActivityLocalDate(runs[index].start_date_local);
        const diffDays = Math.floor((current.getTime() - previous.getTime()) / 86400000);
        if (diffDays >= gapDays) {
            return true;
        }
    }
    return false;
}

export function findLatestRaceLikeRun(activities: Activity[]): Activity | null {
    const raceDistances = [5000, 10000, 21097.5, 42195];
    const tolerance = 0.1;
    const candidates = toRunActivities(activities).filter((activity) =>
        raceDistances.some((distance) => Math.abs(activity.distance - distance) <= distance * tolerance)
    );
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export function getActivityEfficiency(activity: Activity): number {
    if (!activity.average_heartrate || !activity.moving_time || !activity.distance) return 0;
    return activity.distance / ((activity.average_heartrate / 60) * activity.moving_time);
}

export function getSimilarEffortBaselineRuns(activity: Activity, activities: Activity[], days: number): Activity[] {
    const anchorDate = parseActivityLocalDate(activity.start_date_local);
    const candidates = getActivitiesInWindowEndingAt(activities, anchorDate, days).filter((candidate) => candidate.id !== activity.id);

    if (!activity.average_heartrate) {
        return candidates;
    }

    const lowerBound = activity.average_heartrate * 0.95;
    const upperBound = activity.average_heartrate * 1.05;
    const similar = candidates.filter((candidate) => {
        if (!candidate.average_heartrate) return false;
        return candidate.average_heartrate >= lowerBound && candidate.average_heartrate <= upperBound;
    });

    return similar.length > 0 ? similar : candidates;
}
