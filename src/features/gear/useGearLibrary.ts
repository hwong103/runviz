import { useEffect, useMemo, useRef, useState } from 'react';

import { gear as gearApi } from '@/services/api/gearApi';
import {
    GEAR_FAILURE_RETRY_MS,
    loadGearCache,
    saveGearCache,
} from '@/services/cache';
import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';

const MAX_GEAR_FETCH_PER_SESSION = 10;

interface UseGearLibraryOptions {
    athleteId?: number;
    athleteShoes?: Gear[];
    athleteGear?: Gear[];
    activities: Activity[];
}

export function useGearLibrary({
    athleteId,
    athleteShoes,
    athleteGear,
    activities,
}: UseGearLibraryOptions) {
    const [fetchedGearState, setFetchedGearState] = useState<{
        athleteId?: number;
        gear: Map<string, Gear>;
    }>({
        athleteId: undefined,
        gear: new Map(),
    });
    const inFlightGearIds = useRef<Set<string>>(new Set());
    const failedGearIds = useRef<Map<string, number>>(new Map());
    const gearFetchCount = useRef(0);
    const cachedGearState = useMemo(
        () => (athleteId ? loadGearCache(athleteId) : null),
        [athleteId]
    );

    useEffect(() => {
        inFlightGearIds.current.clear();
        failedGearIds.current.clear();
        gearFetchCount.current = 0;

        failedGearIds.current = cachedGearState?.failed ?? new Map();
    }, [cachedGearState, athleteId]);

    const additionalGear = useMemo(() => {
        const mergedGear = new Map(cachedGearState?.gear ?? []);

        if (fetchedGearState.athleteId !== athleteId) {
            return mergedGear;
        }

        fetchedGearState.gear.forEach((gear, id) => {
            mergedGear.set(id, gear);
        });

        return mergedGear;
    }, [athleteId, cachedGearState, fetchedGearState]);

    useEffect(() => {
        if (activities.length === 0 || !athleteId) return;

        const knownIds = new Set([
            ...(athleteShoes || []).map((shoe) => shoe.id),
            ...(athleteGear || []).map((gear) => gear.id),
            ...Array.from(additionalGear.keys()),
        ]);

        const missingIds = new Set<string>();
        activities.forEach((activity) => {
            const failedAt = activity.gear_id
                ? failedGearIds.current.get(activity.gear_id)
                : undefined;
            const isFailureCoolingDown = failedAt
                ? Date.now() - failedAt < GEAR_FAILURE_RETRY_MS
                : false;

            if (
                activity.gear_id &&
                !knownIds.has(activity.gear_id) &&
                !isFailureCoolingDown &&
                !inFlightGearIds.current.has(activity.gear_id) &&
                (activity.gear_id.startsWith('g') || activity.gear_id.startsWith('b'))
            ) {
                missingIds.add(activity.gear_id);
            }
        });

        if (missingIds.size === 0) return;

        const remainingBudget = MAX_GEAR_FETCH_PER_SESSION - gearFetchCount.current;
        if (remainingBudget <= 0) return;

        const idsToFetch = Array.from(missingIds).slice(0, Math.min(5, remainingBudget));
        if (idsToFetch.length === 0) return;

        gearFetchCount.current += idsToFetch.length;
        idsToFetch.forEach((id) => inFlightGearIds.current.add(id));

        Promise.all(
            idsToFetch.map((id) =>
                gearApi
                    .get(id)
                    .then((gear) => ({ id, gear, success: true as const }))
                    .catch(() => ({ id, gear: null, success: false as const }))
            )
        ).then((results) => {
            setFetchedGearState((previous) => {
                const next = new Map(
                    previous.athleteId === athleteId ? previous.gear : []
                );

                results.forEach((result) => {
                    inFlightGearIds.current.delete(result.id);
                    if (result.success && result.gear) {
                        next.set(result.id, result.gear);
                        failedGearIds.current.delete(result.id);
                        return;
                    }

                    failedGearIds.current.set(result.id, Date.now());
                });

                const cachedGear = new Map(cachedGearState?.gear ?? []);
                next.forEach((gear, id) => {
                    cachedGear.set(id, gear);
                });

                saveGearCache(athleteId, cachedGear, failedGearIds.current);
                return {
                    athleteId,
                    gear: next,
                };
            });
        });
    }, [activities, additionalGear, athleteGear, athleteId, athleteShoes, cachedGearState]);

    const allShoes = useMemo(() => {
        const profileShoes = [...(athleteShoes || []), ...(athleteGear || [])];
        const extraShoes = Array.from(additionalGear.values());
        const knownIds = new Set(profileShoes.map((shoe) => shoe.id));

        return [...profileShoes, ...extraShoes.filter((shoe) => !knownIds.has(shoe.id))];
    }, [additionalGear, athleteGear, athleteShoes]);

    return { allShoes };
}
