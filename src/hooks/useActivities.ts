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

    const sync = useCallback(async (options: { forceFull?: boolean } = {}) => {
        if (state.syncing) return;
        setState((prev) => ({ ...prev, syncing: true, error: null }));

        try {
            const isFullSync = options.forceFull === true;
            console.log(`--- Starting ${isFullSync ? 'Full' : 'Incremental'} Sync ---`);
            const currentActivities = await cache.getCachedActivities();
            let page = 1;
            let hasMore = true;
            const perPage = 200;
            let totalNewSaved = 0;
            const newlyFetched: Activity[] = [];

            while (hasMore && page <= 20) {
                console.log(`Fetching page ${page} (${perPage} per page)...`);
                const response = await activitiesApi.list(page, perPage) as any;

                if (!response || !response.activities || !Array.isArray(response.activities)) {
                    throw new Error('Sync failed. Unexpected API response.');
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

                // Incremental Sync optimization:
                // If we found duplicates on this page and we are NOT forcing a full sync, stop here.
                if (!isFullSync && newOnPage.length < response.activities.length) {
                    console.log('🏁 Incremental sync: Caught up to existing history.');
                    hasMore = false;
                } else {
                    page++;
                }

                if (hasMore) await new Promise(r => setTimeout(r, 200));
            }

            if (newlyFetched.length > 0) {
                const merged = [...newlyFetched, ...currentActivities];
                const uniqueMap = new Map();
                merged.forEach(a => uniqueMap.set(a.id, a));
                await cache.cacheActivities(Array.from(uniqueMap.values()));
                await cache.setLastSyncDate(new Date());
            }

            console.log(`--- Sync Complete. New found: ${totalNewSaved} ---`);
            const finalActivities = await cache.getCachedActivities();

            setState({
                activities: finalActivities.sort((a, b) =>
                    new Date(b.start_date || b.start_date_local).getTime() - new Date(a.start_date || a.start_date_local).getTime()
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
