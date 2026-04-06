import type { Auth } from './auth';
import type { Env } from './index';
import {
    findSimilarActivities,
    formatSimilarActivitiesContext,
} from './activityMemory';

const SYSTEM_PROMPT = `You are a pragmatic, data-literate running coach speaking directly to the athlete. Always use second person — "you", "your" — never "this athlete", "they", or "their". Write in plain English, avoid jargon, and give specific actionable coaching. Respond in exactly 2 sentences and keep the full response under 85 words. Do not use bullet points, headers, or markdown formatting. Always compare to the athlete's own historical baseline provided in the data, not to population averages, unless directly relevant. Be direct but not alarming. If something is a concern, say so clearly. If something is positive, note it — but don't be effusive. Sentence 1 should explain what is happening and why it is likely happening based on the provided metrics. Sentence 2 should say what to do next over the next few days or 1-2 weeks, with a concrete action and, when supported by the data, a goal adjustment or training priority. Prefer specific instructions like rest, easy-only running, holding volume, or delaying intensity, and include a timeframe or condition where possible. If the cause is uncertain, say "likely" or "may" rather than sounding certain. Do not pad the response by restating every metric; mention only the most important evidence. When discussing pace, use minutes per kilometer (min/km) format like "5:30/km" or "5.5 min/km", never seconds per kilometer. If two values round to the same displayed number, do not describe one as higher or lower than the other. Only reason about fields that are present in the data. If a metric is absent, treat it as unavailable rather than zero or evidence of decline.`;

const INSIGHT_PROMPTS: Record<string, (payload: Record<string, unknown>) => string> = {
    overview: (payload) => `Analyse your current training block - specifically your load ratio, routine consistency, weekly change trend, and aerobic efficiency. Explain what state the block is in, what is most likely driving that state, and what you should do over the next 7-10 days. If the block is unstable, tell the runner what to reduce or avoid. Do not just restate the numbers; interpret them into a plan.

Data:
${formatPayload(payload)}`,

    'training-health': (payload) => `Analyse your training stress, monotony, and strain metrics. Explain what they suggest about stress distribution, why that pattern is likely happening, and what change to make in the next 7 days. Give one concrete coaching instruction about recovery, intensity, or session spacing.

Data:
${formatPayload(payload)}`,

    fitness: (payload) => `Analyse your fitness (CTL), fatigue (ATL), and training stress balance (TSB). Explain your current form state, why it looks that way, and what that means for training or racing in the next 3-10 days. Be explicit about whether you should push, maintain, absorb training, or freshen up.

Data:
${formatPayload(payload)}`,

    volume: (payload) => `Analyse your weekly volume trend over the supplied analysis window, including ramp rate. Explain whether the current trajectory is sustainable, what is likely driving it relative to baseline, and what to do with volume over the next 1-2 weeks. Be explicit about whether to hold, cut back, or keep building.

Data:
${formatPayload(payload)}`,

    'injury-risk': (payload) => `Your load metrics have crossed a risk threshold. Give a direct, calm coaching read on the risk pattern, what is most likely causing it, and a specific short-term plan to reduce risk. Include a timeframe or condition for returning to normal training.

Data:
${formatPayload(payload)}`,

    'race-prediction': (payload) => `Analyse your VDOT trend, race time predictions, and current readiness context. Explain what your race potential looks like right now, why it is likely moving that way, and what to do over the next 7-14 days to respond. If current fatigue or freshness suggests caution, say so clearly and adjust the near-term goal accordingly.

Data:
${formatPayload(payload)}`,

    'run-detail': (payload) => `Analyse this specific run in the context of your recent history. Explain what was notable about it, why it matters for your current fitness or fatigue, and how your next 1-2 runs should change because of it. If it was a breakthrough, say how to build on it; if it was a warning sign, say how to absorb it.

Data:
${formatPayload(payload)}`,
};

interface InsightModelResponse {
    response?: string;
}

function formatPayload(payload: Record<string, unknown>): string {
    return Object.entries(payload)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
            return `- ${formattedKey}: ${formatValue(key, value)}`;
        })
        .join('\n');
}

function formatValue(key: string, value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (key.toLowerCase().includes('pace')) {
            return formatPace(value);
        }
        return String(value);
    }

    return String(value);
}

