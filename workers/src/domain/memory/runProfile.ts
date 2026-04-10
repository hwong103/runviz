import type { ActivityRecord, RunProfile } from './types';

export function classifyRunProfile(
    activity: ActivityRecord,
    medianPaceSecPerM: number,
): RunProfile {
    const hasValidMedianPace = Number.isFinite(medianPaceSecPerM) && medianPaceSecPerM > 0;
    const activityPaceSecPerM = activity.paceMinPerKm !== null
        ? (activity.paceMinPerKm * 60) / 1000
        : null;

    if (!hasValidMedianPace || !activityPaceSecPerM || activityPaceSecPerM <= 0) {
        return 'unknown';
    }

    const paceRatio = medianPaceSecPerM / activityPaceSecPerM;

    if (!activity.avgHR || !activity.maxHR) {
        if (paceRatio > 1.08) return 'race';
        if (paceRatio > 1.02) return 'threshold';
        if (paceRatio > 0.95) return 'steady';
        return 'easy';
    }

    const hrRatio = activity.maxHR / activity.avgHR;

    if (hrRatio > 1.18) return 'interval';
    if (paceRatio > 1.08 && hrRatio < 1.08) return 'race';
    if (paceRatio > 1.02 && hrRatio < 1.12) return 'threshold';
    if (paceRatio > 0.95) return 'steady';
    return 'easy';
}
