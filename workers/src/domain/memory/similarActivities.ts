import type { Env } from '../../env';
import { activityToEmbeddingText, formatPace } from './embeddingText';
import type {
    ActivityRecord,
    EmbeddingResponse,
    SimilarActivity,
    VectorizeQueryResult,
} from './types';

export async function indexActivities(
    env: Env,
    userId: string,
    records: ActivityRecord[],
): Promise<number> {
    if (records.length === 0) return 0;

    const batchSize = 50;
    let indexed = 0;

    for (let index = 0; index < records.length; index += batchSize) {
        const batch = records.slice(index, index + batchSize);
        const texts = batch.map(activityToEmbeddingText);

        let embeddings: number[][];
        try {
            const result = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: texts }) as EmbeddingResponse;
            embeddings = result.data;
        } catch (error) {
            console.error('Embedding batch failed:', error);
            continue;
        }

        const vectors = batch.map((record, batchIndex) => ({
            id: `${userId}:${record.stravaId}`,
            values: embeddings[batchIndex],
            metadata: {
                type: 'activity' as const,
                userId,
                stravaId: record.stravaId,
                activityDate: record.activityDate,
                distanceKm: record.distanceKm,
                paceMinPerKm: record.paceMinPerKm ?? 0,
                avgHR: record.avgHR ?? 0,
                elevationPerKm: record.elevationPerKm ?? 0,
                movingTimeMins: record.movingTimeMins,
                runProfile: record.runProfile,
            },
        }));

        try {
            await env.ACTIVITY_VECTORS.upsert(vectors);
        } catch (error) {
            console.error('Vectorize upsert failed:', error);
            continue;
        }

        const stmt = env.DB.prepare(`
            INSERT INTO activity_vectors
              (id, user_id, strava_id, activity_date, distance_km, pace_min_per_km,
               avg_hr, max_hr, elevation_per_km, moving_time_mins, run_profile, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
            ON CONFLICT(user_id, strava_id) DO UPDATE SET
              activity_date = excluded.activity_date,
              distance_km = excluded.distance_km,
              pace_min_per_km = excluded.pace_min_per_km,
              avg_hr = excluded.avg_hr,
              max_hr = excluded.max_hr,
              elevation_per_km = excluded.elevation_per_km,
              moving_time_mins = excluded.moving_time_mins,
              run_profile = excluded.run_profile,
              indexed_at = unixepoch()
        `);

        await env.DB.batch(
            batch.map((record) =>
                stmt.bind(
                    `${userId}:${record.stravaId}`,
                    userId,
                    record.stravaId,
                    record.activityDate,
                    record.distanceKm,
                    record.paceMinPerKm ?? null,
                    record.avgHR ?? null,
                    record.maxHR ?? null,
                    record.elevationPerKm ?? null,
                    record.movingTimeMins,
                    record.runProfile,
                ),
            ),
        );

        indexed += batch.length;
    }

    return indexed;
}

export async function findSimilarActivities(
    env: Env,
    userId: string,
    queryText: string,
    k = 5,
    excludeStravaId?: number,
): Promise<SimilarActivity[]> {
    let queryVector: number[];
    try {
        const result = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: [queryText] }) as EmbeddingResponse;
        queryVector = result.data[0];
    } catch (error) {
        console.error('Memory query embedding failed:', error);
        return [];
    }

    let matches: VectorizeQueryResult;
    try {
        matches = await env.ACTIVITY_VECTORS.query(queryVector, {
            topK: excludeStravaId ? k + 4 : k + 3,
            filter: { userId },
            returnMetadata: 'all',
        }) as VectorizeQueryResult;
    } catch (error) {
        console.error('Vectorize query failed:', error);
        return [];
    }

    const vectorMatches = (matches.matches ?? [])
        .filter((match) => {
            if (match.metadata?.stravaId === undefined || !match.metadata.activityDate || !match.metadata.distanceKm || !match.metadata.movingTimeMins) {
                return false;
            }

            if (excludeStravaId && Number(match.metadata.stravaId) === Number(excludeStravaId)) {
                return false;
            }

            return true;
        })
        .slice(0, k)
        .map((match) => ({
            stravaId: Number(match.metadata!.stravaId!),
            activityDate: match.metadata!.activityDate!,
            distanceKm: match.metadata!.distanceKm!,
            paceMinPerKm: match.metadata!.paceMinPerKm ? match.metadata!.paceMinPerKm : null,
            avgHR: match.metadata!.avgHR ? match.metadata!.avgHR : null,
            elevationPerKm: match.metadata!.elevationPerKm ? match.metadata!.elevationPerKm : null,
            movingTimeMins: match.metadata!.movingTimeMins!,
            runProfile: match.metadata!.runProfile ?? 'unknown',
            similarity: match.score ?? 0,
        }));

    if (vectorMatches.length > 0) {
        return vectorMatches;
    }

    return [];
}

