export type TrainingPhase = 'rebuild' | 'build' | 'steady' | 'down-week';

export interface TrainingPhaseContext {
    trainingPhase: TrainingPhase;
    phaseExplanation: string;
    activeWeeksLast6: number;
    longestGapDaysLast42: number;
    recentRunDays14d: number;
    currentWeeklyKm: number;
    previousWeeklyKm: number;
}

export interface OverviewPayload extends TrainingPhaseContext {
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

export interface TrainingHealthPayload extends TrainingPhaseContext {
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
    trainingPhase: TrainingPhase;
    phaseExplanation: string;
    activeWeeksLast6: number;
    longestGapDaysLast42: number;
}

export interface InjuryRiskPayload {
    loadRatio: number;
    rampRate3Week: number;
    recentRestDays: number;
    consecutiveRunDays: number;
    baselineLoadRatio: number;
    hadExtendedTrainingGap: string;
    trainingPhase: TrainingPhase;
    phaseExplanation: string;
    activeWeeksLast6: number;
    longestGapDaysLast42: number;
    currentWeeklyKm: number;
    baselineAvgWeeklyKm: number;
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
    trainingPhase?: TrainingPhase;
    phaseExplanation?: string;
    activeWeeksLast6?: number;
    longestGapDaysLast42?: number;
    recentRunDays14d?: number;
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
