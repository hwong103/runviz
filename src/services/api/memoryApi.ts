import type { Activity } from '@/types/activity';

import { fetchApi } from './http';

export interface SimilarRunResult {
    stravaId: number;
    activityDate: string;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: string;
    similarity: number;
}

export const memory = {
    async index(activities: Activity[], medianPaceSecPerM: number): Promise<{ indexed: number }> {
        return fetchApi('/api/memory/index', {
            method: 'POST',
            body: JSON.stringify({ activities, medianPaceSecPerM }),
        });
    },

    async status(): Promise<{ indexed: number; lastIndexedDate: string | null }> {
        return fetchApi('/api/memory/status');
    },

    async similarRuns(activityContext: {
        distanceKm: number;
        paceMinPerKm: number | null;
        avgHR: number | null;
        elevationPerKm: number | null;
        movingTimeMins: number;
        runProfile: string;
    }, excludeStravaId: number): Promise<SimilarRunResult[]> {
        return fetchApi('/api/memory/similar-runs', {
            method: 'POST',
            body: JSON.stringify({ activityContext, excludeStravaId }),
        });
    },
};
