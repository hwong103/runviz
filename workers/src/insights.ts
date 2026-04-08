import type { Auth } from './auth';
import type { Env } from './index';
import {
    findSimilarActivities,
    findSimilarWeeks,
    formatSimilarActivitiesContext,
    formatSimilarWeeksContext,
} from './activityMemory';

const PERSONA_PROMPTS: Record<string, string> = {
    gentle: `You are Maya, a warm and encouraging running coach speaking directly to the athlete. Always use second person — "you", "your". Write in plain, reassuring English. Respond in exactly 2 sentences, under 85 words. No bullet points, headers, or markdown. Lead with something the data shows is working or understandable before addressing any concern. Frame risks as opportunities to take care of yourself rather than failures. Sentence 1 explains what is happening with empathy for the effort involved. Sentence 2 gives a gentle, specific action for the next few days that feels achievable. Avoid alarming language; if something needs addressing say so kindly. When discussing pace use min/km format like "5:30/km". Only reason about fields present in the data.`,
    neutral: `You are Jordan, a pragmatic, data-literate running coach speaking directly to the athlete. Always use second person — "you", "your". Write in plain English, avoid jargon, and give specific actionable coaching. Respond in exactly 2 sentences, under 85 words. No bullet points, headers, or markdown. Compare to the athlete's own historical baseline, not population averages. Be direct but not alarming. Sentence 1 explains what is happening and why based on the metrics. Sentence 2 states what to do next over the coming days with a concrete action and timeframe. Mention only the most important evidence. When discussing pace use min/km format like "5:30/km". Only reason about fields present in the data.`,
    blunt: `You are Rex, a blunt and efficient running coach speaking directly to the athlete. Always use second person — "you", "your". No softening, no padding, no encouragement for its own sake. Respond in exactly 2 sentences, under 85 words. No bullet points, headers, or markdown. State what the data shows, why it matters, and what to do — nothing more. Skip qualifiers unless the data genuinely is ambiguous. Sentence 1 is the situation in plain terms. Sentence 2 is the instruction. When discussing pace use min/km format like "5:30/km". Only reason about fields present in the data.`,
    drill: `You are Sergeant Kowalski, a demanding drill-sergeant running coach speaking directly to the athlete. Always use second person — "you", "your". Hold the athlete to a high standard. Respond in exactly 2 sentences, under 85 words. No bullet points, headers, or markdown. Don't accept excuses from the data or the athlete. If the numbers are bad, say so. If the athlete needs to back off, frame it as a tactical order, not a comfort. Sentence 1 is a direct assessment of what the data shows. Sentence 2 is a non-negotiable instruction. When discussing pace use min/km format like "5:30/km". Only reason about fields present in the data.`,
};

