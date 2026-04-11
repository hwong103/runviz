import { formatPayload } from './formatters';

const PERSONA_FALLBACK_ACTIONS: Record<string, string> = {
    gentle: 'Keep the next few days steady and repeat the same routine so your rebuild can settle.',
    neutral: 'Hold your current routine steady for the next few days and reassess once the pattern settles.',
    blunt: 'Hold the current load steady for the next few days.',
    drill: 'Hold the line, keep the current load steady, and stop piling on extra strain for the next few days.',
};

const GENERIC_MIDDLE_SENTENCE = 'That points to a block that is still settling and should be handled with a steady hand rather than a sharp change.';

const ACTION_VERB_PATTERN = /\b(hold|keep|ease|repeat|stay|prioritize|focus|maintain|stabilize|reduce|stop|reassess)\b/i;
const COMMAND_START_PATTERN = /^(Hold|Keep|Stabilize|Stop|Reduce|Maintain|Repeat|Ease|Back off|Stay)\b/i;
const WINDOW_COMPARISON_PATTERNS = [
    /\b(\d+)\s+out of\s+(?:the\s+)?last\s+(\d+)\s+(weeks?|days?|runs?)\b/gi,
    /\b(\d+)\s+of\s+(?:the\s+)?last\s+(\d+)\s+(weeks?|days?|runs?)\b/gi,
];

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

function hasImpossibleWindowComparison(sentence: string): boolean {
    return WINDOW_COMPARISON_PATTERNS.some((pattern) => {
        pattern.lastIndex = 0;
        let match = pattern.exec(sentence);
        while (match) {
            const numerator = Number.parseInt(match[1] ?? '', 10);
            const denominator = Number.parseInt(match[2] ?? '', 10);
            if (Number.isFinite(numerator) && Number.isFinite(denominator) && numerator > denominator) {
                return true;
            }
            match = pattern.exec(sentence);
        }
        return false;
    });
}

function isDataSafeSentence(sentence: string, allowedTokens: Set<string>): boolean {
    return !hasUnsupportedRecommendationNumbers(sentence, allowedTokens)
        && !hasImpossibleWindowComparison(sentence);
}

function buildFirstSentenceFallback(payload: Record<string, unknown>): string {
    const activeWeeksLast6 = typeof payload.activeWeeksLast6 === 'number' ? payload.activeWeeksLast6 : null;
    const longestGapDaysLast42 = typeof payload.longestGapDaysLast42 === 'number' ? payload.longestGapDaysLast42 : null;
    const trainingPhase = typeof payload.trainingPhase === 'string' ? payload.trainingPhase : null;

    if (activeWeeksLast6 !== null && longestGapDaysLast42 !== null) {
        const gapUnit = longestGapDaysLast42 === 1 ? 'day' : 'days';
        return normalizeSentence(
            `You have stayed active across ${activeWeeksLast6} recent weeks, and your longest recent gap has been ${longestGapDaysLast42} ${gapUnit}.`,
        );
    }

    if (trainingPhase) {
        return normalizeSentence(`Your current training block looks like a ${trainingPhase} phase right now.`);
    }

    return 'Your current pattern looks mixed but manageable.';
}

function needsPersonaFallback(sentence: string, persona: string, allowedTokens: Set<string>): boolean {
    if (!isDataSafeSentence(sentence, allowedTokens)) {
        return true;
    }

    if (persona === 'gentle' || persona === 'neutral') {
        return !ACTION_VERB_PATTERN.test(sentence);
    }

    if (persona === 'blunt' || persona === 'drill') {
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

export function sanitizeInsightText(
    text: string,
    payload: Record<string, unknown>,
    persona: string,
): string {
    const allowedTokens = new Set(extractNumericTokens(formatPayload(payload)));
    const sentences = splitIntoSentences(text).slice(0, 3);
    const firstCandidate = normalizeSentence(sentences[0] ?? '');
    const firstSentence = firstCandidate && isDataSafeSentence(firstCandidate, allowedTokens)
        ? firstCandidate
        : buildFirstSentenceFallback(payload);
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
