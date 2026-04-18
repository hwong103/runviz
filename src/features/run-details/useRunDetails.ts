import { useCallback, useEffect, useMemo, useState } from 'react';

import { format } from 'date-fns';

import { useChartTheme } from '@/hooks/useChartTheme';
import { useSimilarRuns } from '@/hooks/useSimilarRuns';
import { buildRunDetailPayload } from '@/domain/insights';
import { activities as activitiesApi } from '@/services/api/activitiesApi';
import { gear as gearApi } from '@/services/api/gearApi';
import type { Activity, ActivityStreams } from '@/types/activity';
import { isRun } from '@/types/activity';
import type { Gear } from '@/types/gear';
import { parseActivityLocalDate } from '@/utils/activityDate';

import {
    buildHeartRateChartData,
    buildHeartRateChartOptions,
    buildPerformanceChartData,
    buildPerformanceChartOptions,
} from './runDetailCharts';
import {
    buildHeartRateSummary,
    buildRunInsightContext,
    buildRunStats,
} from './runDetailMetrics';

interface UseRunDetailsOptions {
    activity: Activity;
    allActivities: Activity[];
    shoes: Gear[];
}

export function useRunDetails({
    activity: initialActivity,
    allActivities,
    shoes,
}: UseRunDetailsOptions) {
    const [activity, setActivity] = useState<Activity>(initialActivity);
    const [streams, setStreams] = useState<ActivityStreams | null>(null);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [viewMode, setViewMode] = useState<'stream' | 'splits'>('stream');
    const [fetchedShoe, setFetchedShoe] = useState<Gear | null>(null);
    const chartTheme = useChartTheme();

    useEffect(() => {
        setActivity(initialActivity);
    }, [initialActivity]);

    useEffect(() => {
        let cancelled = false;

        if (!activity.gear_id) {
            setFetchedShoe(null);
            return;
        }

        const knownShoe = shoes.find((shoe) => shoe.id === activity.gear_id);
        if (knownShoe) {
            setFetchedShoe(null);
            return;
        }

        if (!activity.gear_id.startsWith('g') && !activity.gear_id.startsWith('s')) {
            setFetchedShoe(null);
            return;
        }

        void gearApi.get(activity.gear_id)
            .then((gear) => {
                if (!cancelled) {
                    setFetchedShoe(gear);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setFetchedShoe(null);
                }
                console.error('Failed to fetch gear', error);
            });

        return () => {
            cancelled = true;
        };
    }, [activity.gear_id, shoes]);

    useEffect(() => {
        let cancelled = false;

        const fetchData = async () => {
            setLoadingStreams(true);
            try {
                const [fullActivity, streamData] = await Promise.all([
                    activitiesApi.get(initialActivity.id),
                    activitiesApi.getStreams(initialActivity.id),
                ]);

                if (cancelled) return;
                setActivity(fullActivity);
                setStreams(streamData);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to fetch detailed activity data:', error);
                }
            } finally {
                if (!cancelled) {
                    setLoadingStreams(false);
                }
            }
        };

        void fetchData();

        return () => {
            cancelled = true;
        };
    }, [initialActivity.id]);

    const runs = useMemo(
        () => allActivities
            .filter(isRun)
            .sort(
                (left, right) =>
                    parseActivityLocalDate(right.start_date_local).getTime() -
                    parseActivityLocalDate(left.start_date_local).getTime()
            ),
        [allActivities]
    );

    const currentIndex = useMemo(
        () => allActivities.findIndex((candidate) => candidate.id === initialActivity.id),
        [allActivities, initialActivity.id]
    );
    const prevActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;
    const nextActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;

    const activityDate = useMemo(
        () => parseActivityLocalDate(activity.start_date_local),
        [activity.start_date_local]
    );
    const formattedActivityDate = useMemo(
        () => format(activityDate, 'eeee, d MMM y'),
        [activityDate]
    );

    const stats = useMemo(
        () => buildRunStats(activity, runs, shoes, fetchedShoe),
        [activity, fetchedShoe, runs, shoes]
    );

    const averageHeartrate = activity.average_heartrate ? Math.round(activity.average_heartrate) : null;
    const runInsightPayload = useMemo(
        () => buildRunDetailPayload(activity, allActivities, streams),
        [activity, allActivities, streams]
    );
    const runInsightContext = useMemo(
        () => buildRunInsightContext(activity, allActivities, streams),
        [activity, allActivities, streams]
    );
    const { similar, loading: similarLoading } = useSimilarRuns({
        activityId: activity.id,
        distanceKm: runInsightContext.distanceKm,
        paceMinPerKm: runInsightContext.paceMinPerKm,
        avgHR: runInsightContext.avgHR,
        elevationPerKm: runInsightContext.elevationPerKm,
        movingTimeMins: runInsightContext.movingTimeMins,
        runProfile: runInsightContext.runProfile,
        enabled: true,
    });

    const distanceAxisMax = useMemo(
        () => Math.max(1, Math.ceil(activity.distance / 1000)),
        [activity.distance]
    );
    const heartRateSummary = useMemo(
        () => buildHeartRateSummary(streams),
        [streams]
    );
    const chartData = useMemo(
        () => buildPerformanceChartData(streams, viewMode, chartTheme),
        [chartTheme, streams, viewMode]
    );
    const hrChartData = useMemo(
        () => buildHeartRateChartData(streams, chartTheme),
        [chartTheme, streams]
    );

    const hrChartOptions = useMemo(
        () => buildHeartRateChartOptions(
            chartTheme,
            distanceAxisMax,
            streams?.heartrate?.data?.filter((hr): hr is number => hr > 0) ?? []
        ),
        [chartTheme, distanceAxisMax, streams?.heartrate?.data]
    );

    const chartOptions = useMemo(
        () => (
            chartData
                ? buildPerformanceChartOptions(chartData, chartTheme, distanceAxisMax, viewMode)
                : {}
        ),
        [chartData, chartTheme, distanceAxisMax, viewMode]
    );

    const openSimilarRun = useCallback(async (
        stravaId: number,
        onSelect?: (activity: Activity) => void
    ) => {
        if (!onSelect) return;

        const matchedActivity = allActivities.find(
            (candidate) => Number(candidate.id) === Number(stravaId)
        );
        if (matchedActivity) {
            onSelect(matchedActivity);
            return;
        }

        try {
            const nextActivity = await activitiesApi.get(Number(stravaId));
            onSelect(nextActivity);
        } catch (error) {
            console.error('Failed to open similar run:', error);
        }
    }, [allActivities]);

    return {
        activity,
        averageHeartrate,
        chartData,
        chartOptions,
        chartTheme,
        formattedActivityDate,
        heartRateSummary,
        hrChartData,
        hrChartOptions,
        loadingStreams,
        nextActivity,
        openSimilarRun,
        prevActivity,
        runInsightContext,
        runInsightPayload,
        similar,
        similarLoading,
        stats,
        viewMode,
        setViewMode,
    };
}
