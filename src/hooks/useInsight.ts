import { useCallback, useEffect, useState } from 'react';

import type { InsightType } from '@/components/ui/AIInsightCard';

interface UseInsightOptions {
    insightType: InsightType;
    payload: Record<string, unknown>;
    mostRecentActivityId: number;
    enabled?: boolean;
}

interface UseInsightReturn {
    insight: string | null;
    loading: boolean;
    error: Error | null;
    dismissed: boolean;
    refresh: () => Promise<void>;
    dismiss: () => void;
}

export function useInsight({
    insightType,
    payload,
    mostRecentActivityId,
    enabled = true,
}: UseInsightOptions): UseInsightReturn {
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<Error | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const cacheKey = `insight:default:${insightType}:${mostRecentActivityId}`;
    const dismissKey = `dismissed:${cacheKey}`;

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
                    body: JSON.stringify({
                        insightType,
                        mostRecentActivityId,
                        forceRefresh,
                        payload,
                    }),
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
        [dismissKey, enabled, insightType, mostRecentActivityId, payload]
    );

    const refresh = useCallback(async () => {
        localStorage.removeItem(dismissKey);
        setDismissed(false);

        // Delete cache first
        try {
            await fetch(`/api/insights/cache?key=${encodeURIComponent(cacheKey)}`, {
                method: 'DELETE',
            });
        } catch {
            // Ignore cache deletion errors
        }

        await fetchInsight(true);
    }, [cacheKey, fetchInsight]);

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
