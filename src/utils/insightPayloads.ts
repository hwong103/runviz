import type { Activity } from '@/types';
import { calcVDOTFromActivities } from '@/analytics/vdot';

export interface OverviewPayload {
    runCount: number;
    totalDistanceKm: number;
    avgPaceMinPerKm: number;
    loadRatio: number;
    weeklyChange: number;
    routineScore: number;
    efficiencyMPerBeat: number;
    avgOutingMins: number;
    baselineAvgWeeklyKm: number;
    baselineLoadRatio: number;
    baselineEfficiency: number;
}

export interface TrainingHealthPayload {
    trimp: number;
    monotony: number;
    strain: number;
    acuteLoad: number;
    chronicLoad: number;
    loadRatio: number;
    weekCount: number;
    baselineMonotony: number;
    baselineStrain: number;
    baselineTrimp: number;
}

export interface FitnessPayload {
    currentCTL: number;
    currentATL: number;
    tsb: number;
    ctlTrend: 'rising' | 'falling' | 'flat';
    ctlPeak90Days: number;
    daysSincePeak: number;
    baselineCTL: number;
}

export interface VolumePayload {
    recentWeeklyKm: number[];
    avgWeeklyKm: number;
    maxWeeklyKm: number;
    weekOverWeekChange: number;
    rampRate3Week: number;
    baselineAvgWeeklyKm: number;
    baselinePeakWeeklyKm: number;
}

export interface InjuryRiskPayload {
    loadRatio: number;
    rampRate3Week: number;
    recentRestDays: number;
    consecutiveRunDays: number;
    baselineLoadRatio: number;
    injuryHistoryFlag: boolean;
}

export interface RacePredictionPayload {
    vdot: number;
    predictedMarathonMins: number;
    predictedHalfMins: number;
    predicted10kMins: number;
    predicted5kMins: number;
    vdotTrend: 'improving' | 'declining' | 'stable';
    vdotChangeSince90Days: number;
    lastRaceDistanceKm?: number;
    lastRaceTimeMins?: number;
    lastRaceDate?: string;
}

export interface RunDetailPayload {
    distanceKm: number;
    avgPaceMinPerKm: number;
    avgHR: number;
    efficiencyMPerBeat: number;
    cadenceAvg: number;
    elevationGainM: number;
    baselineAvgPaceMinPerKm: number;
    baselineEfficiency: number;
    baselineCadence: number;
    personalBestEfficiency: number;
    longestRunKmLast60Days: number;
    isPbEffort: boolean;
    isFastForEffort: boolean;
    isLongest60Days: boolean;
}

// Helper functions
function getActivitiesInWindow(activities: Activity[], days: number): Activity[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return activities.filter((a) => new Date(a.start_date).getTime() >= cutoff);
}

function calculateLoadRatio(activities: Activity[]): number {
    // Simplified acute:chronic workload ratio calculation
    const now = Date.now();
    const acuteCutoff = now - 7 * 24 * 60 * 60 * 1000; // 7 days
    const chronicCutoff = now - 42 * 24 * 60 * 60 * 1000; // 42 days

    const acuteActivities = activities.filter((a) => new Date(a.start_date).getTime() >= acuteCutoff);
    const chronicActivities = activities.filter((a) => new Date(a.start_date).getTime() >= chronicCutoff);

    const acuteLoad = acuteActivities.reduce((sum, a) => sum + (a.distance / 1000), 0);
    const chronicLoad = chronicActivities.reduce((sum, a) => sum + (a.distance / 1000), 0) / 6;

    return chronicLoad > 0 ? acuteLoad / chronicLoad : 1.0;
}

