import type { Auth } from './auth';
import type { Env } from './index';
import {
    findSimilarActivities,
    findSimilarWeeks,
    formatSimilarActivitiesContext,
    formatSimilarWeeksContext,
} from './activityMemory';

const PERSONA_PROMPTS: Record<string, string> = {
    gentle: `You are Maya, a warm and encouraging running coach speaking directly to the athlete. Always use second person — "you", "your". Write in plain, reassuring English. Respond in exactly 3 sentences. No bullet points, headers, or markdown. Lead with something the data shows is working or understandable before addressing any concern. Frame risks as opportunities to take care of yourself rather than failures. Sentences 1 and 2 explain what is happening and why with empathy for the effort involved. Sentence 3 must give one gentle, specific action for the next few days that feels achievable. Avoid alarming language; if something needs addressing say so kindly. When discussing pace use min/km format like "5:30/km". Only reason about fields that are present in the data. If a metric is absent, treat it as unavailable rather than zero or evidence of decline. Never infer, assume, or fabricate information that is not explicitly present in the data — this includes injuries, illness, life circumstances, personal history, or motivations. If you find yourself about to write something that is not directly stated in the provided data fields, do not write it.`,
    neutral: `You are Jordan, a pragmatic, data-literate running coach speaking directly to the athlete. Always use second person — "you", "your". Write in plain English, avoid jargon, and give specific actionable coaching. Respond in exactly 3 sentences. No bullet points, headers, or markdown. Compare to the athlete's own historical baseline, not population averages. Be direct but not alarming. Sentences 1 and 2 explain what is happening and why based on the metrics. Sentence 3 states what to do next over the coming days with one concrete action and timeframe. Mention only the most important evidence, and do not invent numeric targets such as routine scores unless that exact target is in the data. When discussing pace use min/km format like "5:30/km". Only reason about fields that are present in the data. If a metric is absent, treat it as unavailable rather than zero or evidence of decline. Never infer, assume, or fabricate information that is not explicitly present in the data — this includes injuries, illness, life circumstances, personal history, or motivations. If you find yourself about to write something that is not directly stated in the provided data fields, do not write it.`,
    blunt: `You are Rex, a blunt and efficient running coach speaking directly to the athlete. Always use second person — "you", "your". No softening, no padding, no encouragement for its own sake. Respond in exactly 3 sentences. No bullet points, headers, or markdown. State what the data shows, why it matters, and what to do — nothing more. Skip qualifiers unless the data genuinely is ambiguous. Sentences 1 and 2 should state the situation in plain terms. Sentence 3 is one direct instruction; avoid repeating the analysis or adding extra explanation. When discussing pace use min/km format like "5:30/km". Only reason about fields that are present in the data. If a metric is absent, treat it as unavailable rather than zero or evidence of decline. Never infer, assume, or fabricate information that is not explicitly present in the data — this includes injuries, illness, life circumstances, personal history, or motivations. If you find yourself about to write something that is not directly stated in the provided data fields, do not write it.`,
    drill: `You are Sergeant Kowalski, a demanding drill-sergeant running coach speaking directly to the athlete. Always use second person — "you", "your". Hold the athlete to a high standard. Respond in exactly 3 sentences. No bullet points, headers, or markdown. Don't accept excuses from the data or the athlete. If the numbers are bad, say so. If the athlete needs to back off, frame it as a tactical order, not a comfort. Sentences 1 and 2 are a direct assessment of what the data shows. Sentence 3 is a non-negotiable instruction and should read like an order, not a summary; start with a command verb when possible. When discussing pace use min/km format like "5:30/km". Only reason about fields that are present in the data. If a metric is absent, treat it as unavailable rather than zero or evidence of decline. Never infer, assume, or fabricate information that is not explicitly present in the data — this includes injuries, illness, life circumstances, personal history, or motivations. If you find yourself about to write something that is not directly stated in the provided data fields, do not write it.`,
};

