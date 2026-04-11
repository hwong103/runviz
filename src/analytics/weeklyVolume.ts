import { format, startOfISOWeek } from 'date-fns';
import type { Activity } from '../types/activity';
import { isRun } from '../types/activity';
import { parseActivityLocalDate } from '../utils/activityDate';

export interface WeekBucket {
    weekLabel: string;
    weekStart: Date;
    totalKm: number;
    rampPct: number | null;
    isWarning: boolean;
}

export function computeWeeklyVolume(activities: Activity[], numWeeks = 16): WeekBucket[] {
    const runs = activities.filter(isRun);
    const now = new Date();

    const buckets: WeekBucket[] = [];
    for (let i = numWeeks - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 7);
        const weekStart = startOfISOWeek(date);

        buckets.push({
            weekLabel: format(weekStart, 'd MMM'),
            weekStart,
            totalKm: 0,
            rampPct: null,
            isWarning: false,
        });
    }

    for (const run of runs) {
        const date = parseActivityLocalDate(run.start_date_local);
        const weekStart = startOfISOWeek(date);
        const bucket = buckets.find((entry) => entry.weekStart.getTime() === weekStart.getTime());
        if (bucket) {
            bucket.totalKm += run.distance / 1000;
        }
    }

    for (let i = 1; i < buckets.length; i++) {
        const prev = buckets[i - 1].totalKm;
        const curr = buckets[i].totalKm;
        if (prev > 0) {
            const ramp = ((curr - prev) / prev) * 100;
            buckets[i].rampPct = ramp;
            buckets[i].isWarning = ramp > 10;
        }
    }

    return buckets;
}
