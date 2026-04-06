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

export interface WeekSummary {
    userId: string;
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    totalKm: number;
    runCount: number;
    avgPaceMinPerKm: number | null;
    avgHR: number | null;
    easyRuns: number;
    steadyRuns: number;
    thresholdRuns: number;
    raceRuns: number;
    intervalRuns: number;
    loadRatio: number | null;
}

export interface SimilarWeek {
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    totalKm: number;
    runCount: number;
    avgPaceMinPerKm: number | null;
    avgHR: number | null;
    easyRuns: number;
    thresholdRuns: number;
    raceRuns: number;
    loadRatio: number | null;
    similarity: number;
}

interface EmbeddingResponse {
    data: number[][];
}

interface VectorizeMatchMetadata {
    type?: 'activity' | 'week';
    stravaId?: number;
    activityDate?: string;
    distanceKm?: number;
    paceMinPerKm?: number;
    avgHR?: number;
    elevationPerKm?: number;
    movingTimeMins?: number;
    runProfile?: RunProfile;
    weekKey?: string;
    weekStart?: string;
    weekEnd?: string;
    totalKm?: number;
    runCount?: number;
    avgPaceMinPerKm?: number;
    easyRuns?: number;
    steadyRuns?: number;
    thresholdRuns?: number;
    raceRuns?: number;
    intervalRuns?: number;
    loadRatio?: number;
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
            topK: excludeStravaId ? k + 4 : k + 3,
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

export function weekToEmbeddingText(week: WeekSummary): string {
    const parts: string[] = [
        `${week.totalKm.toFixed(1)}km running week`,
        `${week.runCount} run${week.runCount !== 1 ? 's' : ''}`,
    ];

    if (week.totalKm >= 80) parts.push('very high volume');
    else if (week.totalKm >= 60) parts.push('high volume');
    else if (week.totalKm >= 40) parts.push('moderate volume');
    else if (week.totalKm >= 20) parts.push('low volume');
    else parts.push('very low volume');

    const qualityRuns = week.thresholdRuns + week.raceRuns + week.intervalRuns;
    if (qualityRuns >= 3) parts.push('high intensity mix');
    else if (qualityRuns === 2) parts.push('moderate intensity mix');
    else if (qualityRuns === 1) parts.push('one quality session');
    else parts.push('easy only week');

    if (week.avgPaceMinPerKm !== null) {
        parts.push(`average pace ${formatPace(week.avgPaceMinPerKm)} per km`);
    }

    if (week.avgHR) parts.push(`average heart rate ${week.avgHR} bpm`);

    if (week.loadRatio !== null) {
        if (week.loadRatio > 1.4) parts.push('high acute load ratio');
        else if (week.loadRatio > 1.1) parts.push('moderate acute load ratio');
        else parts.push('balanced load ratio');
    }

    return parts.join(', ');
}

export function buildWeekSummaries(
    userId: string,
    records: ActivityRecord[],
): WeekSummary[] {
    const weekMap = new Map<string, ActivityRecord[]>();

    for (const record of records) {
        const monday = getWeekStart(record.activityDate);
        const weekKey = getIsoWeekKey(monday);

        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, []);
        }
        weekMap.get(weekKey)!.push(record);
    }

    const summaries: WeekSummary[] = [];

    for (const [weekKey, weekRuns] of weekMap) {
        if (weekRuns.length === 0) continue;

        const monday = getWeekStart(weekRuns[0].activityDate);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const totalKm = weekRuns.reduce((sum, record) => sum + record.distanceKm, 0);
        const runsWithPace = weekRuns.filter((record) => record.paceMinPerKm !== null);
        const avgPaceMinPerKm = runsWithPace.length > 0
            ? runsWithPace.reduce((sum, record) => sum + record.paceMinPerKm!, 0) / runsWithPace.length
            : null;
        const runsWithHR = weekRuns.filter((record) => record.avgHR !== null);
        const avgHR = runsWithHR.length > 0
            ? Math.round(runsWithHR.reduce((sum, record) => sum + record.avgHR!, 0) / runsWithHR.length)
            : null;

        summaries.push({
            userId,
            weekKey,
            weekStart: toIsoDate(monday),
            weekEnd: toIsoDate(sunday),
            totalKm: Math.round(totalKm * 10) / 10,
            runCount: weekRuns.length,
            avgPaceMinPerKm: avgPaceMinPerKm !== null ? Math.round(avgPaceMinPerKm * 100) / 100 : null,
            avgHR,
            easyRuns: weekRuns.filter((record) => record.runProfile === 'easy').length,
            steadyRuns: weekRuns.filter((record) => record.runProfile === 'steady').length,
            thresholdRuns: weekRuns.filter((record) => record.runProfile === 'threshold').length,
            raceRuns: weekRuns.filter((record) => record.runProfile === 'race').length,
            intervalRuns: weekRuns.filter((record) => record.runProfile === 'interval').length,
            loadRatio: null,
        });
    }

    return summaries.sort((left, right) => left.weekKey.localeCompare(right.weekKey));
}

