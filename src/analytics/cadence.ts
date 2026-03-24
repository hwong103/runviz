import type { Activity } from '../types';
import { isRun } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';

export interface CadencePoint {
    dateLabel: string;
    date: Date;
    spm: number;
}

export function extractCadenceHistory(activities: Activity[]): CadencePoint[] {
    return activities
        .filter((activity) => isRun(activity) && (activity.average_cadence ?? 0) > 0)
        .map((activity) => {
            const date = parseActivityLocalDate(activity.start_date_local);

            return {
                dateLabel: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
                date,
                spm: Math.round((activity.average_cadence ?? 0) * 2),
            };
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}