export async function findSimilarActivitiesFallback(
    env: Env,
    userId: string,
    context: {
        distanceKm: number;
        paceMinPerKm: number | null;
        avgHR: number | null;
        movingTimeMins: number;
    },
    k = 5,
    excludeStravaId?: number,
): Promise<SimilarActivity[]> {
    const rows = await env.DB.prepare(`
        SELECT
          strava_id,
          activity_date,
          distance_km,
          pace_min_per_km,
          avg_hr,
          elevation_per_km,
          moving_time_mins,
          run_profile
        FROM activity_vectors
        WHERE user_id = ?
          AND (? IS NULL OR strava_id != ?)
        ORDER BY
          ABS(distance_km - ?) * 3.0 +
          ABS(COALESCE(pace_min_per_km, ?) - ?) * 1.5 +
          ABS(COALESCE(avg_hr, ?) - ?) * 0.03 +
          ABS(moving_time_mins - ?) * 0.05
        LIMIT ?
    `).bind(
        userId,
        excludeStravaId ?? null,
        excludeStravaId ?? null,
        context.distanceKm,
        context.paceMinPerKm ?? 0,
        context.paceMinPerKm ?? 0,
        context.avgHR ?? 0,
        context.avgHR ?? 0,
        context.movingTimeMins,
        k,
    ).all<{
        strava_id: number;
        activity_date: string;
        distance_km: number;
        pace_min_per_km: number | null;
        avg_hr: number | null;
        elevation_per_km: number | null;
        moving_time_mins: number;
        run_profile: ActivityRecord['runProfile'] | null;
    }>();

    return (rows.results ?? []).map((row, index) => ({
        stravaId: row.strava_id,
        activityDate: row.activity_date,
        distanceKm: row.distance_km,
        paceMinPerKm: row.pace_min_per_km,
        avgHR: row.avg_hr,
        elevationPerKm: row.elevation_per_km,
        movingTimeMins: row.moving_time_mins,
        runProfile: row.run_profile ?? 'unknown',
        similarity: Math.max(0, 1 - index * 0.1),
    }));
}

export function formatSimilarActivitiesContext(activities: SimilarActivity[]): string {
    if (activities.length === 0) {
        return '';
    }

    const lines = activities.map((activity, index) => {
        const pace = activity.paceMinPerKm !== null
            ? `${formatPace(activity.paceMinPerKm)}/km`
            : 'pace unknown';
        const hr = activity.avgHR ? ` at avg ${activity.avgHR} bpm` : '';
        const elevation = activity.elevationPerKm && activity.elevationPerKm > 5
            ? ` (${Math.round(activity.elevationPerKm)}m/km elevation)`
            : '';

        return `${index + 1}. ${activity.activityDate} - ${activity.distanceKm.toFixed(1)}km ${activity.runProfile} run, ${pace}${hr}${elevation}`;
    });

    return `Similar past runs from your history:\n${lines.join('\n')}`;
}

export async function hasIndexedActivities(env: Env, userId: string): Promise<boolean> {
    const row = await env.DB.prepare(
        'SELECT 1 FROM activity_vectors WHERE user_id = ? LIMIT 1',
    ).bind(userId).first();

    return row !== null;
}

export async function getLastIndexedDate(env: Env, userId: string): Promise<string | null> {
    const row = await env.DB.prepare(
        'SELECT activity_date FROM activity_vectors WHERE user_id = ? ORDER BY activity_date DESC LIMIT 1',
    ).bind(userId).first<{ activity_date: string }>();

    return row?.activity_date ?? null;
}