const OUTPUT_RULES = `Hard output rules:
- Return exactly 3 sentences and aim for 105-135 words total.
- No bullet points, headers, markdown, labels, or line breaks.
- If you use a number in the recommendation, it must already appear in the Data section verbatim. Do not invent target run counts, routine scores, durations, pace goals, percentages, distances, or thresholds.
- Prefer hold, steady, gradual rebuild, or modest consolidation guidance when the data is mixed.
- Do not default to telling the runner to cut back just because load ratio is elevated.
- If Training Phase is "rebuild" or "build", treat some load elevation as expected from a low or rising baseline and only recommend pulling back when multiple red flags agree.
- If Training Phase is "down-week", treat reduced volume as intentional consolidation unless the provided data clearly says otherwise.`;

const INSIGHT_PROMPT_VERSION = 'v8';

const PERSONA_NUDGES: Record<string, string> = {
    gentle: `Persona-specific guidance:
- Sound warm, calm, and human rather than analytical.
- Lead with one thing that is going right or understandable in the data.
- End with one concrete low-stress action that feels manageable over the next few days.
- Sentence 2 must contain a clear action verb such as keep, hold, ease, repeat, stay, or prioritize.
- Do not hedge so much that the advice becomes vague.`,
    neutral: `Persona-specific guidance:
- Prioritize a crisp explanation of what the key metric pattern means.
- End with one clear practical coaching adjustment and a short timeframe.
- Do not invent numeric goals such as target routine scores unless the exact number is supplied in the data.
- Keep the tone measured and useful rather than motivational.`,
    blunt: `Persona-specific guidance:
- Be concise and unsentimental, but still specific.
- Name the main issue plainly, then give one direct instruction.
- Do not soften the message with reassurance or filler.`,
    drill: `Persona-specific guidance:
- Sound demanding and commanding, not merely blunt.
- Frame the second sentence as an order or standard to meet.
- Sentence 2 should start with a command verb such as Hold, Keep, Stabilize, Stop, or Reduce.
- Use sharper language than blunt, but do not invent extra risk or exaggerate the data.
- Avoid generic phrasing like "maintain a steady approach."`,
};

const INSIGHT_TYPE_NUDGES: Record<string, string> = {
    overview: `Overview-specific guidance:
- If the block reflects a rebuild with only a moderate load rise, say that plainly and do not call it unstable by default.
- Do not invent routine-score targets, run-count goals, long-run durations, pace targets, or other made-up thresholds.
- Differentiate the personas through framing and phrasing, not by changing the core recommendation.
- Gentle should sound supportive with a small next step, neutral should sound coach-like and practical, blunt should be terse, and drill should sound like an order.`,
    'training-health': `Training-health-specific guidance:
- Explain the stress pattern clearly, then give one practical adjustment.
- Do not invent precise percentage cuts, exact rest prescriptions, run counts, or other made-up numeric targets.
- If rebuild context is present and the stress pattern is manageable, say so instead of defaulting to overload language.`,
    'injury-risk': `Injury-risk-specific guidance:
- Rebuild context should usually lead to stabilize-and-monitor language rather than alarm.
- Gentle should reassure without becoming vague.
- Neutral should explain the risk pattern and the short-term plan.
- Blunt should be short and matter-of-fact.
- Drill should sound commanding, with sentence 2 phrased as an order.
- Do not invent pace targets, percentage reductions, or new weekly-kilometer goals unless those exact numbers are already in the Data.`,
};

