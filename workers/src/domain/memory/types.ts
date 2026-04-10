export type RunProfile = 'easy' | 'steady' | 'threshold' | 'race' | 'interval' | 'unknown';

export interface ActivityRecord {
    stravaId: number;
    userId: string;
    activityDate: string;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    maxHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: RunProfile;
}

export interface SimilarActivity {
    stravaId: number;
    activityDate: string;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: RunProfile;
    similarity: number;
}

export interface WeekSummary {
    userId: string;
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    totalKm: number;
    runCount: number;
    avgPaceMinPerKm: number | null;
    avgHR: number | null;
    easyRuns: number;
    steadyRuns: number;
    thresholdRuns: number;
    raceRuns: number;
    intervalRuns: number;
    loadRatio: number | null;
}

export interface SimilarWeek {
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    totalKm: number;
    runCount: number;
    avgPaceMinPerKm: number | null;
    avgHR: number | null;
    easyRuns: number;
    thresholdRuns: number;
    raceRuns: number;
    loadRatio: number | null;
    similarity: number;
}

export interface EmbeddingResponse {
    data: number[][];
}

export interface VectorizeMatchMetadata {
    type?: 'activity' | 'week';
    stravaId?: number;
    activityDate?: string;
    distanceKm?: number;
    paceMinPerKm?: number;
    avgHR?: number;
    elevationPerKm?: number;
    movingTimeMins?: number;
    runProfile?: RunProfile;
    weekKey?: string;
    weekStart?: string;
    weekEnd?: string;
    totalKm?: number;
    runCount?: number;
    avgPaceMinPerKm?: number;
    easyRuns?: number;
    steadyRuns?: number;
    thresholdRuns?: number;
    raceRuns?: number;
    intervalRuns?: number;
    loadRatio?: number;
}

export interface VectorizeQueryResult {
    matches?: Array<{
        metadata?: VectorizeMatchMetadata;
        score?: number;
    }>;
}