function formatPace(minutesPerKm: number): string {
    if (!Number.isFinite(minutesPerKm) || minutesPerKm <= 0) {
        return 'n/a';
    }

    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm - minutes) * 60);
    if (seconds === 60) {
        return `${minutes + 1}:00/km`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
}

export async function handleInsightRequest(request: Request, env: Env, origin: string, auth: Auth): Promise<Response> {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }

    if (request.method === 'POST') {
        return await handleGenerateInsight(request, env, origin, session.user.id);
    }

    if (request.method === 'DELETE' && request.url.includes('/api/insights/cache')) {
        return await handleDeleteCache(request, env, origin, session.user.id);
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
}

async function handleGenerateInsight(request: Request, env: Env, origin: string, userId: string): Promise<Response> {
    const body = await request.json() as {
        insightType: string;
        mostRecentActivityId: number;
        payloadHash?: string;
        forceRefresh?: boolean;
        payload: Record<string, unknown>;
        useMemory?: boolean;
        activityContext?: {
            distanceKm: number;
            paceMinPerKm: number | null;
            avgHR: number | null;
            elevationPerKm: number | null;
            movingTimeMins: number;
            runProfile: string;
        };
    };

    const {
        insightType,
        mostRecentActivityId,
        payloadHash = 'default',
        forceRefresh = false,
        payload,
        useMemory = false,
        activityContext,
    } = body;

    if (!INSIGHT_PROMPTS[insightType]) {
        return new Response(JSON.stringify({ error: `Unknown insight type: ${insightType}` }), {
            status: 400,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }

    const cacheKey = `insight:${userId}:${insightType}:${mostRecentActivityId}:${payloadHash}`;

    // Check cache unless force refresh
    if (!forceRefresh) {
        const cached = await env.RUNVIZ_KV.get(cacheKey);
        if (cached) {
            return new Response(JSON.stringify({
                insight: cached,
                fromCache: true,
                insightType,
            }), {
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
            });
        }
    }

    let similarContext = '';
    if (useMemory && insightType === 'run-detail' && activityContext) {
        const queryText = [
            `${activityContext.distanceKm.toFixed(1)}km run`,
            activityContext.runProfile && activityContext.runProfile !== 'unknown'
                ? `${activityContext.runProfile} effort`
                : '',
            activityContext.paceMinPerKm !== null
                ? `pace ${formatPace(activityContext.paceMinPerKm)} per km`
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

    const basePrompt = INSIGHT_PROMPTS[insightType](payload);
    const userPrompt = similarContext ? `${basePrompt}\n\n${similarContext}` : basePrompt;

    try {
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 180,
        }) as InsightModelResponse;

        const insight = response.response;
        if (!insight) {
            throw new Error('AI response missing insight text');
        }

        // Store in cache (no TTL - relies on KV LRU)
        await env.RUNVIZ_KV.put(cacheKey, insight);

        return new Response(JSON.stringify({
            insight,
            fromCache: false,
            insightType,
        }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('AI insight generation failed:', error);
        return new Response(JSON.stringify({ error: 'Failed to generate insight' }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }
}

async function handleDeleteCache(request: Request, env: Env, origin: string, userId: string): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const insightType = url.searchParams.get('insightType');
    const mostRecentActivityId = url.searchParams.get('mostRecentActivityId');
    const payloadHash = url.searchParams.get('payloadHash') ?? 'default';
    const resolvedKey = key ?? (
        insightType && mostRecentActivityId
            ? `insight:${userId}:${insightType}:${mostRecentActivityId}:${payloadHash}`
            : null
    );

    if (!resolvedKey) {
        return new Response(JSON.stringify({ error: 'Missing cache key' }), {
            status: 400,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }

    if (!resolvedKey.startsWith(`insight:${userId}:`)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }

    try {
        await env.RUNVIZ_KV.delete(resolvedKey);
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Cache deletion failed:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete cache' }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }
}

function corsHeaders(origin: string): HeadersInit {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function formatPace(minutesPerKm: number): string {
    if (!Number.isFinite(minutesPerKm) || minutesPerKm <= 0) {
        return 'n/a';
    }

    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm - minutes) * 60);
    if (seconds === 60) {
        return `${minutes + 1}:00`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
