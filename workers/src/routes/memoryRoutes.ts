import {
    buildWeekSummaries,
    classifyRunProfile,
    indexActivities,
    indexWeeks,
    type ActivityRecord,
} from '../domain/memory';
import type { RequestContext } from '../http/context';
import { errorResponse, jsonResponse } from '../http/response';
import { getAuthenticatedUserId } from '../services/sessionService';

export async function handleMemoryRoutes(context: RequestContext): Promise<Response | null> {
    const { request, url, env, origin, auth } = context;

    if (url.pathname === '/api/memory/index' && request.method === 'POST') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        const body = await request.json() as {
            activities: Array<{
                id: number;
                start_date_local: string;
                distance: number;
                moving_time: number;
                average_speed: number;
                average_heartrate?: number;
                max_heartrate?: number;
                total_elevation_gain?: number;
                type: string;
                sport_type?: string;
            }>;
            medianPaceSecPerM: number;
        };

        const runs = body.activities.filter((activity) => {
            const activityType = activity.sport_type ?? activity.type;
            return activityType === 'Run' && activity.distance > 0;
        });

        const records: ActivityRecord[] = runs.map((activity) => {
            const paceMinPerKm = activity.average_speed > 0
                ? (1 / activity.average_speed) * 1000 / 60
                : null;
            const elevationPerKm = activity.total_elevation_gain && activity.distance > 0
                ? (activity.total_elevation_gain / activity.distance) * 1000
                : null;

            const record: ActivityRecord = {
                stravaId: activity.id,
                userId,
                activityDate: activity.start_date_local.split('T')[0],
                distanceKm: activity.distance / 1000,
                paceMinPerKm,
                avgHR: activity.average_heartrate ?? null,
                maxHR: activity.max_heartrate ?? null,
                elevationPerKm,
                movingTimeMins: activity.moving_time / 60,
                runProfile: 'unknown',
            };

            record.runProfile = classifyRunProfile(record, body.medianPaceSecPerM);
            return record;
        });

        const indexed = await indexActivities(env, userId, records);
        const weekSummaries = buildWeekSummaries(userId, records);
        const indexedWeeks = await indexWeeks(env, userId, weekSummaries);

        return jsonResponse({ indexed, indexedWeeks }, env, origin);
    }

    if (url.pathname === '/api/memory/status' && request.method === 'GET') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        const row = await env.DB.prepare(
            `SELECT COUNT(*) as count, MAX(activity_date) as lastDate
             FROM activity_vectors WHERE user_id = ?`,
        ).bind(userId).first<{ count: number; lastDate: string | null }>();

        return jsonResponse({
            indexed: row?.count ?? 0,
            lastIndexedDate: row?.lastDate ?? null,
        }, env, origin);
    }

    if (url.pathname === '/api/memory/similar-runs' && request.method === 'POST') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        const body = await request.json() as {
            activityContext: {
                distanceKm: number;
                paceMinPerKm: number | null;
                avgHR: number | null;
                elevationPerKm: number | null;
                movingTimeMins: number;
                runProfile: string;
            };
            excludeStravaId: number;
        };

        const { activityContext, excludeStravaId } = body;
        const queryParts: string[] = [
            `${activityContext.distanceKm.toFixed(1)}km run`,
        ];

        if (activityContext.runProfile && activityContext.runProfile !== 'unknown') {
            queryParts.push(`${activityContext.runProfile} effort`);
        }
        if (activityContext.paceMinPerKm !== null) {
            const mins = Math.floor(activityContext.paceMinPerKm);
            const secs = String(Math.round((activityContext.paceMinPerKm % 1) * 60)).padStart(2, '0');
            queryParts.push(`pace ${mins}:${secs} per km`);
        }
        if (activityContext.avgHR) {
            queryParts.push(`average heart rate ${activityContext.avgHR} bpm`);
        }
        if (activityContext.elevationPerKm && activityContext.elevationPerKm > 5) {
            queryParts.push(`${Math.round(activityContext.elevationPerKm)} metres elevation per km`);
        }
        queryParts.push(`duration ${Math.round(activityContext.movingTimeMins)} minutes`);

        const { findSimilarActivities, findSimilarActivitiesFallback } = await import('../domain/memory');
        let similar = await findSimilarActivities(
            env,
            userId,
            queryParts.join(', '),
            4,
            excludeStravaId,
        );

        if (similar.length === 0) {
            similar = await findSimilarActivitiesFallback(
                env,
                userId,
                {
                    distanceKm: activityContext.distanceKm,
                    paceMinPerKm: activityContext.paceMinPerKm,
                    avgHR: activityContext.avgHR,
                    movingTimeMins: activityContext.movingTimeMins,
                },
                4,
                excludeStravaId,
            );
        }

        return jsonResponse(similar, env, origin);
    }

    return null;
}
