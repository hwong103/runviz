import { useCallback, useEffect, useMemo, useState } from 'react';

import type { InsightType } from '@/components/ui/AIInsightCard';
import type { CoachPersona } from '@/hooks/useCoachPersona';

interface UseInsightOptions {
    insightType: InsightType;
    payload: object;
    mostRecentActivityId: number;
    enabled?: boolean;
    persona?: CoachPersona;
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
}

interface UseInsightReturn {
    insight: string | null;
    loading: boolean;
    error: Error | null;
    dismissed: boolean;
    refresh: () => Promise<void>;
    dismiss: () => void;
}

function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`);
        return `{${entries.join(',')}}`;
    }

    return JSON.stringify(value);
}

function hashString(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }

    return (hash >>> 0).toString(36);
}

export function useInsight({
    insightType,
    payload,
    mostRecentActivityId,
    enabled = true,
    persona = 'neutral',
    useMemory = false,
    activityContext,
    weekContext,
}: UseInsightOptions): UseInsightReturn {
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<Error | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const serializedPayload = stableSerialize({
        payload,
        persona,
        useMemory,
        activityContext,
        weekContext,
    });
    const requestPayloadJson = JSON.stringify({
        payload: payload as Record<string, unknown>,
        persona,
        useMemory,
        activityContext,
        weekContext,
    });
    const payloadHash = hashString(serializedPayload);
    const dismissKey = `dismissed:${insightType}:${mostRecentActivityId}:${payloadHash}`;
    const parsedPayload = useMemo(
        () => JSON.parse(requestPayloadJson) as {
            payload: Record<string, unknown>;
            persona: CoachPersona;
            useMemory: boolean;
            activityContext?: UseInsightOptions['activityContext'];
            weekContext?: UseInsightOptions['weekContext'];
        },
        [requestPayloadJson]
    );
    const requestBody = useMemo(() => JSON.stringify({
        insightType,
        mostRecentActivityId,
        payloadHash,
        payload: parsedPayload.payload,
        persona: parsedPayload.persona,
        useMemory: parsedPayload.useMemory,
        activityContext: parsedPayload.activityContext,
        weekContext: parsedPayload.weekContext,
    }), [insightType, mostRecentActivityId, payloadHash, parsedPayload]);

    const fetchInsight = useCallback(
        async (forceRefresh = false) => {
            if (!enabled) {
                setLoading(false);
                setDismissed(false);
                return;
            }

            // Check if dismissed
            const hasDismissedKey = localStorage.getItem(dismissKey);
            if (hasDismissedKey && !forceRefresh) {
                setDismissed(true);
                setLoading(false);
                return;
            }

            setDismissed(false);
            setLoading(true);
            setError(null);

            try {
                const response = await fetch('/api/insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: forceRefresh
                        ? JSON.stringify({
                            ...JSON.parse(requestBody),
                            forceRefresh: true,
                        })
                        : requestBody,
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch insight');
                }

                const data = await response.json() as {
                    insight: string;
                    fromCache: boolean;
                    insightType: InsightType;
                };

                setInsight(data.insight);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Unknown error'));
                setInsight(null);
            } finally {
                setLoading(false);
            }
        },
        [dismissKey, enabled, requestBody]
    );

    const refresh = useCallback(async () => {
        localStorage.removeItem(dismissKey);
        setDismissed(false);

        // Delete cache first
        try {
            const params = new URLSearchParams({
                insightType,
                mostRecentActivityId: String(mostRecentActivityId),
                payloadHash,
                persona,
            });
            await fetch(`/api/insights/cache?${params.toString()}`, {
                method: 'DELETE',
            });
        } catch {
            // Ignore cache deletion errors
        }

        await fetchInsight(true);
    }, [dismissKey, fetchInsight, insightType, mostRecentActivityId, payloadHash, persona]);

    const dismiss = useCallback(() => {
        localStorage.setItem(dismissKey, 'true');
        setDismissed(true);
        setInsight(null);
    }, [dismissKey]);

    useEffect(() => {
        fetchInsight();
    }, [fetchInsight]);

    return {
        insight,
        loading,
        error,
        dismissed,
        refresh,
        dismiss,
    };
}
