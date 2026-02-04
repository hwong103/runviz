import { useMemo } from 'react';
import type { Activity } from '../types';
import { isRun } from '../types';
import {
    activitiesToDailyLoads,
    calculateTrainingLoadHistory,
} from '../analytics/trainingLoad';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, startOfDay, subMonths } from 'date-fns';

interface RaceTimePredictionsProps {
    activities: Activity[];
    period: {
        mode: 'all' | 'year' | 'month';
        year: number;
        month: number | null;
    };
    maxHR?: number;
    restHR?: number;
}

// Race distances in meters
const RACE_DISTANCES = [
    { name: '5K', meters: 5000 },
    { name: '10K', meters: 10000 },
    { name: 'Half Marathon', meters: 21097.5 },
];

// Riegel formula: T2 = T1 * (D2/D1)^1.06
// Used to predict race times from a known time over a different distance
function riegelFormula(knownTime: number, knownDistance: number, targetDistance: number): number {
    return knownTime * Math.pow(targetDistance / knownDistance, 1.06);
}

// Format seconds to time string (HH:MM:SS or MM:SS)
function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format pace to min:sec per km
function formatPace(metersPerSecond: number): string {
    if (!metersPerSecond || metersPerSecond <= 0) return '--:--';
    const paceMinKm = (1 / metersPerSecond) * 1000 / 60;
    const mins = Math.floor(paceMinKm);
    const secs = Math.round((paceMinKm - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function RaceTimePredictions({
    activities,
    period,
    maxHR = 185,
    restHR = 60
}: RaceTimePredictionsProps) {
    const predictions = useMemo(() => {
        const runs = activities.filter(isRun);
        if (runs.length === 0) return null;

        // Get date range for current and previous period
        let currentStart: Date;
        let currentEnd: Date;
        let previousStart: Date;
        let previousEnd: Date;

        if (period.mode === 'month' && period.month !== null) {
            currentStart = startOfMonth(new Date(period.year, period.month));
            currentEnd = endOfMonth(currentStart);
            previousStart = startOfMonth(subMonths(currentStart, 1));
            previousEnd = endOfMonth(previousStart);
        } else if (period.mode === 'year') {
            currentStart = startOfYear(new Date(period.year, 0));
            currentEnd = endOfYear(currentStart);
            previousStart = startOfYear(new Date(period.year - 1, 0));
            previousEnd = endOfYear(previousStart);
        } else {
            // All time - compare last 90 days to previous 90 days
            currentEnd = startOfDay(new Date());
            currentStart = subDays(currentEnd, 90);
            previousEnd = subDays(currentStart, 1);
            previousStart = subDays(previousEnd, 90);
        }

        // Filter runs for current and previous periods
        const currentRuns = runs.filter(r => {
            const date = new Date(r.start_date_local);
            return date >= currentStart && date <= currentEnd;
        });

        const previousRuns = runs.filter(r => {
            const date = new Date(r.start_date_local);
            return date >= previousStart && date <= previousEnd;
        });

        // Calculate training load for fitness/freshness adjustments
        const dailyLoads = activitiesToDailyLoads(activities, maxHR, restHR);
        const metrics = calculateTrainingLoadHistory(dailyLoads, currentStart, currentEnd);

        // Get current fitness metrics (last day of period or today)
        const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
        const ctl = latestMetric?.ctl || 0; // Fitness
        const tsb = latestMetric?.tsb || 0; // Form (freshness)

        // Calculate average pace from runs (weighted by distance)
        const calculateWeightedPace = (runList: Activity[]) => {
            if (runList.length === 0) return null;
            let totalDistance = 0;
            let totalTime = 0;
            runList.forEach(r => {
                totalDistance += r.distance;
                totalTime += r.moving_time;
            });
            if (totalDistance === 0) return null;
            return totalDistance / totalTime; // meters per second
        };

        const currentAvgSpeed = calculateWeightedPace(currentRuns);

        if (!currentAvgSpeed) return null;

        // Apply fitness and freshness adjustments
        // Higher fitness (CTL) = faster predictions
        // Optimal TSB (5-15) = peak performance
        // Negative TSB = fatigued, slower
        let fitnessMultiplier = 1.0;
        if (ctl > 40) fitnessMultiplier = 0.98; // Very fit
        else if (ctl > 25) fitnessMultiplier = 0.99;
        else if (ctl < 10) fitnessMultiplier = 1.02; // Low fitness

        let freshnessMultiplier = 1.0;
        if (tsb > 15) freshnessMultiplier = 0.985; // Very fresh
        else if (tsb > 5) freshnessMultiplier = 0.99; // Fresh
        else if (tsb < -15) freshnessMultiplier = 1.03; // Very fatigued
        else if (tsb < -5) freshnessMultiplier = 1.015; // Fatigued

        // Find a reference run (prefer longer runs for more accurate predictions)
        const sortedByDist = [...currentRuns].sort((a, b) => b.distance - a.distance);
        const referenceRun = sortedByDist[0];
        const refTime = referenceRun.moving_time;
        const refDist = referenceRun.distance;

        // Calculate predictions for each race distance
        const racePredictions = RACE_DISTANCES.map(race => {
            // Use Riegel formula from reference run
            let predictedTime = riegelFormula(refTime, refDist, race.meters);

            // Apply fitness and freshness adjustments
            predictedTime *= fitnessMultiplier * freshnessMultiplier;

            const predictedPace = race.meters / predictedTime; // m/s

            // Calculate previous period prediction if we have data
            let delta: number | null = null;
            let isFaster = false;

            if (previousRuns.length > 0) {
                const prevSorted = [...previousRuns].sort((a, b) => b.distance - a.distance);
                const prevRef = prevSorted[0];
                const prevPredictedTime = riegelFormula(prevRef.moving_time, prevRef.distance, race.meters);
                delta = predictedTime - prevPredictedTime;
                isFaster = delta < 0;
            }

            return {
                name: race.name,
                time: predictedTime,
                pace: predictedPace,
                delta,
                isFaster
            };
        });

        return {
            predictions: racePredictions,
            ctl,
            tsb,
            hasPreviousPeriod: previousRuns.length > 0
        };
    }, [activities, period, maxHR, restHR]);

    if (!predictions) {
        return (
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                    <span>🏁</span>
                    <span>Race Predictions</span>
                </h2>
                <div className="text-center py-8 text-gray-500 text-sm">
                    <div className="text-3xl mb-2">📊</div>
                    <p className="font-bold uppercase tracking-wider text-[10px]">Insufficient data</p>
                    <p className="text-xs mt-1 opacity-70">Add more runs to see predictions</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>🏁</span>
                    <span>Race Predictions</span>
                </h2>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider">
                    <span className={`px-2 py-1 rounded ${predictions.ctl >= 25 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        CTL {predictions.ctl.toFixed(0)}
                    </span>
                    <span className={`px-2 py-1 rounded ${predictions.tsb > 5 ? 'bg-emerald-500/20 text-emerald-400' :
                        predictions.tsb < -10 ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                        }`}>
                        TSB {predictions.tsb > 0 ? '+' : ''}{predictions.tsb.toFixed(0)}
                    </span>
                </div>
            </div>

            <div className="space-y-4">
                {predictions.predictions.map(pred => (
                    <div
                        key={pred.name}
                        className="bg-black/30 rounded-2xl p-4 border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {pred.name}
                            </span>
                            {pred.delta !== null && (
                                <span className={`text-[10px] font-black flex items-center gap-1 ${pred.isFaster ? 'text-emerald-400' : 'text-red-400'}`}>
                                    <span>{pred.isFaster ? '↓' : '↑'}</span>
                                    <span>{formatTime(Math.abs(pred.delta))}</span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline gap-3">
                            <span className="text-2xl font-black text-white">
                                {formatTime(pred.time)}
                            </span>
                            <span className="text-sm text-gray-400 font-bold">
                                {formatPace(pred.pace)} /km
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 text-[9px] text-gray-600 text-center font-medium">
                Based on fitness (CTL), freshness (TSB), and recent runs
            </div>
        </div>
    );
}
