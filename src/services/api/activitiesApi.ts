import type { Activity, ActivityStreams } from '@/types/activity';

import { fetchApi } from './http';

export const activities = {
    async list(page = 1, perPage = 30): Promise<{ activities: Activity[]; hasMore: boolean }> {
        return fetchApi(`/api/athlete/activities?page=${page}&per_page=${perPage}`);
    },

    async get(id: number): Promise<Activity> {
        return fetchApi(`/api/activities/${id}`);
    },

    async getStreams(id: number): Promise<ActivityStreams> {
        const keys = 'time,distance,latlng,altitude,heartrate,cadence,velocity_smooth,grade_smooth';
        return fetchApi(`/api/activities/${id}/streams?keys=${keys}&key_by_type=true`);
    },

    async update(id: number, payload: { description: string }): Promise<Activity> {
        return fetchApi(`/api/activities/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },
};
