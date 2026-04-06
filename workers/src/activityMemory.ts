import type { Env } from './index';

export type RunProfile = 'easy' | 'steady' | 'threshold' | 'race' | 'interval' | 'unknown';

export interface ActivityRecord {
    stravaId: number;
    userId: string;
    activityDate: string;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    maxHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: RunProfile;
}

export interface SimilarActivity {
    stravaId: number;
    activityDate: string;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: RunProfile;
    similarity: number;
}

interface EmbeddingResponse {
    data: number[][];
}

interface VectorizeMatchMetadata {
    stravaId?: number;
    activityDate?: string;
    distanceKm?: number;
    paceMinPerKm?: number;
    avgHR?: number;
    elevationPerKm?: number;
    movingTimeMins?: number;
    runProfile?: RunProfile;
}

interface VectorizeQueryResult {
    matches?: Array<{
        metadata?: VectorizeMatchMetadata;
        score?: number;
    }>;
}

export function activityToEmbeddingText(record: ActivityRecord): string {
    const parts: string[] = [
        `${record.distanceKm.toFixed(1)}km run`,
        record.runProfile !== 'unknown' ? `${record.runProfile} effort` : '',
        record.paceMinPerKm !== null ? `pace ${formatPace(record.paceMinPerKm)} per km` : '',
        record.avgHR ? `average heart rate ${record.avgHR} bpm` : '',
        record.elevationPerKm !== null && record.elevationPerKm > 5
            ? `${Math.round(record.elevationPerKm)} metres elevation per km`
            : 'flat course',
        `duration ${Math.round(record.movingTimeMins)} minutes`,
    ];

    return parts.filter(Boolean).join(', ');
}

export function classifyRunProfile(
    activity: ActivityRecord,
    medianPaceSecPerM: number,
): RunProfile {
    const hasValidMedianPace = Number.isFinite(medianPaceSecPerM) && medianPaceSecPerM > 0;
    const activityPaceSecPerM = activity.paceMinPerKm !== null
        ? (activity.paceMinPerKm * 60) / 1000
        : null;

    if (!hasValidMedianPace || !activityPaceSecPerM || activityPaceSecPerM <= 0) {
        return 'unknown';
    }

    const paceRatio = medianPaceSecPerM / activityPaceSecPerM;

    if (!activity.avgHR || !activity.maxHR) {
        if (paceRatio > 1.08) return 'race';
        if (paceRatio > 1.02) return 'threshold';
        if (paceRatio > 0.95) return 'steady';
        return 'easy';
    }

    const hrRatio = activity.maxHR / activity.avgHR;

    if (hrRatio > 1.18) return 'interval';
    if (paceRatio > 1.08 && hrRatio < 1.08) return 'race';
    if (paceRatio > 1.02 && hrRatio < 1.12) return 'threshold';
    if (paceRatio > 0.95) return 'steady';
    return 'easy';
}

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
                )
            )
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
            topK: excludeStravaId ? k + 1 : k,
            filter: { userId },
            returnMetadata: 'all',
        }) as VectorizeQueryResult;
    } catch (error) {
        console.error('Vectorize query failed:', error);
        return [];
    }

    return (matches.matches ?? [])
        .filter((match) => {
            if (!match.metadata?.stravaId || !match.metadata.activityDate || !match.metadata.distanceKm || !match.metadata.movingTimeMins) {
                return false;
            }

            if (excludeStravaId && match.metadata.stravaId === excludeStravaId) {
                return false;
            }

            return true;
        })
        .slice(0, k)
        .map((match) => ({
            stravaId: match.metadata!.stravaId!,
            activityDate: match.metadata!.activityDate!,
            distanceKm: match.metadata!.distanceKm!,
            paceMinPerKm: match.metadata!.paceMinPerKm ? match.metadata!.paceMinPerKm : null,
            avgHR: match.metadata!.avgHR ? match.metadata!.avgHR : null,
            elevationPerKm: match.metadata!.elevationPerKm ? match.metadata!.elevationPerKm : null,
            movingTimeMins: match.metadata!.movingTimeMins!,
            runProfile: match.metadata!.runProfile ?? 'unknown',
            similarity: match.score ?? 0,
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
        'SELECT 1 FROM activity_vectors WHERE user_id = ? LIMIT 1'
    ).bind(userId).first();

    return row !== null;
}

export async function getLastIndexedDate(env: Env, userId: string): Promise<string | null> {
    const row = await env.DB.prepare(
        'SELECT activity_date FROM activity_vectors WHERE user_id = ? ORDER BY activity_date DESC LIMIT 1'
    ).bind(userId).first<{ activity_date: string }>();

    return row?.activity_date ?? null;
}

function formatPace(minutesPerKm: number): string {
    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm % 1) * 60);

    if (seconds === 60) {
        return `${minutes + 1}:00`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
