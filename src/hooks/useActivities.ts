import { useState, useEffect, useCallback, useRef } from 'react';
import { activities as activitiesApi } from '../services/api';
import * as cache from '../services/cache';
import type { Activity } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';

interface SyncState {
    activities: Activity[];
    loading: boolean;
    syncing: boolean;
    error: string | null;
    lastSync: Date | null;
}

function activitySortTimestamp(activity: Activity): number {
    if (activity.start_date) {
        return new Date(activity.start_date).getTime();
    }
    return parseActivityLocalDate(activity.start_date_local).getTime();
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await activitiesApi.list(page, perPage) as any;

                if (!response || !response.activities || !Array.isArray(response.activities)) {
                    throw new Error('Sync failed. Unexpected API response.');
                }

                if (response.activities.length === 0) {
                    hasMore = false;
                    break;
                }

                // Always process all activities from the API to capture updates (e.g. gear changes, name edits)
                const pageActivities = response.activities;

                if (pageActivities.length > 0) {
                    totalNewSaved += pageActivities.length;
                    newlyFetched.push(...pageActivities);
                    console.log(`✅ Processed ${pageActivities.length} activities on page ${page}`);
                }

                // Incremental Sync optimization:
                // If we are NOT forcing a full sync, check if we've reached a known activity ID
                if (!isFullSync) {
                    // Check if *all* activities on this page were already in our cache (by ID)
                    // If so, we can probably stop, BUT we still want to save the fresh versions of them.
                    const allKnown = pageActivities.every((a: Activity) =>
                        currentActivities.some(existing => existing.id === a.id)
                    );

                    if (allKnown && page > 1) { // Always fetch at least 1 page to check for updates
                        console.log('🏁 Incremental sync: Reached known history.');
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    page++;
                }

                if (hasMore) await new Promise(r => setTimeout(r, 200));
            }

            if (newlyFetched.length > 0) {
                // Merge: newly fetched activities overwrite existing ones in the map
                const uniqueMap = new Map();
                // 1. Put old activities in first
                currentActivities.forEach(a => uniqueMap.set(a.id, a));
                // 2. Overwrite with new fresh activities
                newlyFetched.forEach(a => uniqueMap.set(a.id, a));

                await cache.cacheActivities(Array.from(uniqueMap.values()));
                await cache.setLastSyncDate(new Date());
            }

            console.log(`--- Sync Complete. New found: ${totalNewSaved} ---`);
            const finalActivities = await cache.getCachedActivities();

            setState({
                activities: finalActivities.sort((a, b) =>
                    activitySortTimestamp(b) - activitySortTimestamp(a)
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
