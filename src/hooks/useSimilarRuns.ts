import { useEffect, useState } from 'react';
import { memory as memoryApi, type SimilarRunResult } from '../services/api';

interface UseSimilarRunsOptions {
    activityId: number;
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: string;
    enabled?: boolean;
}

export function useSimilarRuns({
    activityId,
    distanceKm,
    paceMinPerKm,
    avgHR,
    elevationPerKm,
    movingTimeMins,
    runProfile,
    enabled = true,
}: UseSimilarRunsOptions) {
    const [similar, setSimilar] = useState<SimilarRunResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMemory, setHasMemory] = useState(false);

    useEffect(() => {
        if (!enabled || !activityId) return;

        let cancelled = false;

        const loadSimilarRuns = async () => {
            setLoading(true);

            try {
                const results = await memoryApi.similarRuns(
                    { distanceKm, paceMinPerKm, avgHR, elevationPerKm, movingTimeMins, runProfile },
                    activityId,
                );

                if (cancelled) return;
                setSimilar(results);
                setHasMemory(results.length > 0);
            } catch {
                if (cancelled) return;
                setSimilar([]);
                setHasMemory(false);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSimilarRuns();

        return () => {
            cancelled = true;
        };
    }, [activityId, avgHR, distanceKm, elevationPerKm, enabled, movingTimeMins, paceMinPerKm, runProfile]);

    return { similar, loading, hasMemory };
}
