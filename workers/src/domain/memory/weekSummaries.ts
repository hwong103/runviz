import type { Env } from '../../env';
import { formatPace, weekToEmbeddingText } from './embeddingText';
import type {
    ActivityRecord,
    EmbeddingResponse,
    SimilarWeek,
    VectorizeQueryResult,
    WeekSummary,
} from './types';

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
                ),
            ),
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
