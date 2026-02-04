import { useState, useEffect, useCallback, useRef } from 'react';
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

    const hasInitialized = useRef(false);

    const loadCached = useCallback(async () => {
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
    }, []);

    const sync = useCallback(async () => {
        if (state.syncing) return;
        setState((prev) => ({ ...prev, syncing: true, error: null }));

        try {
            console.log('--- Starting Sync ---');
            const currentActivities = await cache.getCachedActivities();
            let page = 1;
            let hasMore = true;
            const perPage = 200;
            let totalNewSaved = 0;
            const newlyFetched: Activity[] = [];

            while (hasMore && page <= 20) { // Sync up to 4000 activities (20 requests) to cover extensive histories
                console.log(`Fetching page ${page} (${perPage} per page)...`);
                const response = await activitiesApi.list(page, perPage) as any;

                if (!response || !response.activities || !Array.isArray(response.activities)) {
                    console.error('Invalid sync response. Full response structure:', response);
                    throw new Error('Sync failed. The API returned data in an unexpected format. Check the browser console for details.');
                }

                if (response.activities.length === 0) {
                    hasMore = false;
                    break;
                }

                // Find activities we don't have in cache yet
                const newOnPage = response.activities.filter(
                    (a: Activity) => !currentActivities.find((existing) => existing.id === a.id)
                );

                if (newOnPage.length > 0) {
                    totalNewSaved += newOnPage.length;
                    newlyFetched.push(...newOnPage);
                    console.log(`✅ Found ${newOnPage.length} new activities on page ${page}`);
                }

                // If we found ANY duplicates on this page, or it was the last page, we stop
                if (newOnPage.length < response.activities.length) {
                    console.log('🏁 Caught up to existing history.');
                    hasMore = false;
                } else {
                    hasMore = response.hasMore;
                    page++;
                }

                // Small throttle to be kind to the API
                if (hasMore) await new Promise(r => setTimeout(r, 500));
            }

            if (newlyFetched.length > 0) {
                await cache.cacheActivities([...newlyFetched, ...currentActivities]);
                await cache.setLastSyncDate(new Date());
            }

            console.log(`--- Sync Complete. New found: ${totalNewSaved} ---`);
            const finalActivities = await cache.getCachedActivities();

            setState({
                activities: finalActivities.sort((a, b) =>
                    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
                ),
                loading: false,
                syncing: false,
                error: null,
                lastSync: new Date(),
            });
        } catch (err) {
            console.error('Sync failed:', err);
            setState((prev) => ({
                ...prev,
                syncing: false,
                error: err instanceof Error ? err.message : 'Sync failed',
            }));
        }
    }, [state.syncing]); // Simplified dependency array to avoid loops

    // Initial load and sync
    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const init = async () => {
            await loadCached();
            // Automatically sync after load
            console.log('🔄 Triggering automatic sync on load...');
            sync();
        };
        init();
    }, [loadCached, sync]);

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
