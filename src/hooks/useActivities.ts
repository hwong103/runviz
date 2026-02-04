import { useState, useEffect, useCallback } from 'react';
import { activities as activitiesApi } from '../services/api';
import * as cache from '../services/cache';
import type { Activity } from '../types';

interface SyncState {
    activities: Activity[];
    loading: boolean;
    syncing: boolean;
    error: string | null;
    lastSync: Date | null;
}

export function useActivities() {
    const [state, setState] = useState<SyncState>({
        activities: [],
        loading: true,
        syncing: false,
        error: null,
        lastSync: null,
    });

    // Load cached activities on mount
    useEffect(() => {
        loadCached();
    }, []);

    async function loadCached() {
        try {
            const cached = await cache.getCachedActivities();
            const lastSync = await cache.getLastSyncDate();
            setState((prev) => ({
                ...prev,
                activities: cached,
                loading: false,
                lastSync,
            }));
        } catch (err) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to load cached data',
            }));
        }
    }

    const sync = useCallback(async () => {
        setState((prev) => ({ ...prev, syncing: true, error: null }));

        try {
            // Fetch all activities with pagination
            const allActivities: Activity[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await activitiesApi.list(page, 100);
                allActivities.push(...response.activities);
                hasMore = response.hasMore;
                page++;

                // Safety limit
                if (page > 50) break;
            }

            // Cache the activities
            await cache.cacheActivities(allActivities);
            await cache.setLastSyncDate(new Date());

            setState({
                activities: allActivities,
                loading: false,
                syncing: false,
                error: null,
                lastSync: new Date(),
            });
        } catch (err) {
            setState((prev) => ({
                ...prev,
                syncing: false,
                error: err instanceof Error ? err.message : 'Sync failed',
            }));
        }
    }, []);

    const getActivity = useCallback(async (id: number): Promise<Activity | null> => {
        // Check cache first
        const cached = await cache.getCachedActivity(id);
        if (cached) return cached;

        // Fetch from API
        try {
            const activity = await activitiesApi.get(id);
            return activity;
        } catch {
            return null;
        }
    }, []);

    return {
        ...state,
        sync,
        getActivity,
        refresh: loadCached,
    };
}
