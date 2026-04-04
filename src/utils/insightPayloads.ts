import { calculateAcwr, calculateConsistencyScore, calculateEfficiencyIndex, calculateMonotony, calculateStrainScore, calculateWeeklyRamp } from '@/analytics/trainingHealth';
import { activitiesToDailyLoads, calculateActivityTRIMP, calculateTrainingLoadHistory } from '@/analytics/trainingLoad';
import { calcVDOTFromActivities } from '@/analytics/vdot';
import type { ViewPeriod } from '@/lib/dashboard';
import type { Activity, TrainingLoadMetrics } from '@/types';
import { isRun } from '@/types';
import { parseActivityLocalDate } from '@/utils/activityDate';

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
    vdot?: number;
    predictedMarathonMins?: number;
    predictedHalfMins?: number;
    predicted10kMins?: number;
    predicted5kMins?: number;
    vdotTrend?: 'improving' | 'declining' | 'stable';
    vdotChangeSince90Days?: number;
    currentCTL?: number;
    currentATL?: number;
    tsb?: number;
    ctlTrend?: 'rising' | 'falling' | 'flat';
    ctlPeak90Days?: number;
    daysSincePeak?: number;
    loadRatio30d?: number;
    recentRestDays14d?: number;
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
    priorBestEfficiency: number;
    efficiencyDeltaVsPriorBest: number;
    efficiencyComparison: 'new-best' | 'near-best' | 'below-best' | 'no-baseline';
    longestRunKmLast60Days: number;
    isPbEffort: boolean;
    isFastForEffort: boolean;
    isLongest60Days: boolean;
}

function roundTo(value: number, digits = 1): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function toRunActivities(activities: Activity[]): Activity[] {
    return activities
        .filter(isRun)
        .sort((a, b) => parseActivityLocalDate(a.start_date_local).getTime() - parseActivityLocalDate(b.start_date_local).getTime());
}

