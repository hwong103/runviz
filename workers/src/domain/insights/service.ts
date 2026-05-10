import type { Auth } from '../../auth';
import {
    findSimilarActivities,
    findSimilarWeeks,
    formatSimilarActivitiesContext,
    formatSimilarWeeksContext,
} from '../memory';
import type { Env } from '../../env';
import { errorResponse, jsonResponse } from '../../http/response';
import { getAuthenticatedUserId } from '../../services/sessionService';
import { formatPace } from './formatters';
import {
    buildInsightCacheKey,
    buildInsightUserPrompt,
    INSIGHT_PROMPTS,
    PERSONA_PROMPTS,
    resolveInsightPersona,
} from './prompts';
import { sanitizeInsightText } from './sanitizer';

interface InsightModelResponse {
    response?: string;
}

interface InsightRequestBody {
    insightType: string;
    mostRecentActivityId: number;
    payloadHash?: string;
    forceRefresh?: boolean;
    payload: Record<string, unknown>;
    persona?: string;
    useMemory?: boolean;
    activityContext?: {
        distanceKm: number;
        paceMinPerKm: number | null;
        avgHR: number | null;
        elevationPerKm: number | null;
        movingTimeMins: number;
        runProfile: string;
        effortPattern?: string;
    };
    weekContext?: {
        totalKm: number;
        runCount: number;
        avgPaceMinPerKm: number | null;
        avgHR: number | null;
        easyRuns: number;
        steadyRuns: number;
        thresholdRuns: number;
        intervalRuns: number;
        raceRuns: number;
        longRuns: number;
        loadRatio: number | null;
        currentWeekKey?: string;
    };
}

async function handleGenerateInsight(
    request: Request,
    env: Env,
    origin: string,
    userId: string,
): Promise<Response> {
    const body = await request.json() as InsightRequestBody;
    const {
        insightType,
        mostRecentActivityId,
        payloadHash = 'default',
        forceRefresh = false,
        payload,
        persona,
        useMemory = false,
        activityContext,
        weekContext,
    } = body;

    if (!INSIGHT_PROMPTS[insightType]) {
        return errorResponse(`Unknown insight type: ${insightType}`, 400, env, origin);
    }

    const safePersona = resolveInsightPersona(persona);
    const cacheKey = buildInsightCacheKey(
        userId,
        insightType,
        mostRecentActivityId,
        payloadHash,
        safePersona,
    );

    if (!forceRefresh) {
        const cached = await env.RUNVIZ_KV.get(cacheKey);
        if (cached) {
            return jsonResponse({
                insight: cached,
                fromCache: true,
                insightType,
            }, env, origin);
        }
    }

    let similarContext = '';
    if (useMemory && insightType === 'run-detail' && activityContext) {
        const queryText = [
            `${activityContext.distanceKm.toFixed(1)}km run`,
            activityContext.runProfile && activityContext.runProfile !== 'unknown'
                ? `${activityContext.runProfile} effort`
                : '',
            activityContext.effortPattern && activityContext.effortPattern !== 'unknown'
                ? `${activityContext.effortPattern} pacing pattern`
                : '',
            activityContext.paceMinPerKm !== null
                ? `pace ${formatPace(activityContext.paceMinPerKm)}`
                : '',
            activityContext.avgHR ? `average heart rate ${activityContext.avgHR} bpm` : '',
            `duration ${Math.round(activityContext.movingTimeMins)} minutes`,
        ].filter(Boolean).join(', ');

        const similar = await findSimilarActivities(
            env,
            userId,
            queryText,
            4,
            mostRecentActivityId,
        );
        similarContext = formatSimilarActivitiesContext(similar);
    }

    let weekHistoryContext = '';
    if (
        useMemory &&
        (insightType === 'training-block' || insightType === 'overview' || insightType === 'training-health') &&
        weekContext
    ) {
        const qualityRuns = weekContext.thresholdRuns + weekContext.raceRuns + weekContext.intervalRuns;
        const queryParts = [
            `${weekContext.totalKm.toFixed(1)}km week`,
            `${weekContext.runCount} runs`,
            qualityRuns > 0 ? `${qualityRuns} quality session${qualityRuns > 1 ? 's' : ''}` : 'easy only',
        ];

        if (weekContext.avgPaceMinPerKm !== null) {
            queryParts.push(`average pace ${formatPace(weekContext.avgPaceMinPerKm)}`);
        }
        if (weekContext.avgHR) {
            queryParts.push(`average heart rate ${weekContext.avgHR} bpm`);
        }
        if (weekContext.longRuns > 0) {
            queryParts.push(
                weekContext.longRuns === 1
                    ? 'included one long run'
                    : `included ${weekContext.longRuns} long runs`,
            );
        }
        if (weekContext.loadRatio !== null) {
            queryParts.push(
                weekContext.loadRatio > 1.4
                    ? 'high load ratio'
                    : weekContext.loadRatio > 1.1
                        ? 'moderate load ratio'
                        : 'balanced load ratio',
            );
        }

        const similarWeeks = await findSimilarWeeks(
            env,
            userId,
            queryParts.join(', '),
            3,
            weekContext.currentWeekKey,
        );
        weekHistoryContext = formatSimilarWeeksContext(similarWeeks);
    }

    const userPrompt = buildInsightUserPrompt(
        insightType,
        payload,
        safePersona,
        [similarContext, weekHistoryContext].filter(Boolean),
    );

    try {
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
            messages: [
                { role: 'system', content: PERSONA_PROMPTS[safePersona] ?? PERSONA_PROMPTS.neutral },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 170,
        }) as InsightModelResponse;

        const insight = response.response ? sanitizeInsightText(response.response, payload, safePersona) : undefined;
        if (!insight) {
            throw new Error('AI response missing insight text');
        }

        await env.RUNVIZ_KV.put(cacheKey, insight);

        return jsonResponse({
            insight,
            fromCache: false,
            insightType,
        }, env, origin);
    } catch (error) {
        console.error('AI insight generation failed:', error);
        return errorResponse('Failed to generate insight', 500, env, origin);
    }
}

