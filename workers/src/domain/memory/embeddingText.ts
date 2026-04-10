import type { ActivityRecord, WeekSummary } from './types';

export function formatPace(minutesPerKm: number): string {
    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm % 1) * 60);

    if (seconds === 60) {
        return `${minutes + 1}:00`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function activityToEmbeddingText(record: ActivityRecord): string {
    const parts: string[] = [
        `${record.distanceKm.toFixed(1)}km run`,
        record.runProfile !== 'unknown' ? `${record.runProfile} effort` : '',
        record.paceMinPerKm !== null ? `pace ${formatPace(record.paceMinPerKm)} per km` : '',
        record.avgHR ? `average heart rate ${record.avgHR} bpm` : '',
        record.elevationPerKm !== null && record.elevationPerKm > 5
            ? `${Math.round(record.elevationPerKm)} metres elevation per km`
            : 'flat course',
        `duration ${Math.round(record.movingTimeMins)} minutes`,
    ];

    return parts.filter(Boolean).join(', ');
}

export function weekToEmbeddingText(week: WeekSummary): string {
    const parts: string[] = [
        `${week.totalKm.toFixed(1)}km running week`,
        `${week.runCount} run${week.runCount !== 1 ? 's' : ''}`,
    ];

    if (week.totalKm >= 80) parts.push('very high volume');
    else if (week.totalKm >= 60) parts.push('high volume');
    else if (week.totalKm >= 40) parts.push('moderate volume');
    else if (week.totalKm >= 20) parts.push('low volume');
    else parts.push('very low volume');

    const qualityRuns = week.thresholdRuns + week.raceRuns + week.intervalRuns;
    if (qualityRuns >= 3) parts.push('high intensity mix');
    else if (qualityRuns === 2) parts.push('moderate intensity mix');
    else if (qualityRuns === 1) parts.push('one quality session');
    else parts.push('easy only week');

    if (week.avgPaceMinPerKm !== null) {
        parts.push(`average pace ${formatPace(week.avgPaceMinPerKm)} per km`);
    }

    if (week.avgHR) parts.push(`average heart rate ${week.avgHR} bpm`);

    if (week.loadRatio !== null) {
        if (week.loadRatio > 1.4) parts.push('high acute load ratio');
        else if (week.loadRatio > 1.1) parts.push('moderate acute load ratio');
        else parts.push('balanced load ratio');
    }

    return parts.join(', ');
}
