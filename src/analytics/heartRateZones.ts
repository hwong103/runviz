/**
 * Heart Rate Zone Analysis
 * 
 * Provides heart rate zone classification and time-in-zone calculations.
 * Replicates Strava's paywalled heart rate analysis feature.
 */

import type { HeartRateZone, HeartRateZoneAnalysis } from '../types';

/**
 * Default 5-zone model based on percentage of max heart rate
 * Zone 1: Recovery (50-60%)
 * Zone 2: Aerobic (60-70%)
 * Zone 3: Tempo (70-80%)
 * Zone 4: Threshold (80-90%)
 * Zone 5: Anaerobic (90-100%)
 */
export const DEFAULT_ZONES: Array<{ name: string; minPct: number; maxPct: number; color: string }> = [
    { name: 'Zone 1 - Recovery', minPct: 0.50, maxPct: 0.60, color: '#94A3B8' },
    { name: 'Zone 2 - Aerobic', minPct: 0.60, maxPct: 0.70, color: '#22C55E' },
    { name: 'Zone 3 - Tempo', minPct: 0.70, maxPct: 0.80, color: '#EAB308' },
    { name: 'Zone 4 - Threshold', minPct: 0.80, maxPct: 0.90, color: '#F97316' },
    { name: 'Zone 5 - Anaerobic', minPct: 0.90, maxPct: 1.00, color: '#EF4444' },
];

/**
 * Estimate max heart rate using Tanaka formula (more accurate than 220-age)
 * MaxHR = 208 - 0.7 * age
 */
export function estimateMaxHR(age: number): number {
    return Math.round(208 - 0.7 * age);
}

/**
 * Build heart rate zones from max HR
 */
export function buildZones(maxHR: number, customZones = DEFAULT_ZONES): HeartRateZone[] {
    return customZones.map((zone) => ({
        name: zone.name,
        min: Math.round(maxHR * zone.minPct),
        max: Math.round(maxHR * zone.maxPct),
        color: zone.color,
    }));
}

/**
 * Determine which zone a heart rate falls into
 * @returns Zone index (0-4) or -1 if below Zone 1
 */
export function getZoneIndex(heartRate: number, zones: HeartRateZone[]): number {
    for (let i = 0; i < zones.length; i++) {
        if (heartRate >= zones[i].min && heartRate < zones[i].max) {
            return i;
        }
    }
    // If above max zone, count as Zone 5
    if (heartRate >= zones[zones.length - 1].max) {
        return zones.length - 1;
    }
    return -1; // Below Zone 1
}

/**
 * Analyze heart rate data for an activity
 * @param heartRates - Array of heart rate values (1 per second assumed)
 * @param maxHR - Athlete's max heart rate
 * @param customZones - Optional custom zone definitions
 */
export function analyzeHeartRateZones(
    heartRates: number[],
    maxHR: number,
    customZones = DEFAULT_ZONES
): HeartRateZoneAnalysis {
    const zones = buildZones(maxHR, customZones);
    const timeInZones: number[] = new Array(zones.length).fill(0);

    for (const hr of heartRates) {
        const zoneIndex = getZoneIndex(hr, zones);
        if (zoneIndex >= 0) {
            timeInZones[zoneIndex]++;
        }
    }

    const totalTime = timeInZones.reduce((sum, t) => sum + t, 0);
    const percentageInZones = timeInZones.map((t) =>
        totalTime > 0 ? (t / totalTime) * 100 : 0
    );

    return {
        zones,
        timeInZones,
        percentageInZones,
    };
}

/**
 * Calculate average heart rate
 */
export function calculateAverageHR(heartRates: number[]): number {
    if (heartRates.length === 0) return 0;
    const sum = heartRates.reduce((a, b) => a + b, 0);
    return Math.round(sum / heartRates.length);
}

/**
 * Format time in seconds to HH:MM:SS or MM:SS
 */
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
