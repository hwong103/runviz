import type { Activity } from '../types';
import { isRun } from '../types';
import { activitiesToDailyLoads, calculateTrainingLoadHistory } from './trainingLoad';
import { gapAdjustmentFactor } from './gapCalculator';
import { parseActivityLocalDate } from '../utils/activityDate';

interface WeeklyDistanceWindow {
    currentKm: number;
    previousKm: number;
}

function getWeeklyDistanceWindow(activities: Activity[], anchorDate: Date): WeeklyDistanceWindow {
    const end = new Date(anchorDate);
    end.setHours(23, 59, 59, 999);

    const startCurrent = new Date(end);
    startCurrent.setDate(end.getDate() - 6);
    startCurrent.setHours(0, 0, 0, 0);

    const endPrevious = new Date(startCurrent);
    endPrevious.setDate(startCurrent.getDate() - 1);
    endPrevious.setHours(23, 59, 59, 999);

    const startPrevious = new Date(endPrevious);
    startPrevious.setDate(endPrevious.getDate() - 6);
    startPrevious.setHours(0, 0, 0, 0);

    let currentKm = 0;
    let previousKm = 0;

    for (const activity of activities) {
        if (!isRun(activity)) continue;
        const d = parseActivityLocalDate(activity.start_date_local);
        if (d >= startCurrent && d <= end) {
            currentKm += activity.distance / 1000;
        } else if (d >= startPrevious && d <= endPrevious) {
            previousKm += activity.distance / 1000;
        }
    }

    return { currentKm, previousKm };
}

function getWeeklyRunCounts(activities: Activity[], anchorDate: Date, weeks = 6): number[] {
    const counts = Array.from({ length: weeks }, () => 0);
    const now = new Date(anchorDate);
    now.setHours(23, 59, 59, 999);

    for (const activity of activities) {
        if (!isRun(activity)) continue;
        const d = parseActivityLocalDate(activity.start_date_local);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) continue;
        const weekIndex = Math.floor(diffDays / 7);
        if (weekIndex >= 0 && weekIndex < weeks) {
            counts[weekIndex]++;
        }
    }

    return counts;
}

function standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

export function calculateAcwr(
    activities: Activity[],
    anchorDate: Date,
    maxHR = 185,
    restHR = 60
): number | null {
    const runs = activities.filter(a => isRun(a) && parseActivityLocalDate(a.start_date_local) <= anchorDate);
    if (runs.length === 0) return null;

    const dailyLoads = activitiesToDailyLoads(runs, maxHR, restHR);
    const dates = runs.map(r => parseActivityLocalDate(r.start_date_local));
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(anchorDate);

    const history = calculateTrainingLoadHistory(dailyLoads, start, end);
    if (history.length === 0) return null;

    const latest = history[history.length - 1];
    if (!latest || latest.ctl <= 0) return null;

    return latest.atl / latest.ctl;
}

export function calculateWeeklyRamp(activities: Activity[], anchorDate: Date): {
    rampKm: number;
    rampPercent: number | null;
} {
    const eligible = activities.filter(a => isRun(a) && parseActivityLocalDate(a.start_date_local) <= anchorDate);
    const { currentKm, previousKm } = getWeeklyDistanceWindow(eligible, anchorDate);
    const rampKm = currentKm - previousKm;
    const rampPercent = previousKm > 0 ? (rampKm / previousKm) * 100 : null;

    return { rampKm, rampPercent };
}

export function calculateConsistencyScore(activities: Activity[], anchorDate: Date, weeks = 6): number {
    const eligible = activities.filter(a => isRun(a) && parseActivityLocalDate(a.start_date_local) <= anchorDate);
    const counts = getWeeklyRunCounts(eligible, anchorDate, weeks);
    if (counts.every(c => c === 0)) return 0;

    const averageRuns = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    const sd = standardDeviation(counts);
    const cv = averageRuns > 0 ? sd / averageRuns : 1;

    const frequencyScore = Math.min(1, averageRuns / 4); // 4 runs/week target
    const stabilityScore = Math.max(0, 1 - Math.min(cv, 1));

    return Math.round((frequencyScore * 0.65 + stabilityScore * 0.35) * 100);
}

export function acwrColorClass(acwr: number | null): string {
    if (acwr === null) return 'text-gray-400';
    if (acwr > 1.5) return 'text-red-400';
    if (acwr > 1.3) return 'text-orange-400';
    if (acwr >= 0.8) return 'text-emerald-400';
    return 'text-yellow-400';
}

export function rampColorClass(rampPercent: number | null): string {
    if (rampPercent === null) return 'text-gray-400';
    if (rampPercent > 20) return 'text-red-400';
    if (rampPercent > 10) return 'text-orange-400';
    if (rampPercent >= -10) return 'text-emerald-400';
    return 'text-blue-400';
}

export function consistencyColorClass(score: number): string {
    if (score >= 75) return 'text-emerald-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-orange-400';
}