export async function indexWeeks(
    env: Env,
    userId: string,
    weeks: WeekSummary[],
): Promise<number> {
    if (weeks.length === 0) return 0;

    const batchSize = 50;
    let indexed = 0;

    for (let index = 0; index < weeks.length; index += batchSize) {
        const batch = weeks.slice(index, index + batchSize);
        const texts = batch.map(weekToEmbeddingText);

        let embeddings: number[][];
        try {
            const result = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: texts }) as EmbeddingResponse;
            embeddings = result.data;
        } catch (error) {
            console.error('Week embedding batch failed:', error);
            continue;
        }

        const vectors = batch.map((week, batchIndex) => ({
            id: `week:${userId}:${week.weekKey}`,
            values: embeddings[batchIndex],
            metadata: {
                type: 'week' as const,
                userId,
                weekKey: week.weekKey,
                weekStart: week.weekStart,
                weekEnd: week.weekEnd,
                totalKm: week.totalKm,
                runCount: week.runCount,
                avgPaceMinPerKm: week.avgPaceMinPerKm ?? 0,
                avgHR: week.avgHR ?? 0,
                easyRuns: week.easyRuns,
                steadyRuns: week.steadyRuns,
                thresholdRuns: week.thresholdRuns,
                raceRuns: week.raceRuns,
                intervalRuns: week.intervalRuns,
                loadRatio: week.loadRatio ?? 0,
            },
        }));

        try {
            await env.ACTIVITY_VECTORS.upsert(vectors);
        } catch (error) {
            console.error('Week Vectorize upsert failed:', error);
            continue;
        }

        const stmt = env.DB.prepare(`
            INSERT INTO week_vectors
              (id, user_id, week_key, week_start, week_end, total_km, run_count,
               avg_pace_min_per_km, avg_hr, easy_runs, steady_runs, threshold_runs,
               race_runs, interval_runs, load_ratio, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
            ON CONFLICT(user_id, week_key) DO UPDATE SET
              total_km = excluded.total_km,
              run_count = excluded.run_count,
              avg_pace_min_per_km = excluded.avg_pace_min_per_km,
              avg_hr = excluded.avg_hr,
              easy_runs = excluded.easy_runs,
              steady_runs = excluded.steady_runs,
              threshold_runs = excluded.threshold_runs,
              race_runs = excluded.race_runs,
              interval_runs = excluded.interval_runs,
              load_ratio = excluded.load_ratio,
              indexed_at = unixepoch()
        `);

        await env.DB.batch(
            batch.map((week) =>
                stmt.bind(
                    `${userId}:${week.weekKey}`,
                    userId,
                    week.weekKey,
                    week.weekStart,
                    week.weekEnd,
                    week.totalKm,
                    week.runCount,
                    week.avgPaceMinPerKm ?? null,
                    week.avgHR ?? null,
                    week.easyRuns,
                    week.steadyRuns,
                    week.thresholdRuns,
                    week.raceRuns,
                    week.intervalRuns,
                    week.loadRatio ?? null,
                )
            )
        );

        indexed += batch.length;
    }

    return indexed;
}