async function handleDeleteCache(
    request: Request,
    env: Env,
    origin: string,
    userId: string,
): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const insightType = url.searchParams.get('insightType');
    const mostRecentActivityId = url.searchParams.get('mostRecentActivityId');
    const payloadHash = url.searchParams.get('payloadHash') ?? 'default';
    const persona = resolveInsightPersona(url.searchParams.get('persona') ?? 'neutral');
    const resolvedKey = key ?? (
        insightType && mostRecentActivityId
            ? buildInsightCacheKey(userId, insightType, Number(mostRecentActivityId), payloadHash, persona)
            : null
    );

    if (!resolvedKey) {
        return errorResponse('Missing cache key', 400, env, origin);
    }

    if (!resolvedKey.startsWith(`insight:${userId}:`)) {
        return errorResponse('Forbidden', 403, env, origin);
    }

    try {
        await env.RUNVIZ_KV.delete(resolvedKey);
        return jsonResponse({ success: true }, env, origin);
    } catch (error) {
        console.error('Cache deletion failed:', error);
        return errorResponse('Failed to delete cache', 500, env, origin);
    }
}

export async function handleInsightRequest(
    request: Request,
    env: Env,
    origin: string,
    auth: Auth,
): Promise<Response> {
    const userId = await getAuthenticatedUserId(auth, request);
    if (!userId) {
        return errorResponse('Unauthorized', 401, env, origin);
    }

    if (request.method === 'POST') {
        return handleGenerateInsight(request, env, origin, userId);
    }

    if (request.method === 'DELETE' && request.url.includes('/api/insights/cache')) {
        return handleDeleteCache(request, env, origin, userId);
    }

    return errorResponse('Method not allowed', 405, env, origin);
}
