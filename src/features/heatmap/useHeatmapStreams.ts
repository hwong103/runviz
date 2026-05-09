import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { activities as activitiesApi } from '@/services/api/activitiesApi';
import { ApiError } from '@/services/api/http';
import * as cache from '@/services/cache';
import type { Activity, ActivityStreams } from '@/types/activity';

import { extractLatLngPoints, sortActivitiesOldestFirst } from './heatmapUtils';

const SKIPPED_STREAMS_META_KEY = 'heatmap_skipped_streams_v1';
const FETCH_DELAY_MS = 350;

interface HeatmapStreamState {
    streamsByActivityId: Map<number, ActivityStreams>;
    skippedActivityIds: Set<number>;
    loadingCache: boolean;
    backfillActive: boolean;
    backfillPaused: boolean;
    backfillError: string | null;
    fetchingActivityId: number | null;
    fetchedThisSession: number;
    backfillProcessedThisSession: number;
    backfillTotalThisSession: number;
}

export interface HeatmapStreamStatus {
    totalRuns: number;
    cachedRuns: number;
    skippedRuns: number;
    pendingRuns: number;
    fetchedThisSession: number;
    loadingCache: boolean;
    backfillActive: boolean;
    backfillPaused: boolean;
    backfillError: string | null;
    fetchingActivityId: number | null;
    backfillProcessedThisSession: number;
    backfillTotalThisSession: number;
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSkippedIds(value: string | number | Date | undefined): Set<number> {
    if (typeof value !== 'string') return new Set();

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((id): id is number => Number.isInteger(id)));
    } catch {
        return new Set();
    }
}

async function persistSkippedIds(ids: Set<number>) {
    await cache.setMeta(SKIPPED_STREAMS_META_KEY, JSON.stringify(Array.from(ids)));
}

function streamHasGps(streams: ActivityStreams | undefined): streams is ActivityStreams {
    return extractLatLngPoints(streams).length >= 2;
}

const initialStreamState: HeatmapStreamState = {
    streamsByActivityId: new Map(),
    skippedActivityIds: new Set(),
    loadingCache: true,
    backfillActive: false,
    backfillPaused: false,
    backfillError: null,
    fetchingActivityId: null,
    fetchedThisSession: 0,
    backfillProcessedThisSession: 0,
    backfillTotalThisSession: 0,
};

let streamState = initialStreamState;
let activeActivityKey: string | null = null;
let activeActivities: Activity[] = [];
let loadToken = 0;
let backfillToken = 0;
let backfillRunning = false;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((listener) => listener());
}

function updateStreamState(updater: (previous: HeatmapStreamState) => HeatmapStreamState) {
    streamState = updater(streamState);
    emit();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return streamState;
}

function activityKey(activities: Activity[]) {
    return activities.map((activity) => activity.id).join(',');
}

function startBackfill(token: number) {
    if (backfillRunning || streamState.loadingCache || streamState.backfillPaused) return;

    const pending = sortActivitiesOldestFirst(activeActivities).filter((activity) =>
        !streamState.streamsByActivityId.has(activity.id) &&
        !streamState.skippedActivityIds.has(activity.id)
    );

    if (pending.length === 0) {
        updateStreamState((previous) => ({
            ...previous,
            fetchingActivityId: null,
            backfillActive: false,
            backfillProcessedThisSession: 0,
            backfillTotalThisSession: 0,
        }));
        return;
    }

    backfillRunning = true;
    updateStreamState((previous) => ({
        ...previous,
        backfillActive: true,
        backfillProcessedThisSession: 0,
        backfillTotalThisSession: pending.length,
    }));

    const backfill = async () => {
        let processed = 0;

        for (const activity of pending) {
            if (backfillToken !== token) {
                backfillRunning = false;
                return;
            }

            updateStreamState((previous) => ({
                ...previous,
                backfillActive: true,
                fetchingActivityId: activity.id,
                backfillError: null,
            }));

            try {
                const streams = await activitiesApi.getStreams(activity.id);
                if (backfillToken !== token) {
                    backfillRunning = false;
                    return;
                }

                const gpsPoints = extractLatLngPoints(streams);

                if (gpsPoints.length >= 2) {
                    await cache.cacheStreams(activity.id, streams);
                    if (backfillToken !== token) {
                        backfillRunning = false;
                        return;
                    }

                    updateStreamState((previous) => {
                        const streamsByActivityId = new Map(previous.streamsByActivityId);
                        streamsByActivityId.set(activity.id, streams);
                        return {
                            ...previous,
                            streamsByActivityId,
                            fetchedThisSession: previous.fetchedThisSession + 1,
                        };
                    });
                } else {
                    updateStreamState((previous) => {
                        const skippedActivityIds = new Set(previous.skippedActivityIds);
                        skippedActivityIds.add(activity.id);
                        void persistSkippedIds(skippedActivityIds);
                        return {
                            ...previous,
                            skippedActivityIds,
                        };
                    });
                }
            } catch (error) {
                backfillRunning = false;

                if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 429)) {
                    updateStreamState((previous) => ({
                        ...previous,
                        backfillActive: false,
                        backfillPaused: true,
                        backfillError: error.status === 429
                            ? 'Strava rate limit reached. Heatmap backfill will resume when you revisit this workspace later.'
                            : error.message,
                        fetchingActivityId: null,
                        backfillProcessedThisSession: processed,
                        backfillTotalThisSession: pending.length,
                    }));
                    return;
                }

                updateStreamState((previous) => ({
                    ...previous,
                    backfillActive: false,
                    backfillPaused: true,
                    backfillError: error instanceof Error ? error.message : 'Failed to fetch GPS streams',
                    fetchingActivityId: null,
                    backfillProcessedThisSession: processed,
                    backfillTotalThisSession: pending.length,
                }));
                return;
            }

            processed += 1;
            updateStreamState((previous) => ({
                ...previous,
                backfillProcessedThisSession: processed,
            }));

            await wait(FETCH_DELAY_MS);
        }

        backfillRunning = false;
        if (backfillToken === token) {
            updateStreamState((previous) => ({
                ...previous,
                fetchingActivityId: null,
                backfillActive: false,
                backfillProcessedThisSession: pending.length,
                backfillTotalThisSession: pending.length,
            }));
        }
    };

    void backfill();
}

