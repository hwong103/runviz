import { useEffect, useMemo, useRef, useState } from 'react';

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

export function useHeatmapStreams(runActivities: Activity[]) {
    const activityIds = useMemo(
        () => runActivities.map((activity) => activity.id).join(','),
        [runActivities]
    );
    const [state, setState] = useState<HeatmapStreamState>({
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
    });
    const loadTokenRef = useRef(0);
    const backfillTokenRef = useRef(0);
    const streamsRef = useRef(state.streamsByActivityId);
    const skippedRef = useRef(state.skippedActivityIds);

    useEffect(() => {
        let cancelled = false;
        const loadToken = loadTokenRef.current + 1;
        loadTokenRef.current = loadToken;

        const loadCachedStreams = async () => {
            setState((previous) => ({
                ...previous,
                loadingCache: true,
                backfillActive: false,
                backfillPaused: false,
                backfillError: null,
                fetchingActivityId: null,
                backfillProcessedThisSession: 0,
                backfillTotalThisSession: 0,
            }));

            const skippedFromMeta = parseSkippedIds(await cache.getMeta(SKIPPED_STREAMS_META_KEY));
            const nextStreams = new Map<number, ActivityStreams>();
            const nextSkipped = new Set(skippedFromMeta);

            await Promise.all(runActivities.map(async (activity) => {
                const streams = await cache.getCachedStreams(activity.id);
                if (streamHasGps(streams)) {
                    nextStreams.set(activity.id, streams);
                } else if (streams) {
                    nextSkipped.add(activity.id);
                }
            }));

            if (cancelled || loadTokenRef.current !== loadToken) return;

            streamsRef.current = nextStreams;
            skippedRef.current = nextSkipped;

            setState({
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
            });

            if (nextSkipped.size !== skippedFromMeta.size) {
                await persistSkippedIds(nextSkipped);
            }
        };

        void loadCachedStreams().catch((error) => {
            if (cancelled) return;
            setState((previous) => ({
                ...previous,
                loadingCache: false,
                backfillActive: false,
                backfillPaused: true,
                backfillError: error instanceof Error ? error.message : 'Failed to load cached GPS data',
            }));
        });

        return () => {
            cancelled = true;
        };
    }, [activityIds, runActivities]);

    useEffect(() => {
        if (state.loadingCache || state.backfillPaused) return;

        let cancelled = false;
        const backfillToken = backfillTokenRef.current + 1;
        backfillTokenRef.current = backfillToken;
        const pending = sortActivitiesOldestFirst(runActivities).filter((activity) =>
            !streamsRef.current.has(activity.id) &&
            !skippedRef.current.has(activity.id)
        );

        if (pending.length === 0) {
            setState((previous) => ({
                ...previous,
                fetchingActivityId: null,
                backfillActive: false,
                backfillProcessedThisSession: 0,
                backfillTotalThisSession: 0,
            }));
            return;
        }

        setState((previous) => ({
            ...previous,
            backfillActive: true,
            backfillProcessedThisSession: 0,
            backfillTotalThisSession: pending.length,
        }));

        const backfill = async () => {
            let processed = 0;

            for (const activity of pending) {
                if (cancelled || backfillTokenRef.current !== backfillToken) return;

                setState((previous) => ({
                    ...previous,
                    backfillActive: true,
                    fetchingActivityId: activity.id,
                    backfillError: null,
                }));

                try {
                    const streams = await activitiesApi.getStreams(activity.id);
                    const gpsPoints = extractLatLngPoints(streams);

                    if (gpsPoints.length >= 2) {
                        await cache.cacheStreams(activity.id, streams);
                        streamsRef.current = new Map(streamsRef.current);
                        streamsRef.current.set(activity.id, streams);

                        setState((previous) => {
                            const streamsByActivityId = new Map(previous.streamsByActivityId);
                            streamsByActivityId.set(activity.id, streams);
                            return {
                                ...previous,
                                streamsByActivityId,
                                fetchedThisSession: previous.fetchedThisSession + 1,
                            };
                        });
                    } else {
                        skippedRef.current = new Set(skippedRef.current);
                        skippedRef.current.add(activity.id);
                        void persistSkippedIds(skippedRef.current);

                        setState((previous) => {
                            const skippedActivityIds = new Set(previous.skippedActivityIds);
                            skippedActivityIds.add(activity.id);
                            return {
                                ...previous,
                                skippedActivityIds,
                            };
                        });
                    }
                } catch (error) {
                    if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 429)) {
                        setState((previous) => ({
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

                    setState((previous) => ({
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
                setState((previous) => ({
                    ...previous,
                    backfillProcessedThisSession: processed,
                }));

                await wait(FETCH_DELAY_MS);
            }

            if (!cancelled) {
                setState((previous) => ({
                    ...previous,
                    fetchingActivityId: null,
                    backfillActive: false,
                    backfillProcessedThisSession: pending.length,
                    backfillTotalThisSession: pending.length,
                }));
            }
        };

        void backfill();

        return () => {
            cancelled = true;
        };
    }, [
        activityIds,
        runActivities,
        state.backfillPaused,
        state.loadingCache,
    ]);

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