function getSelectedPeriodEnd(period?: ViewPeriod): Date {
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

function getWindowBounds(anchorDate: Date, days: number): { start: Date; end: Date } {
    const end = new Date(anchorDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end };
}

function getActivitiesInWindowEndingAt(activities: Activity[], anchorDate: Date, days: number): Activity[] {
    const { start, end } = getWindowBounds(anchorDate, days);
    return toRunActivities(activities).filter((activity) => {
        const date = parseActivityLocalDate(activity.start_date_local);
        return date >= start && date <= end;
    });
}

function getPriorWindowActivities(activities: Activity[], anchorDate: Date, days: number): Activity[] {
    const priorEnd = getPriorWindowEnd(anchorDate, days);
    return getActivitiesInWindowEndingAt(activities, priorEnd, days);
}

function getPriorWindowEnd(anchorDate: Date, days: number): Date {
    const currentWindow = getWindowBounds(anchorDate, days);
    const priorEnd = new Date(currentWindow.start);
    priorEnd.setDate(priorEnd.getDate() - 1);
    priorEnd.setHours(23, 59, 59, 999);
    return priorEnd;
}

function getAveragePaceMinPerKm(activities: Activity[]): number {
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

function getAverageOutingMinutes(activities: Activity[]): number {
    if (activities.length === 0) return 0;
    return activities.reduce((sum, activity) => sum + activity.moving_time / 60, 0) / activities.length;
}

function getTotalDistanceKm(activities: Activity[]): number {
    return activities.reduce((sum, activity) => sum + activity.distance / 1000, 0);
}

function countActiveWeeks(activities: Activity[]): number {
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

function getWeeklyTotalsEndingAt(activities: Activity[], anchorDate: Date, weeks: number): number[] {
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

function get3WeekRampRate(weeklyTotals: number[]): number {
    if (weeklyTotals.length < 4) return 0;
    const recent = weeklyTotals.slice(-3);
    const previous = weeklyTotals.slice(-6, -3);
    if (recent.length === 0 || previous.length === 0) return 0;

    const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const previousAvg = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (previousAvg <= 0) return 0;

    return ((recentAvg - previousAvg) / previousAvg) * 100;
}

function getLatestTrainingMetrics(activities: Activity[], endDate: Date, days: number, maxHR = 185): TrainingLoadMetrics[] {
    const runs = toRunActivities(activities);
    if (runs.length === 0) return [];

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const dailyLoads = activitiesToDailyLoads(runs, maxHR, 60);
    return calculateTrainingLoadHistory(dailyLoads, startDate, endDate);
}

function getConsecutiveRunDays(activities: Activity[], anchorDate: Date): number {
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

function hasExtendedGap(activities: Activity[], gapDays = 21): boolean {
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

function findLatestRaceLikeRun(activities: Activity[]): Activity | null {
    const raceDistances = [5000, 10000, 21097.5, 42195];
    const tolerance = 0.1;
    const candidates = toRunActivities(activities).filter((activity) =>
        raceDistances.some((distance) => Math.abs(activity.distance - distance) <= distance * tolerance)
    );
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function getActivityEfficiency(activity: Activity): number {
    if (!activity.average_heartrate || !activity.moving_time || !activity.distance) return 0;
    return activity.distance / ((activity.average_heartrate / 60) * activity.moving_time);
}

function getSimilarEffortBaselineRuns(activity: Activity, activities: Activity[], days: number): Activity[] {
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

export function buildOverviewPayload(activities: Activity[], viewPeriod?: ViewPeriod): OverviewPayload {
    const anchorDate = getSelectedPeriodEnd(viewPeriod);
    const windowDays = viewPeriod ? viewPeriodToDays(viewPeriod) : 90;
    const windowActivities = getActivitiesInWindowEndingAt(activities, anchorDate, windowDays);
    const baselineActivities = getActivitiesInWindowEndingAt(activities, anchorDate, 180);
    const weeklyRamp = calculateWeeklyRamp(windowActivities, anchorDate);
    const loadRatio = calculateAcwr(windowActivities, anchorDate) ?? 0;
    const baselineLoadRatio = calculateAcwr(baselineActivities, anchorDate) ?? loadRatio;
    const efficiency = calculateEfficiencyIndex(windowActivities, anchorDate, Math.min(windowDays, 28)) ?? 0;
    const baselineEfficiency = calculateEfficiencyIndex(baselineActivities, anchorDate, 28) ?? efficiency;

    return {
        runCount: windowActivities.length,
        totalDistanceKm: roundTo(getTotalDistanceKm(windowActivities), 1),
        avgPaceMinPerKm: roundTo(getAveragePaceMinPerKm(windowActivities), 2),
        loadRatio: roundTo(loadRatio, 2),
        weeklyChange: roundTo(weeklyRamp.rampPercent ?? 0, 1),
        routineScore: calculateConsistencyScore(windowActivities, anchorDate),
        efficiencyMPerBeat: roundTo(efficiency, 2),
        avgOutingMins: roundTo(getAverageOutingMinutes(windowActivities), 1),
        baselineAvgWeeklyKm: roundTo(getTotalDistanceKm(baselineActivities) / Math.max(180 / 7, 1), 1),
        baselineLoadRatio: roundTo(baselineLoadRatio, 2),
        baselineEfficiency: roundTo(baselineEfficiency, 2),
    };
}

export function buildTrainingHealthPayload(activities: Activity[], viewPeriod?: ViewPeriod, maxHR = 185): TrainingHealthPayload {
    const anchorDate = getSelectedPeriodEnd(viewPeriod);
    const windowDays = viewPeriod ? viewPeriodToDays(viewPeriod) : 90;
    const windowActivities = getActivitiesInWindowEndingAt(activities, anchorDate, windowDays);
    const baselineAnchor = getPriorWindowEnd(anchorDate, windowDays);
    const baselineActivities = getPriorWindowActivities(activities, anchorDate, windowDays);
    const acuteRuns = getActivitiesInWindowEndingAt(windowActivities, anchorDate, Math.min(7, windowDays));
    const chronicRuns = getActivitiesInWindowEndingAt(windowActivities, anchorDate, Math.min(42, windowDays));
    const totalTrimp = windowActivities.reduce((sum, activity) => sum + calculateActivityTRIMP(activity, maxHR, 60), 0);
    const baselineTrimp = baselineActivities.reduce((sum, activity) => sum + calculateActivityTRIMP(activity, maxHR, 60), 0);

    const acuteLoad = getTotalDistanceKm(acuteRuns);
    const chronicLoad = chronicRuns.length > 0 ? getTotalDistanceKm(chronicRuns) / Math.max(Math.min(42, windowDays) / 7, 1) : 0;

    return {
        trimp: Math.round(totalTrimp),
        monotony: roundTo(calculateMonotony(windowActivities, anchorDate, maxHR), 2),
        strain: Math.round(calculateStrainScore(windowActivities, anchorDate, maxHR)),
        acuteLoad: roundTo(acuteLoad, 1),
        chronicLoad: roundTo(chronicLoad, 1),
        loadRatio: roundTo(calculateAcwr(windowActivities, anchorDate, maxHR) ?? 0, 2),
        weekCount: countActiveWeeks(windowActivities),
        baselineMonotony: roundTo(calculateMonotony(baselineActivities, baselineAnchor, maxHR), 2),
        baselineStrain: Math.round(calculateStrainScore(baselineActivities, baselineAnchor, maxHR)),
        baselineTrimp: Math.round(baselineTrimp),
    };
}

export function buildFitnessPayload(activities: Activity[], maxHR = 185): FitnessPayload {
    const endDate = new Date();
    const metrics60 = getLatestTrainingMetrics(activities, endDate, 60, maxHR);
    const metrics90 = getLatestTrainingMetrics(activities, endDate, 90, maxHR);
    const latest = metrics60[metrics60.length - 1];
    const first = metrics60[0];

    if (!latest) {
        return {
            currentCTL: 0,
            currentATL: 0,
            tsb: 0,
            ctlTrend: 'flat',
            ctlPeak90Days: 0,
            daysSincePeak: 0,
            baselineCTL: 0,
        };
    }

    const ctlDelta = latest.ctl - (first?.ctl ?? latest.ctl);
    let ctlTrend: FitnessPayload['ctlTrend'] = 'flat';
    if (ctlDelta > 1) ctlTrend = 'rising';
    if (ctlDelta < -1) ctlTrend = 'falling';

    const peakMetric = metrics90.reduce((peak, metric) => (metric.ctl > peak.ctl ? metric : peak), metrics90[0] ?? latest);
    const peakDate = peakMetric ? new Date(peakMetric.date) : endDate;
    const daysSincePeak = Math.max(0, Math.floor((endDate.getTime() - peakDate.getTime()) / 86400000));
    const baselineCtl = metrics60.reduce((sum, metric) => sum + metric.ctl, 0) / metrics60.length;

    return {
        currentCTL: roundTo(latest.ctl, 1),
        currentATL: roundTo(latest.atl, 1),
        tsb: roundTo(latest.tsb, 1),
        ctlTrend,
        ctlPeak90Days: roundTo(peakMetric?.ctl ?? latest.ctl, 1),
        daysSincePeak,
        baselineCTL: roundTo(baselineCtl, 1),
    };
}

export function buildVolumePayload(activities: Activity[], viewPeriod?: ViewPeriod): VolumePayload {
    const anchorDate = getSelectedPeriodEnd(viewPeriod);
    const windowDays = viewPeriod ? viewPeriodToDays(viewPeriod) : 42;
    const weeks = Math.max(4, Math.ceil(windowDays / 7));
    const recentWeeklyKm = getWeeklyTotalsEndingAt(activities, anchorDate, weeks);

    const avgWeeklyKm = recentWeeklyKm.length > 0
        ? recentWeeklyKm.reduce((sum, value) => sum + value, 0) / recentWeeklyKm.length
        : 0;
    const maxWeeklyKm = recentWeeklyKm.length > 0 ? Math.max(...recentWeeklyKm) : 0;
    const latestWeek = recentWeeklyKm[recentWeeklyKm.length - 1] ?? 0;
    const previousWeek = recentWeeklyKm[recentWeeklyKm.length - 2] ?? 0;
    const weekOverWeekChange = previousWeek > 0 ? ((latestWeek - previousWeek) / previousWeek) * 100 : 0;

    const baselineAnchor = new Date(anchorDate);
    baselineAnchor.setDate(baselineAnchor.getDate() - weeks * 7);
    const baselineWeeklyKm = getWeeklyTotalsEndingAt(activities, baselineAnchor, weeks);
    const baselineAvgWeeklyKm = baselineWeeklyKm.length > 0
        ? baselineWeeklyKm.reduce((sum, value) => sum + value, 0) / baselineWeeklyKm.length
        : avgWeeklyKm;
    const baselinePeakWeeklyKm = baselineWeeklyKm.length > 0 ? Math.max(...baselineWeeklyKm) : maxWeeklyKm;

    return {
        recentWeeklyKm,
        avgWeeklyKm: roundTo(avgWeeklyKm, 1),
        maxWeeklyKm: roundTo(maxWeeklyKm, 1),
        weekOverWeekChange: roundTo(weekOverWeekChange, 1),
        rampRate3Week: roundTo(get3WeekRampRate(recentWeeklyKm), 1),
        baselineAvgWeeklyKm: roundTo(baselineAvgWeeklyKm, 1),
        baselinePeakWeeklyKm: roundTo(baselinePeakWeeklyKm, 1),
    };
}

export function buildInjuryRiskPayload(activities: Activity[], windowDays = 30): InjuryRiskPayload & { shouldShow: boolean } {
    const anchorDate = new Date();
    const lastWindowDays = getActivitiesInWindowEndingAt(activities, anchorDate, windowDays);
    const last14Days = getActivitiesInWindowEndingAt(activities, anchorDate, 14);
    const weeklyTotals = getWeeklyTotalsEndingAt(activities, anchorDate, Math.max(4, Math.ceil(windowDays / 7)));
    const loadRatio = calculateAcwr(lastWindowDays, anchorDate) ?? 0;
    const rampRate3Week = get3WeekRampRate(weeklyTotals);
    const daysWithActivity = new Set(
        last14Days.map((activity) => parseActivityLocalDate(activity.start_date_local).toDateString())
    ).size;
    const baselineAnchor = getPriorWindowEnd(anchorDate, windowDays);
    const baselineActivities = getPriorWindowActivities(activities, anchorDate, windowDays);
    const baselineLoadRatio = calculateAcwr(baselineActivities, baselineAnchor) ?? loadRatio;
    const shouldShow = loadRatio > 1.5 || rampRate3Week > 30;

    return {
        loadRatio: roundTo(loadRatio, 2),
        rampRate3Week: roundTo(rampRate3Week, 1),
        recentRestDays: Math.max(0, 14 - daysWithActivity),
        consecutiveRunDays: getConsecutiveRunDays(activities, anchorDate),
        baselineLoadRatio: roundTo(baselineLoadRatio, 2),
        injuryHistoryFlag: hasExtendedGap(activities),
        shouldShow,
    };
}

export function buildRacePredictionPayload(activities: Activity[], maxHR = 185): RacePredictionPayload {
    const endDate = new Date();
    const last90Days = getActivitiesInWindowEndingAt(activities, endDate, 90);
    const prior90Days = getPriorWindowActivities(activities, endDate, 90);
    const currentResult = calcVDOTFromActivities(last90Days);
    if (!currentResult) {
        return {};
    }

    const metrics60 = getLatestTrainingMetrics(activities, endDate, 60, maxHR);
    const metrics90 = getLatestTrainingMetrics(activities, endDate, 90, maxHR);
    const latestMetric = metrics60[metrics60.length - 1];
    const firstMetric = metrics60[0] ?? latestMetric;
    const ctlDelta = latestMetric ? latestMetric.ctl - (firstMetric?.ctl ?? latestMetric.ctl) : 0;
    const ctlTrend: RacePredictionPayload['ctlTrend'] =
        ctlDelta > 1 ? 'rising' : ctlDelta < -1 ? 'falling' : 'flat';
    const peakMetric = metrics90.reduce((peak, metric) => (metric.ctl > peak.ctl ? metric : peak), metrics90[0] ?? latestMetric);
    const peakDate = peakMetric ? new Date(peakMetric.date) : endDate;
    const daysSincePeak = peakMetric
        ? Math.max(0, Math.floor((endDate.getTime() - peakDate.getTime()) / 86400000))
        : undefined;
    const last30Days = getActivitiesInWindowEndingAt(activities, endDate, 30);
    const last14Days = getActivitiesInWindowEndingAt(activities, endDate, 14);
    const loadRatio30d = calculateAcwr(last30Days, endDate) ?? 0;
    const daysWithActivity = new Set(
        last14Days.map((activity) => parseActivityLocalDate(activity.start_date_local).toDateString())
    ).size;

    const priorResult = calcVDOTFromActivities(prior90Days);
    const vdot = currentResult.vdot;
    const priorVdot = priorResult?.vdot ?? vdot;
    const vdotChange = roundTo(vdot - priorVdot, 1);
    const vdotTrend: RacePredictionPayload['vdotTrend'] =
        vdotChange > 0.5 ? 'improving' : vdotChange < -0.5 ? 'declining' : 'stable';

    const racePredictions = currentResult.racePredictions ?? [];
    const findTime = (...labels: string[]): number | undefined => {
        const match = racePredictions.find((prediction) => labels.includes(prediction.label));
        return match ? Math.round(match.timeS / 60) : undefined;
    };

    const latestRace = findLatestRaceLikeRun(last90Days);

    return {
        vdot: roundTo(vdot, 1),
        predictedMarathonMins: findTime('Marathon'),
        predictedHalfMins: findTime('Half Marathon', 'HM'),
        predicted10kMins: findTime('10K'),
        predicted5kMins: findTime('5K'),
        vdotTrend,
        vdotChangeSince90Days: vdotChange,
        currentCTL: latestMetric ? roundTo(latestMetric.ctl, 1) : undefined,
        currentATL: latestMetric ? roundTo(latestMetric.atl, 1) : undefined,
        tsb: latestMetric ? roundTo(latestMetric.tsb, 1) : undefined,
        ctlTrend,
        ctlPeak90Days: peakMetric ? roundTo(peakMetric.ctl, 1) : undefined,
        daysSincePeak,
        loadRatio30d: roundTo(loadRatio30d, 2),
        recentRestDays14d: Math.max(0, 14 - daysWithActivity),
        lastRaceDistanceKm: latestRace ? roundTo(latestRace.distance / 1000, 1) : undefined,
        lastRaceTimeMins: latestRace ? Math.round(latestRace.moving_time / 60) : undefined,
        lastRaceDate: latestRace ? latestRace.start_date_local.split('T')[0] : undefined,
    };
}

export function buildRunDetailPayload(
    activity: Activity,
    allActivities: Activity[]
): RunDetailPayload & { shouldShow: boolean } {
    const anchorDate = parseActivityLocalDate(activity.start_date_local);
    const similarEffortRuns = getSimilarEffortBaselineRuns(activity, allActivities, 30);
    const baselineRuns90 = getActivitiesInWindowEndingAt(allActivities, anchorDate, 90).filter((candidate) => candidate.id !== activity.id);
    const previous60Runs = getActivitiesInWindowEndingAt(allActivities, anchorDate, 60).filter((candidate) => candidate.id !== activity.id);

    const activityEfficiency = getActivityEfficiency(activity);
    const baselineAvgPace = getAveragePaceMinPerKm(similarEffortRuns);
    const baselineEfficiency = calculateEfficiencyIndex(baselineRuns90, anchorDate, 90) ?? 0;
    const baselineCadence = baselineRuns90.length > 0
        ? baselineRuns90.reduce((sum, run) => sum + (run.average_cadence ?? 0), 0) / baselineRuns90.length
        : 0;
    const priorBestEfficiency = baselineRuns90.reduce((best, run) => Math.max(best, getActivityEfficiency(run)), 0);
    const longestRunKmLast60Days = previous60Runs.reduce((best, run) => Math.max(best, run.distance / 1000), 0);
    const activityPace = getAveragePaceMinPerKm([activity]);

    const efficiencyDeltaVsPriorBest = priorBestEfficiency > 0
        ? ((activityEfficiency - priorBestEfficiency) / priorBestEfficiency) * 100
        : 0;
    const isPbEffort = priorBestEfficiency > 0
        ? activityEfficiency > priorBestEfficiency * 1.01
        : false;
    const isFastForEffort = baselineAvgPace > 0 && activityPace > 0 && activityPace <= baselineAvgPace * 0.95;
    const cadenceDeviation = baselineCadence > 0 && activity.average_cadence
        ? Math.abs(activity.average_cadence - baselineCadence) / baselineCadence
        : 0;
    const isLongest60Days = activity.distance / 1000 > longestRunKmLast60Days;
    const isNearPriorBest = priorBestEfficiency > 0
        ? !isPbEffort && activityEfficiency >= priorBestEfficiency * 0.97
        : false;
    const efficiencyComparison: RunDetailPayload['efficiencyComparison'] =
        priorBestEfficiency <= 0
            ? 'no-baseline'
            : isPbEffort
                ? 'new-best'
                : isNearPriorBest
                    ? 'near-best'
                    : 'below-best';
    const shouldShow = isFastForEffort || isPbEffort || isNearPriorBest || cadenceDeviation > 0.05 || isLongest60Days;

    return {
        distanceKm: roundTo(activity.distance / 1000, 1),
        avgPaceMinPerKm: roundTo(activityPace, 2),
        avgHR: activity.average_heartrate ?? 0,
        efficiencyMPerBeat: roundTo(activityEfficiency, 2),
        cadenceAvg: roundTo(activity.average_cadence ?? 0, 1),
        elevationGainM: Math.round(activity.total_elevation_gain || 0),
        baselineAvgPaceMinPerKm: roundTo(baselineAvgPace, 2),
        baselineEfficiency: roundTo(baselineEfficiency, 2),
        baselineCadence: roundTo(baselineCadence, 1),
        priorBestEfficiency: roundTo(priorBestEfficiency, 3),
        efficiencyDeltaVsPriorBest: roundTo(efficiencyDeltaVsPriorBest, 1),
        efficiencyComparison,
        longestRunKmLast60Days: roundTo(longestRunKmLast60Days, 1),
        isPbEffort,
        isFastForEffort,
        isLongest60Days,
        shouldShow,
    };
}
