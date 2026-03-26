import type { Activity } from '../types';
import { isRun } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';

export function calcVDOT(distanceM: number, timeS: number): number {
    const t = timeS / 60;
    const v = distanceM / t;

    const pct =
        0.8 +
        0.1894393 * Math.exp(-0.012778 * t) +
        0.2989558 * Math.exp(-0.1932605 * t);

    const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;

    return vo2 / pct;
}

export function vVO2maxVelocity(vdot: number): number {
    let v = 300;

    for (let i = 0; i < 50; i++) {
        const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
        const f = vo2 - vdot;
        const df = 0.182258 + 0.000208 * v;
        v -= f / df;
    }

    return v;
}

export function calcTrainingZones(vdot: number): Record<string, [number, number]> {
    const vMax = vVO2maxVelocity(vdot);
    const toPace = (fraction: number) => 1000 / (vMax * fraction);

    return {
        E: [toPace(0.59), toPace(0.74)],
        M: [toPace(0.75), toPace(0.84)],
        T: [toPace(0.83), toPace(0.88)],
        I: [toPace(0.95), toPace(1.0)],
        R: [toPace(1.05), toPace(1.2)],
    };
}

const RACE_DISTANCES_M = [
    { label: '5K', meters: 5000 },
    { label: '10K', meters: 10000 },
    { label: 'HM', meters: 21097.5 },
    { label: 'Marathon', meters: 42195 },
];

export interface VDOTResult {
    vdot: number;
    sourceLabel: string;
    trainingZones: Record<string, [number, number]>;
    racePredictions: { label: string; timeS: number; meters: number }[];
}

export function calcVDOTFromActivities(activities: Activity[]): VDOTResult | null {
    const runs = activities.filter(isRun);

    // Only consider efforts from the last 90 days so stale PRs don't inflate VDOT.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const recentRuns = runs.filter(a => parseActivityLocalDate(a.start_date_local) >= cutoff);

    // Fall back to all-time if there are no qualifying recent efforts at all.
    const pool = recentRuns.length > 0 ? recentRuns : runs;

    let bestVDOT = 0;
    let bestResult: VDOTResult | null = null;

    for (const target of RACE_DISTANCES_M) {
        const tolerance = target.meters * 0.1;
        const candidates = pool.filter((activity) => Math.abs(activity.distance - target.meters) <= tolerance);
        if (candidates.length === 0) continue;

        const best = candidates.reduce((fastest, candidate) =>
            candidate.moving_time < fastest.moving_time ? candidate : fastest
        );

        const vdot = calcVDOT(best.distance, best.moving_time);
        if (vdot <= bestVDOT) continue;

        bestVDOT = vdot;
        const date = parseActivityLocalDate(best.start_date_local);
        const dateStr = date.toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
        const timeStr = formatSeconds(best.moving_time);
        const vMax = vVO2maxVelocity(vdot);

        bestResult = {
            vdot,
            sourceLabel: `${target.label} – ${timeStr} on ${dateStr}${pool === runs ? ' (all-time)' : ''}`,
            trainingZones: calcTrainingZones(vdot),
            racePredictions: RACE_DISTANCES_M.map((distance) => ({
                label: distance.label,
                meters: distance.meters,
                timeS: (distance.meters / vMax) * 60,
            })),
        };
    }

    return bestResult;
}

function formatSeconds(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);

    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}