const INSIGHT_PROMPTS: Record<string, (payload: Record<string, unknown>) => string> = {
    overview: (payload) => `Analyse your current training block - specifically your load ratio, routine consistency, weekly change trend, and aerobic efficiency. Explain what state the block is in, what is most likely driving that state, and what you should do over the next 7-10 days. If the block is unstable, guide the runner toward a steadier approach without sounding harsh. Do not just restate the numbers; interpret them into a plan.

Data:
${formatPayload(payload)}`,

    'training-health': (payload) => `Analyse your training stress, monotony, and strain metrics. Explain what they suggest about stress distribution, why that pattern is likely happening, and what change to make in the next 7 days. Give one concrete coaching instruction about recovery, intensity, or session spacing, using a supportive tone that leaves room for recovery from illness or fatigue when relevant.

Data:
${formatPayload(payload)}`,

    fitness: (payload) => `Analyse your fitness (CTL), fatigue (ATL), and training stress balance (TSB). Explain your current form state, why it looks that way, and what that means for training or racing in the next 3-10 days. Be explicit about whether you should push, maintain, absorb training, or freshen up, but phrase any pullback as a sensible reset rather than a reprimand.

Data:
${formatPayload(payload)}`,

    volume: (payload) => `Analyse your weekly volume trend over the supplied analysis window, including ramp rate. Explain whether the current trajectory is sustainable, what is likely driving it relative to baseline, and what to do with volume over the next 1-2 weeks. Be explicit about whether to hold, cut back, or keep building, and if volume is down after a setback or illness, frame a gradual rebuild as a valid option.

Data:
${formatPayload(payload)}`,

    'injury-risk': (payload) => `Your load metrics have crossed a risk threshold. Give a calm, supportive coaching read on the risk pattern, what is most likely causing it, and a specific short-term plan to reduce risk. Avoid alarmist language and frame the next step as protecting momentum, not as punishment. Include a timeframe or condition for returning to normal training.

Data:
${formatPayload(payload)}`,

    'race-prediction': (payload) => `Analyse your VDOT trend, race time predictions, and current readiness context. Explain what your race potential looks like right now, why it is likely moving that way, and what to do over the next 7-14 days to respond. If current fatigue or freshness suggests caution, say so clearly but gently, and adjust the near-term goal accordingly.

Data:
${formatPayload(payload)}`,

    'run-detail': (payload) => `Analyse this specific run in the context of your recent history. Explain what was notable about it, why it matters for your current fitness or fatigue, and how your next 1-2 runs should change because of it. If it was a breakthrough, say how to build on it; if it was a warning sign, say how to absorb it without sounding severe or discouraging.

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
        persona?: string;
        useMemory?: boolean;
        activityContext?: {
            distanceKm: number;
            paceMinPerKm: number | null;
            avgHR: number | null;
            elevationPerKm: number | null;
            movingTimeMins: number;
            runProfile: string;
        };
        weekContext?: {
            totalKm: number;
            runCount: number;
            avgPaceMinPerKm: number | null;
            avgHR: number | null;
            easyRuns: number;
            thresholdRuns: number;
            raceRuns: number;
            loadRatio: number | null;
            currentWeekKey?: string;
        };
    };

    const {
        insightType,
        mostRecentActivityId,
        payloadHash = 'default',
        forceRefresh = false,
        payload,
        persona = 'neutral',
        useMemory = false,
        activityContext,
        weekContext,
    } = body;

    if (!INSIGHT_PROMPTS[insightType]) {
        return new Response(JSON.stringify({ error: `Unknown insight type: ${insightType}` }), {
            status: 400,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
    }

    const safePersona = ['gentle', 'neutral', 'blunt', 'drill'].includes(persona) ? persona : 'neutral';
    const cacheKey = `insight:${userId}:${insightType}:${mostRecentActivityId}:${payloadHash}:${safePersona}`;

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
    if (useMemory && (insightType === 'overview' || insightType === 'training-health') && weekContext) {
        const qualityRuns = weekContext.thresholdRuns + weekContext.raceRuns;
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
        if (weekContext.loadRatio !== null) {
            queryParts.push(
                weekContext.loadRatio > 1.4
                    ? 'high load ratio'
                    : weekContext.loadRatio > 1.1
                        ? 'moderate load ratio'
                        : 'balanced load ratio'
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

    const userPrompt = [
        INSIGHT_PROMPTS[insightType](payload),
        similarContext,
        weekHistoryContext,
    ].filter(Boolean).join('\n\n');

    try {
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
            messages: [
                { role: 'system', content: PERSONA_PROMPTS[safePersona] ?? PERSONA_PROMPTS.neutral },
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
    const persona = url.searchParams.get('persona') ?? 'neutral';
    const safePersona = ['gentle', 'neutral', 'blunt', 'drill'].includes(persona) ? persona : 'neutral';
    const resolvedKey = key ?? (
        insightType && mostRecentActivityId
            ? `insight:${userId}:${insightType}:${mostRecentActivityId}:${payloadHash}:${safePersona}`
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
