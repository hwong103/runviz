import type { Gear } from '@/types/gear';

const GEAR_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const GEAR_FAILURE_RETRY_MS = 1000 * 60 * 60 * 12;

interface GearCachePayload {
    updatedAt: number;
    gear: Record<string, Gear>;
    failed: Record<string, number>;
}

export interface GearCacheState {
    gear: Map<string, Gear>;
    failed: Map<string, number>;
}

function gearCacheKey(athleteId: number): string {
    return `runviz_gear_cache_v1_${athleteId}`;
}

export function loadGearCache(athleteId: number): GearCacheState | null {
    try {
        const raw = localStorage.getItem(gearCacheKey(athleteId));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as GearCachePayload;
        if (!parsed.updatedAt || Date.now() - parsed.updatedAt > GEAR_CACHE_TTL_MS) {
            localStorage.removeItem(gearCacheKey(athleteId));
            return null;
        }

        return {
            gear: new Map(Object.entries(parsed.gear)),
            failed: new Map(
                Object.entries(parsed.failed).map(([id, timestamp]) => [id, Number(timestamp)])
            ),
        };
    } catch {
        return null;
    }
}

export function saveGearCache(
    athleteId: number,
    gearMap: Map<string, Gear>,
    failedMap: Map<string, number>
): void {
    try {
        const gear: Record<string, Gear> = {};
        gearMap.forEach((value, key) => {
            gear[key] = value;
        });

        const failed: Record<string, number> = {};
        failedMap.forEach((value, key) => {
            if (Date.now() - value < GEAR_FAILURE_RETRY_MS) {
                failed[key] = value;
            }
        });

        const payload: GearCachePayload = {
            updatedAt: Date.now(),
            gear,
            failed,
        };

        localStorage.setItem(gearCacheKey(athleteId), JSON.stringify(payload));
    } catch {
        // Ignore cache write failures.
    }
}
