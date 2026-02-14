/**
 * Training Load Calculator
 * 
 * Implements TRIMP (Training Impulse) and Fitness/Freshness (CTL/ATL/TSB) calculations.
 * Replicates Strava's paywalled training load feature.
 */

import type { TrainingLoadMetrics, Activity } from '../types';

function toLocalDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string): Date {
    const [yearStr, monthStr, dayStr] = dateKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    return new Date(year, month - 1, day);
}

/**
 * Constants for training load calculations
 */
const CTL_DECAY = 42; // Days for Chronic Training Load decay (fitness)
const ATL_DECAY = 7;  // Days for Acute Training Load decay (fatigue)

/**
 * Gender-based TRIMP coefficients
 * Based on Bannister's TRIMP formula
 */
const TRIMP_COEFFICIENTS = {
    male: { a: 0.64, b: 1.92 },
    female: { a: 0.86, b: 1.67 },
};

/**
 * Calculate TRIMP (Training Impulse) for an activity
 * Uses Bannister's TRIMP formula: D * HRr * 0.64 * e^(1.92 * HRr)
 * where HRr = (avgHR - restHR) / (maxHR - restHR)
 * 
 * @param durationMinutes - Activity duration in minutes
 * @param avgHR - Average heart rate during activity
 * @param maxHR - Athlete's max heart rate
 * @param restHR - Athlete's resting heart rate (default 60)
 * @param gender - 'male' or 'female' for coefficient selection
 */
export function calculateTRIMP(
    durationMinutes: number,
    avgHR: number,
    maxHR: number,
    restHR = 60,
    gender: 'male' | 'female' = 'male'
): number {
    if (avgHR <= restHR || maxHR <= restHR) return 0;

    const hrReserve = (avgHR - restHR) / (maxHR - restHR);
    const clampedHRr = Math.max(0, Math.min(1, hrReserve));

    const { a, b } = TRIMP_COEFFICIENTS[gender];
    const trimp = durationMinutes * clampedHRr * a * Math.exp(b * clampedHRr);

    return Math.round(trimp);
}

/**
 * Calculate TRIMP from an activity (without heart rate data)
 * Uses a simplified estimate based on duration and intensity
 * 
 * @param activity - Activity object
 * @param maxHR - Athlete's estimated max HR
 */
export function calculateActivityTRIMP(
    activity: Activity,
    maxHR: number,
    restHR = 60
): number {
    const durationMinutes = activity.moving_time / 60;

    // If we have heart rate data, use it
    if (activity.average_heartrate) {
        return calculateTRIMP(durationMinutes, activity.average_heartrate, maxHR, restHR);
    }

    // Fallback: Estimate TRIMP from duration and suffer score if available
    if (activity.suffer_score) {
        return activity.suffer_score;
    }

    // Last resort: Simple estimate based on duration
    // Assume moderate intensity (60% HRr)
    return calculateTRIMP(durationMinutes, restHR + (maxHR - restHR) * 0.6, maxHR, restHR);
}

/**
 * Exponential decay formula for CTL/ATL calculations
 */
function exponentialDecay(previousValue: number, newLoad: number, decayDays: number): number {
    const lambda = 1 / decayDays;
    return previousValue * Math.exp(-lambda) + newLoad * (1 - Math.exp(-lambda));
}

/**
 * Calculate training load metrics over time
 * 
 * @param dailyLoads - Map of date string (YYYY-MM-DD) to TRIMP value
 * @param startDate - Start date for calculations
 * @param endDate - End date for calculations
 * @returns Array of training load metrics for each day
 */
export function calculateTrainingLoadHistory(
    dailyLoads: Map<string, number>,
    startDate: Date,
    endDate: Date
): TrainingLoadMetrics[] {
    const metrics: TrainingLoadMetrics[] = [];
    let ctl = 0;
    let atl = 0;

    // Get all dates from the map to find the absolute start
    const allDates = Array.from(dailyLoads.keys()).sort();
    if (allDates.length === 0) return [];

    const firstActivityDate = fromDateKey(allDates[0]);
    const calculationStart = firstActivityDate < startDate ? firstActivityDate : startDate;

    const current = new Date(calculationStart);
    // Ensure we start at the beginning of the day for consistent comparison
    current.setHours(0, 0, 0, 0);
    const viewStart = new Date(startDate);
    viewStart.setHours(0, 0, 0, 0);
    const viewEnd = new Date(endDate);
    viewEnd.setHours(23, 59, 59, 999);

    while (current <= viewEnd) {
        const dateStr = toLocalDateKey(current);
        const trimp = dailyLoads.get(dateStr) || 0;

        // Update CTL (fitness) and ATL (fatigue) using exponential decay
        ctl = exponentialDecay(ctl, trimp, CTL_DECAY);
        atl = exponentialDecay(atl, trimp, ATL_DECAY);

        // TSB (Training Stress Balance / Form) = CTL - ATL
        const tsb = ctl - atl;

        // Only add to metrics if within the requested view window
        if (current >= viewStart) {
            metrics.push({
                date: dateStr,
                ctl: Math.round(ctl * 10) / 10,
                atl: Math.round(atl * 10) / 10,
                tsb: Math.round(tsb * 10) / 10,
                trimp,
            });
        }

        current.setDate(current.getDate() + 1);
    }

    return metrics;
}

/**
 * Process activities into daily TRIMP values
 */
export function activitiesToDailyLoads(
    activities: Activity[],
    maxHR: number,
    restHR = 60
): Map<string, number> {
    const dailyLoads = new Map<string, number>();

    for (const activity of activities) {
        // Only count runs
        const runTypes = ['Run', 'TrailRun', 'VirtualRun'];
        const isRun = runTypes.includes(activity.type) || runTypes.includes(activity.sport_type);
        if (!isRun) continue;

        const date = activity.start_date_local.split('T')[0];
        const trimp = calculateActivityTRIMP(activity, maxHR, restHR);

        // Sum multiple activities on same day
        const existing = dailyLoads.get(date) || 0;
        dailyLoads.set(date, existing + trimp);
    }

    return dailyLoads;
}

/**
 * Get fitness/freshness interpretation
 */
export function interpretTSB(tsb: number): {
    status: 'fresh' | 'neutral' | 'fatigued';
    description: string;
    color: string;
} {
    if (tsb > 15) {
        return { status: 'fresh', description: 'Well rested, ready for hard effort', color: '#22C55E' };
    } else if (tsb > 5) {
        return { status: 'fresh', description: 'Fresh, good for racing', color: '#84CC16' };
    } else if (tsb > -10) {
        return { status: 'neutral', description: 'Balanced training load', color: '#EAB308' };
    } else if (tsb > -25) {
        return { status: 'fatigued', description: 'Accumulated fatigue', color: '#F97316' };
    } else {
        return { status: 'fatigued', description: 'Overreaching, consider rest', color: '#EF4444' };
    }
}
