import type { Env } from './index';

const SYSTEM_PROMPT = `You are a pragmatic, data-literate running coach speaking directly to the athlete. Always use second person — "you", "your" — never "this athlete", "they", or "their". Write in plain English, avoid jargon, and give specific actionable observations. Respond in 2-3 sentences maximum. Do not use bullet points, headers, or markdown formatting. Always compare to the athlete's own historical baseline provided in the data, not to population averages, unless directly relevant. Be direct but not alarming. If something is a concern, say so clearly. If something is positive, note it — but don't be effusive.`;

const INSIGHT_PROMPTS: Record<string, (payload: Record<string, unknown>) => string> = {
    overview: (payload) => `Analyse this athlete's current training block — specifically their load ratio, routine consistency, weekly change trend, and aerobic efficiency. Give a coaching observation about the state of the block and any risk or opportunity you see. Do not restate the numbers; interpret them.

Data:
${formatPayload(payload)}`,

    'training-health': (payload) => `Analyse this athlete's training stress, monotony, and strain metrics. Give a coaching observation about the quality of their training stress distribution and what it suggests about readiness or risk.

Data:
${formatPayload(payload)}`,

    fitness: (payload) => `Analyse this athlete's fitness (CTL), fatigue (ATL), and training stress balance (TSB). Give a coaching observation about their current form state and what it means for training or racing in the near term.

Data:
${formatPayload(payload)}`,

    volume: (payload) => `Analyse this athlete's weekly volume trend over the last 6 weeks, including ramp rate. Give a coaching observation about the sustainability of the current trajectory.

Data:
${formatPayload(payload)}`,

    'injury-risk': (payload) => `This athlete's load metrics have crossed a risk threshold. Give a direct, calm coaching observation about the injury risk pattern you see and one specific action they can take this week to reduce it.

Data:
${formatPayload(payload)}`,

    'race-prediction': (payload) => `Analyse this athlete's VDOT trend and race time predictions. Give a coaching observation about the direction their fitness is heading and what it realistically suggests about near-term race potential.

Data:
${formatPayload(payload)}`,

    'run-detail': (payload) => `Analyse this specific run in the context of the athlete's recent history. Something notable happened on this run — focus on what the data suggests it means for their training or fitness trajectory.

Data:
${formatPayload(payload)}`,
};

function formatPayload(payload: Record<string, unknown>): string {
    return Object.entries(payload)
        .map(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
            return `- ${formattedKey}: ${value}`;
        })
        .join('\n');
}

export async function handleInsightRequest(request: Request, env: Env, origin: string): Promise<Response> {
    if (request.method === 'POST') {
        return await handleGenerateInsight(request, env, origin);
    }

    if (request.method === 'DELETE' && request.url.includes('/api/insights/cache')) {
        return await handleDeleteCache(request, env, origin);
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
}

async function handleGenerateInsight(request: Request, env: Env, origin: string): Promise<Response> {
    const body = await request.json() as {
        insightType: string;
        mostRecentActivityId: number;
        forceRefresh?: boolean;
        payload: Record<string, unknown>;
        athleteId?: string;
    };

    const { insightType, mostRecentActivityId, forceRefresh = false, payload, athleteId = 'default' } = body;

    if (!INSIGHT_PROMPTS[insightType]) {
        return new Response(JSON.stringify({ error: `Unknown insight type: ${insightType}` }), {
            status: 400,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }

    const cacheKey = `insight:${athleteId}:${insightType}:${mostRecentActivityId}`;

    // Check cache unless force refresh
    if (!forceRefresh) {
        const cached = await env.RUNVIZ_KV.get(cacheKey);
        if (cached) {
            return new Response(JSON.stringify({
                insight: cached,
                fromCache: true,
                insightType,
            }), {
                headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
            });
        }
    }

    // Generate insight using AI
    const userPrompt = INSIGHT_PROMPTS[insightType](payload);

    try {
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 120,
        });

        const insight = (response as any).response as string;

        // Store in cache (no TTL - relies on KV LRU)
        await env.RUNVIZ_KV.put(cacheKey, insight);

        return new Response(JSON.stringify({
            insight,
            fromCache: false,
            insightType,
        }), {
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('AI insight generation failed:', error);
        return new Response(JSON.stringify({ error: 'Failed to generate insight' }), {
            status: 500,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }
}

async function handleDeleteCache(request: Request, env: Env, origin: string): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
        return new Response(JSON.stringify({ error: 'Missing cache key' }), {
            status: 400,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }

    try {
        await env.RUNVIZ_KV.delete(key);
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Cache deletion failed:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete cache' }), {
            status: 500,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }
}

function corsHeaders(origin: string, env: Env): HeadersInit {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}