const INSIGHT_PROMPTS: Record<string, (payload: Record<string, unknown>) => string> = {
    overview: (payload) => `Analyse your current training block - specifically your load ratio, routine consistency, weekly change trend, aerobic efficiency, and training phase context. Explain what state the block is in, what is most likely driving that state, and what you should do over the next 7-10 days. If the block is unstable, guide the runner toward a steadier approach without sounding harsh. If Training Phase is "rebuild" or "build", do not treat a moderate rise from a low baseline as a problem by itself. Only recommend pulling back when at least two red flags agree, such as very high load ratio plus worsening efficiency, or a steep ramp plus poor routine. If the data is mixed, prefer hold-steady or gradual rebuild guidance over cutback advice. Do not just restate the numbers; interpret them into a plan.

${OUTPUT_RULES}

Data:
${formatPayload(payload)}`,

    'training-health': (payload) => `Analyse your training stress, monotony, strain, load ratio, and training phase context. Explain what they suggest about stress distribution, why that pattern is likely happening, and what change to make in the next 7 days. Give one concrete coaching instruction about recovery, intensity, or session spacing. Do not assume that higher stress automatically means overload: if Training Phase is "rebuild" or "build", acknowledge when the pattern can simply reflect a return to structure or a planned increase. Recommend a pullback only when stress markers stack up clearly rather than from one ratio alone. Avoid made-up precision like exact percentage cuts or recovery prescriptions unless the data directly supports them.

${OUTPUT_RULES}

Data:
${formatPayload(payload)}`,

    fitness: (payload) => `Analyse your fitness (CTL), fatigue (ATL), and training stress balance (TSB). Explain your current form state, why it looks that way, and what that means for training or racing in the next 3-10 days. Be explicit about whether you should push, maintain, absorb training, or freshen up, but do not default to freshen-up advice unless the fatigue markers clearly support it.

${OUTPUT_RULES}

Data:
${formatPayload(payload)}`,

    volume: (payload) => `Analyse your weekly volume trend over the supplied analysis window, including ramp rate and training phase context. Explain whether the current trajectory is sustainable, what is likely driving it relative to baseline, and what to do with volume over the next 1-2 weeks. Be explicit about whether to hold, cut back, or keep building, but treat a rebuild or early build as a valid reason for moderate week-to-week increases. If volume is down after a setback or interruption, frame a gradual rebuild as a valid option rather than a problem.

${OUTPUT_RULES}

Data:
${formatPayload(payload)}`,

    'injury-risk': (payload) => `Analyse the current risk pattern calmly and give a specific short-term plan to reduce risk. Base your entire response only on the fields provided. The "had extended training gap" field only indicates whether a 21+ day break appears in history; it does not indicate injury. Do not mention injury history, past injuries, illness, or any cause not directly supported by the numeric data. Do not speculate about why gaps occurred. If Training Phase is "rebuild" and recent training history is shallow, acknowledge that risk metrics can be inflated by a low baseline and prefer controlled progression advice over alarmist pullback language unless the ramp is extreme. When rebuild context is present, do not open by saying the runner has crossed a risk threshold. Prefer "hold steady and stabilize" over "cut back" when the risk appears to come from a shallow baseline rather than stacked warning signs.

${OUTPUT_RULES}

Data:
${formatPayload(payload)}`,

    'race-prediction': (payload) => `Analyse your VDOT trend, race time predictions, current readiness context, and training phase context. Explain what your race potential looks like right now, why it is likely moving that way, and what to do over the next 7-14 days to respond. If current fatigue or freshness suggests caution, say so clearly but gently, but avoid reflexively telling the runner to back off when they are clearly rebuilding or returning to structure.

${OUTPUT_RULES}

Data:
${formatPayload(payload)}`,

    'run-detail': (payload) => `Analyse this specific run in the context of your recent history. Explain what was notable about it, why it matters for your current fitness or fatigue, and how your next 1-2 runs should change because of it. If it was a breakthrough, say how to build on it; if it was a warning sign, say how to absorb it without sounding severe or discouraging.

${OUTPUT_RULES}

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

const PERSONA_FALLBACK_ACTIONS: Record<string, string> = {
    gentle: 'Keep the next few days steady and repeat the same routine so your rebuild can settle.',
    neutral: 'Hold your current routine steady for the next few days and reassess once the pattern settles.',
    blunt: 'Hold the current load steady for the next few days.',
    drill: 'Hold the current load steady and stop adding strain for the next few days.',
};

const GENERIC_MIDDLE_SENTENCE = 'That points to a block that is still settling and should be handled with a steady hand rather than a sharp change.';

const ACTION_VERB_PATTERN = /\b(hold|keep|ease|repeat|stay|prioritize|focus|maintain|stabilize|reduce|stop|reassess)\b/i;
const COMMAND_START_PATTERN = /^(Hold|Keep|Stabilize|Stop|Reduce|Maintain|Repeat|Ease|Back off|Stay)\b/i;

function normalizeSentence(sentence: string): string {
    const cleaned = sentence.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
        return '';
    }

    return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function splitIntoSentences(text: string): string[] {
    const singleLine = text.replace(/\s+/g, ' ').trim();
    if (!singleLine) {
        return [];
    }

    const sentences: string[] = [];
    let start = 0;

    for (let index = 0; index < singleLine.length; index += 1) {
        const current = singleLine[index];
        if (current !== '.' && current !== '!' && current !== '?') {
            continue;
        }

        const previous = index > 0 ? singleLine[index - 1] : '';
        let nextIndex = index + 1;
        while (nextIndex < singleLine.length && /\s/.test(singleLine[nextIndex])) {
            nextIndex += 1;
        }

        const next = nextIndex < singleLine.length ? singleLine[nextIndex] : '';
        const isDecimalMiddle = current === '.' && /\d/.test(previous) && /\d/.test(next);
        if (isDecimalMiddle) {
            continue;
        }

        const isBoundary = nextIndex >= singleLine.length || /["'([A-Z]/.test(next);
        if (!isBoundary) {
            continue;
        }

        const sentence = normalizeSentence(singleLine.slice(start, index + 1));
        if (sentence) {
            sentences.push(sentence);
        }
        start = nextIndex;
    }

    if (start < singleLine.length) {
        const trailing = normalizeSentence(singleLine.slice(start));
        if (trailing) {
            sentences.push(trailing);
        }
    }

    return sentences;
}

function extractNumericTokens(text: string): string[] {
    return text.match(/\b\d+:\d{2}\/km\b|\b\d+:\d{2}\b|\b\d+(?:\.\d+)?(?:km|%)?\b/g) ?? [];
}

function hasUnsupportedRecommendationNumbers(sentence: string, allowedTokens: Set<string>): boolean {
    return extractNumericTokens(sentence).some((token) => !allowedTokens.has(token));
}

function needsPersonaFallback(sentence: string, persona: string, allowedTokens: Set<string>): boolean {
    if (hasUnsupportedRecommendationNumbers(sentence, allowedTokens)) {
        return true;
    }

    if (persona === 'gentle') {
        return !ACTION_VERB_PATTERN.test(sentence);
    }

    if (persona === 'neutral') {
        return !ACTION_VERB_PATTERN.test(sentence);
    }

    if (persona === 'blunt') {
        return !COMMAND_START_PATTERN.test(sentence.trim());
    }

    if (persona === 'drill') {
        return !COMMAND_START_PATTERN.test(sentence.trim());
    }

    return false;
}

function trimToWordLimit(text: string, limit: number): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
        return text;
    }

    const trimmed = words.slice(0, limit).join(' ').replace(/[,:;]+$/, '').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function sanitizeInsightText(
    text: string,
    payload: Record<string, unknown>,
    persona: string,
): string {
    const allowedTokens = new Set(extractNumericTokens(formatPayload(payload)));
    const sentences = splitIntoSentences(text).slice(0, 3);
    const firstSentence = normalizeSentence(sentences[0] ?? 'Your current pattern looks mixed but manageable.');
    const secondCandidate = normalizeSentence(sentences[1] ?? '');
    const thirdCandidate = normalizeSentence(sentences[2] ?? '');

    const hasActionSecondSentence = secondCandidate && !needsPersonaFallback(secondCandidate, persona, allowedTokens);
    const secondSentence = hasActionSecondSentence
        ? GENERIC_MIDDLE_SENTENCE
        : (secondCandidate || GENERIC_MIDDLE_SENTENCE);
    const thirdSentence = thirdCandidate && !needsPersonaFallback(thirdCandidate, persona, allowedTokens)
        ? thirdCandidate
        : (hasActionSecondSentence ? secondCandidate : (PERSONA_FALLBACK_ACTIONS[persona] ?? PERSONA_FALLBACK_ACTIONS.neutral));

    return trimToWordLimit(
        `${firstSentence} ${normalizeSentence(secondSentence)} ${normalizeSentence(thirdSentence)}`,
        135,
    );
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
    const cacheKey = `insight:${userId}:${insightType}:${mostRecentActivityId}:${payloadHash}:${safePersona}:${INSIGHT_PROMPT_VERSION}`;

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
        PERSONA_NUDGES[safePersona] ?? PERSONA_NUDGES.neutral,
        INSIGHT_TYPE_NUDGES[insightType] ?? '',
        similarContext,
        weekHistoryContext,
    ].filter(Boolean).join('\n\n');

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
            ? `insight:${userId}:${insightType}:${mostRecentActivityId}:${payloadHash}:${safePersona}:${INSIGHT_PROMPT_VERSION}`
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