export function calculateLongRunRatio(
    activities: Activity[],
    anchorDate: Date
): { ratio: number | null; longestKm: number; weeklyKm: number } {
    const end = new Date(anchorDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const weeklyRuns = activities.filter(a => {
        if (!isRun(a)) return false;
        const d = parseActivityLocalDate(a.start_date_local);
        return d >= start && d <= end;
    });

    const weeklyKm = weeklyRuns.reduce((sum, a) => sum + a.distance / 1000, 0);
    const longestKm = weeklyRuns.reduce((max, a) => Math.max(max, a.distance / 1000), 0);
    const ratio = weeklyKm > 0 ? (longestKm / weeklyKm) * 100 : null;

    return { ratio, longestKm, weeklyKm };
}

export function longRunRatioColorClass(ratio: number | null): string {
    if (ratio === null) return 'text-gray-400';
    if (ratio > 45) return 'text-red-400';
    if (ratio > 35) return 'text-yellow-400';
    if (ratio >= 20) return 'text-emerald-400';
    return 'text-blue-400';
}

export function calculateEfficiencyIndex(
    activities: Activity[],
    anchorDate: Date,
    days = 28
): number | null {
    const end = new Date(anchorDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    let totalDistanceMeters = 0;
    let totalHeartBeats = 0;

    for (const a of activities) {
        if (!isRun(a) || !a.average_heartrate || a.average_heartrate <= 0) continue;
        const d = parseActivityLocalDate(a.start_date_local);
        if (d < start || d > end) continue;

        totalDistanceMeters += a.distance;
        totalHeartBeats += (a.average_heartrate / 60) * a.moving_time;
    }

    if (totalHeartBeats <= 0) return null;
    return totalDistanceMeters / totalHeartBeats; // meters per heartbeat, higher is better
}

export function efficiencyColorClass(index: number | null): string {
    if (index === null) return 'text-gray-400';
    if (index >= 1.2) return 'text-emerald-400';
    if (index >= 1.0) return 'text-yellow-400';
    return 'text-orange-400';
}

function estimatedGapPaceMinPerKm(activity: Activity): number | null {
    if (!isRun(activity) || activity.distance <= 0 || activity.moving_time <= 0) return null;

    const actualPaceMinKm = (activity.moving_time / activity.distance) * 1000 / 60;
    // Approximate mean grade from total climb over distance; clamp to sane range.
    const avgGrade = Math.min(0.25, Math.max(0, activity.total_elevation_gain / activity.distance));
    const adjustment = gapAdjustmentFactor(avgGrade);
    if (!isFinite(adjustment) || adjustment <= 0) return null;

    return actualPaceMinKm / adjustment;
}

function averageGapPaceInWindow(activities: Activity[], start: Date, end: Date): number | null {
    let weightedGapTime = 0;
    let totalDistanceKm = 0;

    for (const a of activities) {
        const d = parseActivityLocalDate(a.start_date_local);
        if (d < start || d > end) continue;

        const gapPace = estimatedGapPaceMinPerKm(a);
        if (!gapPace) continue;

        const distanceKm = a.distance / 1000;
        totalDistanceKm += distanceKm;
        weightedGapTime += gapPace * distanceKm;
    }

    if (totalDistanceKm <= 0) return null;
    return weightedGapTime / totalDistanceKm;
}

export function calculateGapTrend(
    activities: Activity[],
    anchorDate: Date
): number | null {
    const runs = activities.filter(a => isRun(a) && parseActivityLocalDate(a.start_date_local) <= anchorDate);
    if (runs.length === 0) return null;

    const endCurrent = new Date(anchorDate);
    endCurrent.setHours(23, 59, 59, 999);
    const startCurrent = new Date(endCurrent);
    startCurrent.setDate(endCurrent.getDate() - 13);
    startCurrent.setHours(0, 0, 0, 0);

    const endPrevious = new Date(startCurrent);
    endPrevious.setDate(startCurrent.getDate() - 1);
    endPrevious.setHours(23, 59, 59, 999);
    const startPrevious = new Date(endPrevious);
    startPrevious.setDate(endPrevious.getDate() - 13);
    startPrevious.setHours(0, 0, 0, 0);

    const currentGap = averageGapPaceInWindow(runs, startCurrent, endCurrent);
    const previousGap = averageGapPaceInWindow(runs, startPrevious, endPrevious);
    if (currentGap === null || previousGap === null) return null;

    // Negative means faster (improved) GAP pace.
    return (currentGap - previousGap) * 60; // sec/km delta
}

export function gapTrendColorClass(deltaSecPerKm: number | null): string {
    if (deltaSecPerKm === null) return 'text-gray-400';
    if (deltaSecPerKm <= -8) return 'text-emerald-400';
    if (deltaSecPerKm <= 5) return 'text-yellow-400';
    return 'text-orange-400';
}
