import type { Activity } from '../types/activity';
import { classifyRunEffort } from '../domain/insights/payloadUtils';
import { isRun } from '../types/activity';
import { parseActivityLocalDate } from './activityDate';

export interface CurrentWeekSummary {
    totalKm: number;
    runCount: number;
    avgPaceMinPerKm: number | null;
    avgHR: number | null;
    easyRuns: number;
    steadyRuns: number;
    thresholdRuns: number;
    intervalRuns: number;
    raceRuns: number;
    longRuns: number;
    loadRatio: number | null;
    currentWeekKey: string;
}

function getIsoWeekKey(date: Date): string {
    const monday = getWeekStart(date);
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const isoYear = thursday.getFullYear();
    const firstThursday = new Date(isoYear, 0, 4);
    const firstThursdayDay = firstThursday.getDay() || 7;
    firstThursday.setDate(firstThursday.getDate() + (4 - firstThursdayDay));
    const weekNum = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
    return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekStart(date: Date): Date {
    const dayOfWeek = date.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

export function buildCurrentWeekSummary(
    activities: Activity[],
    loadRatio: number | null = null,
): CurrentWeekSummary {
    const now = new Date();
    const currentWeekKey = getIsoWeekKey(now);
    const monday = getWeekStart(now);

    const thisWeekRuns = activities
        .filter(isRun)
        .filter((activity) => parseActivityLocalDate(activity.start_date_local) >= monday);

    if (thisWeekRuns.length === 0) {
        return {
            totalKm: 0,
            runCount: 0,
            avgPaceMinPerKm: null,
            avgHR: null,
            easyRuns: 0,
            steadyRuns: 0,
            thresholdRuns: 0,
            intervalRuns: 0,
            raceRuns: 0,
            longRuns: 0,
            loadRatio,
            currentWeekKey,
        };
    }

    const totalDistance = thisWeekRuns.reduce((sum, activity) => sum + activity.distance, 0);
    const totalTime = thisWeekRuns.reduce((sum, activity) => sum + activity.moving_time, 0);
    const avgPaceMinPerKm = totalTime > 0 && totalDistance > 0
        ? (totalTime / totalDistance) * 1000 / 60
        : null;

    const runsWithHR = thisWeekRuns.filter((activity) => activity.average_heartrate);
    const avgHR = runsWithHR.length > 0
        ? Math.round(runsWithHR.reduce((sum, activity) => sum + activity.average_heartrate!, 0) / runsWithHR.length)
        : null;

    const referencePace = avgPaceMinPerKm;
    const classified = thisWeekRuns.map((activity) => classifyRunEffort(activity, referencePace));
    const distanceThresholdKm = Math.max(
        14,
        ((thisWeekRuns.reduce((sum, activity) => sum + (activity.distance / 1000), 0) / thisWeekRuns.length) || 0) * 1.35,
    );
    const longRuns = thisWeekRuns.filter((activity) =>
        activity.moving_time >= 75 * 60 || (activity.distance / 1000) >= distanceThresholdKm
    ).length;

    return {
        totalKm: Math.round((totalDistance / 1000) * 10) / 10,
        runCount: thisWeekRuns.length,
        avgPaceMinPerKm: avgPaceMinPerKm !== null ? Math.round(avgPaceMinPerKm * 100) / 100 : null,
        avgHR,
        easyRuns: classified.filter((value) => value === 'easy').length,
        steadyRuns: classified.filter((value) => value === 'steady').length,
        thresholdRuns: classified.filter((value) => value === 'threshold').length,
        intervalRuns: classified.filter((value) => value === 'interval').length,
        raceRuns: classified.filter((value) => value === 'race').length,
        longRuns,
        loadRatio,
        currentWeekKey,
    };
}