async function loadCachedStreams(activities: Activity[], token: number) {
    updateStreamState((previous) => ({
        ...previous,
        loadingCache: true,
        backfillActive: false,
        backfillPaused: false,
        backfillError: null,
        fetchingActivityId: null,
        fetchedThisSession: 0,
        backfillProcessedThisSession: 0,
        backfillTotalThisSession: 0,
    }));

    const skippedFromMeta = parseSkippedIds(await cache.getMeta(SKIPPED_STREAMS_META_KEY));
    const nextStreams = new Map<number, ActivityStreams>();
    const nextSkipped = new Set(skippedFromMeta);

    await Promise.all(activities.map(async (activity) => {
        const streams = await cache.getCachedStreams(activity.id);
        if (streamHasGps(streams)) {
            nextStreams.set(activity.id, streams);
        } else if (streams) {
            nextSkipped.add(activity.id);
        }
    }));

    if (loadToken !== token) return;

    updateStreamState(() => ({
        streamsByActivityId: nextStreams,
        skippedActivityIds: nextSkipped,
        loadingCache: false,
        backfillActive: false,
        backfillPaused: false,
        backfillError: null,
        fetchingActivityId: null,
        fetchedThisSession: 0,
        backfillProcessedThisSession: 0,
        backfillTotalThisSession: 0,
    }));

    if (nextSkipped.size !== skippedFromMeta.size) {
        await persistSkippedIds(nextSkipped);
    }

    startBackfill(token);
}

function ensureHeatmapStreams(activities: Activity[]) {
    const nextActivityKey = activityKey(activities);
    activeActivities = activities;

    if (nextActivityKey !== activeActivityKey) {
        activeActivityKey = nextActivityKey;
        loadToken += 1;
        backfillToken = loadToken;
        backfillRunning = false;
        const token = loadToken;

        void loadCachedStreams(activities, token).catch((error) => {
            if (loadToken !== token) return;
            updateStreamState((previous) => ({
                ...previous,
                loadingCache: false,
                backfillActive: false,
                backfillPaused: true,
                backfillError: error instanceof Error ? error.message : 'Failed to load cached GPS data',
            }));
        });
        return;
    }

    startBackfill(backfillToken);
}

export function useHeatmapStreams(runActivities: Activity[]) {
    const activityIds = useMemo(
        () => runActivities.map((activity) => activity.id).join(','),
        [runActivities]
    );
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        ensureHeatmapStreams(runActivities);
    }, [activityIds, runActivities]);

    const status = useMemo<HeatmapStreamStatus>(() => {
        const pendingRuns = runActivities.filter((activity) =>
            !state.streamsByActivityId.has(activity.id) &&
            !state.skippedActivityIds.has(activity.id)
        ).length;

        return {
            totalRuns: runActivities.length,
            cachedRuns: state.streamsByActivityId.size,
            skippedRuns: state.skippedActivityIds.size,
            pendingRuns,
            fetchedThisSession: state.fetchedThisSession,
            loadingCache: state.loadingCache,
            backfillActive: state.backfillActive,
            backfillPaused: state.backfillPaused,
            backfillError: state.backfillError,
            fetchingActivityId: state.fetchingActivityId,
            backfillProcessedThisSession: state.backfillProcessedThisSession,
            backfillTotalThisSession: state.backfillTotalThisSession,
        };
    }, [runActivities, state]);

    return {
        streamsByActivityId: state.streamsByActivityId,
        skippedActivityIds: state.skippedActivityIds,
        status,
    };
}
