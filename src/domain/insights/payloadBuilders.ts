import {
    calculateAcwr,
    calculateConsistencyScore,
    calculateEfficiencyIndex,
    calculateMonotony,
    calculateStrainScore,
    calculateWeeklyRamp,
} from '@/analytics/trainingHealth';
import { calculateActivityTRIMP } from '@/analytics/trainingLoad';
import { calcVDOTFromActivities } from '@/analytics/vdot';
import type { ViewPeriod } from '@/lib/dashboard';
import type { Activity } from '@/types/activity';
import { parseActivityLocalDate } from '@/utils/activityDate';

import type {
    FitnessPayload,
    InjuryRiskPayload,
    OverviewPayload,
    RacePredictionPayload,
    RunDetailPayload,
    TrainingHealthPayload,
    VolumePayload,
} from './payloadTypes';
import {
    countActiveWeeks,
    deriveTrainingPhaseContext,
    findLatestRaceLikeRun,
    get3WeekRampRate,
    getActivitiesInWindowEndingAt,
    getActivityEfficiency,
    getAverageOutingMinutes,
    getAveragePaceMinPerKm,
    getConsecutiveRunDays,
    getInsightWindowLabel,
    getLatestTrainingMetrics,
    getPriorWindowActivities,
    getPriorWindowEnd,
    getSelectedPeriodEnd,
    getSimilarEffortBaselineRuns,
    getTotalDistanceKm,
    getWeeklyTotalsEndingAt,
    hasExtendedGap,
    roundTo,
    viewPeriodToDays,
} from './payloadUtils';

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
    const baselineAvgWeeklyKm = roundTo(getTotalDistanceKm(baselineActivities) / Math.max(180 / 7, 1), 1);
    const phaseContext = deriveTrainingPhaseContext(
        activities,
        anchorDate,
        baselineAvgWeeklyKm,
        weeklyRamp.rampPercent ?? null,
    );

    return {
        runCount: windowActivities.length,
        totalDistanceKm: roundTo(getTotalDistanceKm(windowActivities), 1),
        avgPaceMinPerKm: roundTo(getAveragePaceMinPerKm(windowActivities), 2),
        loadRatio: roundTo(loadRatio, 2),
        weeklyChange: roundTo(weeklyRamp.rampPercent ?? 0, 1),
        routineScore: calculateConsistencyScore(windowActivities, anchorDate),
        efficiencyMPerBeat: roundTo(efficiency, 2),
        avgOutingMins: roundTo(getAverageOutingMinutes(windowActivities), 1),
        baselineAvgWeeklyKm,
        baselineLoadRatio: roundTo(baselineLoadRatio, 2),
        baselineEfficiency: roundTo(baselineEfficiency, 2),
        ...phaseContext,
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
    const baselineAvgWeeklyKm = getTotalDistanceKm(baselineActivities) / Math.max(windowDays / 7, 1);
    const weeklyRamp = calculateWeeklyRamp(windowActivities, anchorDate);
    const phaseContext = deriveTrainingPhaseContext(
        activities,
        anchorDate,
        baselineAvgWeeklyKm,
        weeklyRamp.rampPercent ?? null,
    );

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
        ...phaseContext,
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
    const phaseContext = deriveTrainingPhaseContext(
        activities,
        anchorDate,
        baselineAvgWeeklyKm,
        weekOverWeekChange,
    );

    return {
        recentWeeklyKm,
        avgWeeklyKm: roundTo(avgWeeklyKm, 1),
        maxWeeklyKm: roundTo(maxWeeklyKm, 1),
        weekOverWeekChange: roundTo(weekOverWeekChange, 1),
        rampRate3Week: roundTo(get3WeekRampRate(recentWeeklyKm), 1),
        baselineAvgWeeklyKm: roundTo(baselineAvgWeeklyKm, 1),
        baselinePeakWeeklyKm: roundTo(baselinePeakWeeklyKm, 1),
        trainingPhase: phaseContext.trainingPhase,
        phaseExplanation: phaseContext.phaseExplanation,
        activeWeeksLast6: phaseContext.activeWeeksLast6,
        longestGapDaysLast42: phaseContext.longestGapDaysLast42,
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
    const baselineAvgWeeklyKm = getTotalDistanceKm(baselineActivities) / Math.max(windowDays / 7, 1);
    const phaseContext = deriveTrainingPhaseContext(
        activities,
        anchorDate,
        baselineAvgWeeklyKm,
        rampRate3Week,
    );
    const enoughHistory = phaseContext.activeWeeksLast6 >= 4 && phaseContext.recentRunDays14d >= 5;
    const shouldShow = enoughHistory && (
        loadRatio > 1.55 ||
        rampRate3Week > 35 ||
        (loadRatio > 1.45 && rampRate3Week > 20)
    );

    return {
        loadRatio: roundTo(loadRatio, 2),
        rampRate3Week: roundTo(rampRate3Week, 1),
        recentRestDays: Math.max(0, 14 - daysWithActivity),
        consecutiveRunDays: getConsecutiveRunDays(activities, anchorDate),
        baselineLoadRatio: roundTo(baselineLoadRatio, 2),
        baselineAvgWeeklyKm: roundTo(baselineAvgWeeklyKm, 1),
        hadExtendedTrainingGap: hasExtendedGap(activities)
            ? 'yes — one or more gaps of 21+ days exist in training history (cause unknown)'
            : 'no gaps of 21+ days detected',
        trainingPhase: phaseContext.trainingPhase,
        phaseExplanation: phaseContext.phaseExplanation,
        activeWeeksLast6: phaseContext.activeWeeksLast6,
        longestGapDaysLast42: phaseContext.longestGapDaysLast42,
        currentWeeklyKm: phaseContext.currentWeeklyKm,
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
    const weeklyRamp = calculateWeeklyRamp(last90Days, endDate);
    const baselineAvgWeeklyKm = getTotalDistanceKm(prior90Days) / Math.max(90 / 7, 1);
    const phaseContext = deriveTrainingPhaseContext(
        activities,
        endDate,
        baselineAvgWeeklyKm,
        weeklyRamp.rampPercent ?? null,
    );

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
        ...phaseContext,
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

export { getInsightWindowLabel, viewPeriodToDays };