export async function findSimilarWeeks(
    env: Env,
    userId: string,
    queryText: string,
    k = 3,
    excludeWeekKey?: string,
): Promise<SimilarWeek[]> {
    let queryVector: number[];
    try {
        const result = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: [queryText] }) as EmbeddingResponse;
        queryVector = result.data[0];
    } catch (error) {
        console.error('Week memory query embedding failed:', error);
        return [];
    }

    let matches: VectorizeQueryResult;
    try {
        matches = await env.ACTIVITY_VECTORS.query(queryVector, {
            topK: excludeWeekKey ? k + 1 : k,
            filter: { userId, type: 'week' },
            returnMetadata: 'all',
        }) as VectorizeQueryResult;
    } catch (error) {
        console.error('Week Vectorize query failed:', error);
        return [];
    }

    return (matches.matches ?? [])
        .filter((match) => {
            if (!match.metadata?.weekKey || !match.metadata.weekStart || !match.metadata.weekEnd || !match.metadata.totalKm || !match.metadata.runCount) {
                return false;
            }

            if (excludeWeekKey && match.metadata.weekKey === excludeWeekKey) {
                return false;
            }

            return true;
        })
        .slice(0, k)
        .map((match) => ({
            weekKey: match.metadata!.weekKey!,
            weekStart: match.metadata!.weekStart!,
            weekEnd: match.metadata!.weekEnd!,
            totalKm: match.metadata!.totalKm!,
            runCount: match.metadata!.runCount!,
            avgPaceMinPerKm: match.metadata!.avgPaceMinPerKm ? match.metadata!.avgPaceMinPerKm : null,
            avgHR: match.metadata!.avgHR ? match.metadata!.avgHR : null,
            easyRuns: match.metadata!.easyRuns ?? 0,
            thresholdRuns: match.metadata!.thresholdRuns ?? 0,
            raceRuns: match.metadata!.raceRuns ?? 0,
            loadRatio: match.metadata!.loadRatio ? match.metadata!.loadRatio : null,
            similarity: match.score ?? 0,
        }));
}

export function formatSimilarWeeksContext(weeks: SimilarWeek[]): string {
    if (weeks.length === 0) {
        return '';
    }

    const lines = weeks.map((week, index) => {
        const pace = week.avgPaceMinPerKm !== null ? `avg ${formatPace(week.avgPaceMinPerKm)}/km` : '';
        const hr = week.avgHR ? ` at ${week.avgHR}bpm` : '';
        const qualityRuns = week.thresholdRuns + week.raceRuns;
        const mix = qualityRuns > 0
            ? `${qualityRuns} quality session${qualityRuns > 1 ? 's' : ''}`
            : 'easy only';

        return `${index + 1}. Week of ${week.weekStart} - ${week.totalKm.toFixed(1)}km over ${week.runCount} runs, ${mix}${pace ? `, ${pace}` : ''}${hr}`;
    });

    return `Similar training weeks from your history:\n${lines.join('\n')}`;
}

function formatPace(minutesPerKm: number): string {
    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm % 1) * 60);

    if (seconds === 60) {
        return `${minutes + 1}:00`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getWeekStart(activityDate: string): Date {
    const date = new Date(`${activityDate}T12:00:00Z`);
    const dayOfWeek = date.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
}

function getIsoWeekKey(monday: Date): string {
    const thursday = new Date(monday);
    thursday.setUTCDate(monday.getUTCDate() + 3);
    const isoYear = thursday.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstThursdayDay = firstThursday.getUTCDay() || 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - firstThursdayDay));
    const weekNum = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
    return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

function toIsoDate(date: Date): string {
    return date.toISOString().split('T')[0];
}
