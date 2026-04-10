export interface HeartRateZone {
    name: string;
    min: number;
    max: number;
    color: string;
}

export interface HeartRateZoneAnalysis {
    zones: HeartRateZone[];
    timeInZones: number[];
    percentageInZones: number[];
}

export interface PaceZone {
    name: string;
    minPace: number;
    maxPace: number;
    color: string;
}

export interface TrainingLoadMetrics {
    date: string;
    ctl: number;
    atl: number;
    tsb: number;
    trimp: number;
}

export interface PersonalRecord {
    distance: number;
    distanceLabel: string;
    time: number;
    pace: number;
    activityId: number;
    date: string;
}