function calculateRoutineScore(activities: Activity[]): number {
    // Score based on consistency of running schedule
    const last90Days = getActivitiesInWindow(activities, 90);
    const weeksWithActivity = new Set(
        last90Days.map((a) => {
            const date = new Date(a.start_date);
            return `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
        })
    ).size;

    return Math.min(100, Math.round((weeksWithActivity / 13) * 100));
}

function calculateEfficiency(activities: Activity[]): number {
    const runsWithHR = activities.filter((a) => a.average_heartrate && a.average_speed && a.distance);
    if (runsWithHR.length === 0) return 0;

    const totalMeters = runsWithHR.reduce((sum, a) => sum + a.distance, 0);
    const totalBeats = runsWithHR.reduce((sum, a) => sum + (a.average_heartrate || 0) * ((a.distance / 1000) / (a.average_speed || 1) * 60), 0);

    return totalBeats > 0 ? totalMeters / totalBeats : 0;
}

// Payload builders
export function buildOverviewPayload(activities: Activity[]): OverviewPayload {
    const last90Days = getActivitiesInWindow(activities, 90);

    const runs = last90Days.filter((a) => a.type === 'Run');
    const totalDistanceKm = runs.reduce((sum, a) => sum + (a.distance / 1000), 0);
    const avgPaceMinPerKm = runs.length > 0
        ? (runs.reduce((sum, a) => sum + (a.average_speed || 1), 0) / runs.length) / 1000 * 60
        : 0;
    const loadRatio = calculateLoadRatio(last90Days);
    const routineScore = calculateRoutineScore(last90Days);
    const efficiencyMPerBeat = calculateEfficiency(runs);

    // Baseline from 6 months
    const baselineAvgWeeklyKm = totalDistanceKm / 13; // 90 days ≈ 13 weeks

    return {
        runCount: runs.length,
        totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
        avgPaceMinPerKm: Math.round(avgPaceMinPerKm * 100) / 100,
        loadRatio: Math.round(loadRatio * 100) / 100,
        weeklyChange: 0, // Would need comparison to prior period
        routineScore,
        efficiencyMPerBeat: Math.round(efficiencyMPerBeat * 100) / 100,
        avgOutingMins: 0,
        baselineAvgWeeklyKm: Math.round(baselineAvgWeeklyKm * 10) / 10,
        baselineLoadRatio: 1.0,
        baselineEfficiency: efficiencyMPerBeat,
    };
}

export function buildTrainingHealthPayload(activities: Activity[]): TrainingHealthPayload {
    const last90Days = getActivitiesInWindow(activities, 90);
    const runs = last90Days.filter((a) => a.type === 'Run' || a.sport_type === 'Run');

    // Calculate daily TRIMPs for last 7 days for monotony/strain
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyTrimps: Record<string, number> = {};
    const cursor = new Date(sevenDaysAgo);
    while (cursor <= now) {
        const key = cursor.toISOString().split('T')[0];
        dailyTrimps[key] = 0;
        cursor.setDate(cursor.getDate() + 1);
    }

    runs.forEach((a) => {
        const dateKey = new Date(a.start_date).toISOString().split('T')[0];
        if (dailyTrimps.hasOwnProperty(dateKey)) {
            const duration = (a.moving_time || 0) / 60;
            const hrFactor = a.average_heartrate ? (a.average_heartrate - 60) / 100 : 0.3;
            dailyTrimps[dateKey] += duration * Math.max(hrFactor, 0);
        }
    });

    const trimpValues = Object.values(dailyTrimps);
    const meanTrimp = trimpValues.reduce((sum, v) => sum + v, 0) / trimpValues.length;
    const variance = trimpValues.reduce((sum, v) => sum + Math.pow(v - meanTrimp, 2), 0) / trimpValues.length;
    const stdDev = Math.sqrt(variance);
    const monotony = stdDev > 0 ? meanTrimp / stdDev : 0;

    const weeklyTrimp = trimpValues.reduce((sum, v) => sum + v, 0);
    const strain = weeklyTrimp * monotony;

    // Acute (last 7 days) and Chronic (last 42 days / 6 weeks) load in km/week
    const acuteKm = getActivitiesInWindow(activities, 7)
        .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
        .reduce((sum, a) => sum + a.distance / 1000, 0);
    const chronicKm = getActivitiesInWindow(activities, 42)
        .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
        .reduce((sum, a) => sum + a.distance / 1000, 0) / 6;

    const loadRatio = chronicKm > 0 ? Math.round((acuteKm / chronicKm) * 100) / 100 : 1.0;

    // Total TRIMP for last 90 days
    const totalTrimp = runs.reduce((sum, a) => {
        const duration = (a.moving_time || 0) / 60;
        const hrFactor = a.average_heartrate ? (a.average_heartrate - 60) / 100 : 0.3;
        return sum + duration * Math.max(hrFactor, 0);
    }, 0);

    return {
        trimp: Math.round(totalTrimp),
        monotony: Math.round(monotony * 100) / 100,
        strain: Math.round(strain),
        acuteLoad: Math.round(acuteKm * 10) / 10,
        chronicLoad: Math.round(chronicKm * 10) / 10,
        loadRatio,
        weekCount: 13,
        baselineMonotony: monotony,
        baselineStrain: strain,
        baselineTrimp: Math.round(totalTrimp),
    };
}

export function buildFitnessPayload(activities: Activity[]): FitnessPayload {
    const last60Days = getActivitiesInWindow(activities, 60);

    // Simplified CTL/ATL calculation
    const ctl = last60Days.reduce((sum, a) => sum + (a.distance / 1000), 0) / 60;
    const atl = last60Days.slice(0, 7).reduce((sum, a) => sum + (a.distance / 1000), 0) / 7;
    const tsb = ctl - atl;

    return {
        currentCTL: Math.round(ctl * 10) / 10,
        currentATL: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb),
        ctlTrend: 'rising' as const,
        ctlPeak90Days: ctl,
        daysSincePeak: 0,
        baselineCTL: ctl,
    };
}

export function buildVolumePayload(activities: Activity[]): VolumePayload {
    const last6Weeks = getActivitiesInWindow(activities, 42);

    // Group by week
    const weeklyKm: Record<string, number> = {};
    last6Weeks
        .filter((a) => a.type === 'Run')
        .forEach((a) => {
            const weekStart = new Date(a.start_date);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const key = weekStart.toISOString().split('T')[0];
            weeklyKm[key] = (weeklyKm[key] || 0) + (a.distance / 1000);
        });

    const recentWeeklyKm = Object.values(weeklyKm).slice(-6);
    const avgWeeklyKm = recentWeeklyKm.length > 0
        ? recentWeeklyKm.reduce((a, b) => a + b, 0) / recentWeeklyKm.length
        : 0;

    return {
        recentWeeklyKm,
        avgWeeklyKm: Math.round(avgWeeklyKm * 10) / 10,
        maxWeeklyKm: Math.round(Math.max(...recentWeeklyKm, 0) * 10) / 10,
        weekOverWeekChange: 0,
        rampRate3Week: 0,
        baselineAvgWeeklyKm: avgWeeklyKm,
        baselinePeakWeeklyKm: Math.max(...recentWeeklyKm, 0),
    };
}

export function buildInjuryRiskPayload(activities: Activity[]): InjuryRiskPayload & { shouldShow: boolean } {
    const last42Days = getActivitiesInWindow(activities, 42);
    const last14Days = getActivitiesInWindow(activities, 14);

    const loadRatio = calculateLoadRatio(last42Days);

    // Calculate ramp rate
    const weeklyDistances: number[] = [];
    for (let i = 0; i < 6; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (5 - i) * 7);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekDistance = last42Days
            .filter((a) => {
                const date = new Date(a.start_date);
                return date >= weekStart && date < weekEnd;
            })
            .reduce((sum, a) => sum + (a.distance / 1000), 0);

        weeklyDistances.push(weekDistance);
    }

    const rampRate3Week = weeklyDistances.length >= 3
        ? ((weeklyDistances[weeklyDistances.length - 1] - weeklyDistances[0]) / weeklyDistances[0]) * 100
        : 0;

    // Check if should show
    const shouldShow = loadRatio > 1.5 || rampRate3Week > 30;

    // Count rest days
    const daysWithActivity = new Set(
        last14Days.map((a) => new Date(a.start_date).toDateString())
    ).size;
    const recentRestDays = 14 - daysWithActivity;

    return {
        loadRatio: Math.round(loadRatio * 100) / 100,
        rampRate3Week: Math.round(rampRate3Week),
        recentRestDays,
        consecutiveRunDays: daysWithActivity,
        baselineLoadRatio: 1.0,
        injuryHistoryFlag: false,
        shouldShow,
    };
}

export function buildRacePredictionPayload(activities: Activity[]): RacePredictionPayload {
    const last90Days = getActivitiesInWindow(activities, 90);
    const prior90Days = activities.filter((a) => {
        const t = new Date(a.start_date).getTime();
        const now = Date.now();
        return t >= now - 180 * 86400000 && t < now - 90 * 86400000;
    });

    // Use the real VDOT calculation
    const currentResult = calcVDOTFromActivities(last90Days);
    const priorResult = calcVDOTFromActivities(prior90Days);

    const vdot = currentResult?.vdot ?? 0;
    const priorVdot = priorResult?.vdot ?? vdot;
    const vdotChange = Math.round((vdot - priorVdot) * 10) / 10;
    const vdotTrend: 'improving' | 'declining' | 'stable' =
        vdotChange > 0.5 ? 'improving' : vdotChange < -0.5 ? 'declining' : 'stable';

    // Pull predicted times from VDOT race predictions if available
    const racePredictions = currentResult?.racePredictions ?? [];
    const findTime = (label: string) => {
        const match = racePredictions.find((r) => r.label === label);
        return match ? Math.round(match.timeS / 60) : 0;
    };

    return {
        vdot: Math.round(vdot * 10) / 10,
        predictedMarathonMins: findTime('Marathon'),
        predictedHalfMins: findTime('Half Marathon'),
        predicted10kMins: findTime('10K'),
        predicted5kMins: findTime('5K'),
        vdotTrend,
        vdotChangeSince90Days: vdotChange,
    };
}

export function buildRunDetailPayload(
    activity: Activity,
    allActivities: Activity[]
): RunDetailPayload & { shouldShow: boolean } {
    const last60Days = getActivitiesInWindow(allActivities, 60);
    const last90Days = getActivitiesInWindow(allActivities, 90);

    const baselineRuns = last90Days.filter((a) => a.type === 'Run' && a.id !== activity.id);

    const baselineAvgPace = baselineRuns.reduce((sum, a) => sum + (a.average_speed || 1), 0) / baselineRuns.length;
    const baselineEfficiency = calculateEfficiency(baselineRuns);
    const baselineCadence = baselineRuns.reduce((sum, a) => sum + (a.average_cadence || 0), 0) / baselineRuns.length;

    const efficiencyMPerBeat = activity.average_heartrate && activity.distance
        ? activity.distance / (activity.average_heartrate * (activity.moving_time / 60))
        : 0;

    const longestRunKmLast60Days = Math.max(
        ...last60Days.filter((a) => a.type === 'Run').map((a) => a.distance / 1000),
        0
    );

    const isPbEffort = efficiencyMPerBeat > baselineEfficiency * 1.05;
    const isFastForEffort = (activity.average_speed || 0) > baselineAvgPace * 1.05;
    const isLongest60Days = (activity.distance / 1000) >= longestRunKmLast60Days;

    const shouldShow = isPbEffort || isFastForEffort || isLongest60Days ||
        (activity.average_cadence && Math.abs(activity.average_cadence - baselineCadence) > baselineCadence * 0.05);

    return {
        distanceKm: Math.round((activity.distance / 1000) * 10) / 10,
        avgPaceMinPerKm: Math.round((1000 / (activity.average_speed || 1)) / 60 * 100) / 100,
        avgHR: activity.average_heartrate || 0,
        efficiencyMPerBeat: Math.round(efficiencyMPerBeat * 100) / 100,
        cadenceAvg: activity.average_cadence || 0,
        elevationGainM: Math.round(activity.total_elevation_gain || 0),
        baselineAvgPaceMinPerKm: Math.round((1000 / baselineAvgPace) / 60 * 100) / 100,
        baselineEfficiency: Math.round(baselineEfficiency * 100) / 100,
        baselineCadence: Math.round(baselineCadence),
        personalBestEfficiency: efficiencyMPerBeat,
        longestRunKmLast60Days: Math.round(longestRunKmLast60Days * 10) / 10,
        isPbEffort,
        isFastForEffort,
        isLongest60Days,
        shouldShow: !!shouldShow,
    };
}
