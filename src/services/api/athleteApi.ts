import type { Athlete, AthleteStats } from '@/types/athlete';

import { fetchApi } from './http';

export const athlete = {
    async getProfile(): Promise<Athlete> {
        return fetchApi('/api/athlete');
    },

    async getStats(): Promise<AthleteStats> {
        return fetchApi('/api/athlete/stats');
    },
};
