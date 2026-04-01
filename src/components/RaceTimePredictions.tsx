import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { Activity } from '../types';
import { isRun } from '../types';
import {
    activitiesToDailyLoads,
    calculateTrainingLoadHistory,
} from '../analytics/trainingLoad';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, startOfDay, subMonths } from 'date-fns';
import { parseActivityLocalDate } from '../utils/activityDate';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { buildRacePredictionPayload } from '@/utils/insightPayloads';

interface RaceTimePredictionsProps {
    activities: Activity[];
    allActivities?: Activity[];
    period: {
        mode: 'all' | 'year' | 'month' | '30d' | '90d' | '365d';
        year: number;
        month: number | null;
    };
    maxHR?: number;
    restHR?: number;
    mostRecentActivityId?: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// Race distances in meters
const RACE_DISTANCES = [
    { name: '5K', meters: 5000 },
    { name: '10K', meters: 10000 },
    { name: 'Half Marathon', meters: 21097.5 },
    { name: 'Marathon', meters: 42195 },
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
    allActivities,
    period,
    maxHR = 185,
    restHR = 60,
    mostRecentActivityId
}: RaceTimePredictionsProps) {
    const raceInsightPayload = useMemo(
        () => (allActivities ? buildRacePredictionPayload(allActivities) : {}),
        [allActivities]
    );

    const predictions = useMemo(() => {
        const runs = activities.filter(isRun);
        if (runs.length === 0) return null;

        // Get date range for current and previous period
        let currentStart: Date;
        let currentEnd: Date;
        let previousStart: Date;
        let previousEnd: Date;
        const today = startOfDay(new Date());
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        if (period.mode === 'month' && period.month !== null) {
            currentStart = startOfMonth(new Date(period.year, period.month));
            const isCurrentMonth = period.year === currentYear && period.month === currentMonth;
            currentEnd = isCurrentMonth ? today : endOfMonth(currentStart);
            previousStart = startOfMonth(subMonths(currentStart, 1));
            previousEnd = endOfMonth(previousStart);
        } else if (period.mode === 'year') {
            currentStart = startOfYear(new Date(period.year, 0));
            const isCurrentYear = period.year === currentYear;
            currentEnd = isCurrentYear ? today : endOfYear(currentStart);
            previousStart = startOfYear(new Date(period.year - 1, 0));
            previousEnd = endOfYear(previousStart);
        } else if (period.mode === '30d') {
            currentEnd = today;
            currentStart = subDays(currentEnd, 30);
            previousEnd = subDays(currentStart, 1);
            previousStart = subDays(previousEnd, 30);
        } else if (period.mode === '90d') {
            currentEnd = today;
            currentStart = subDays(currentEnd, 90);
            previousEnd = subDays(currentStart, 1);
            previousStart = subDays(previousEnd, 90);
        } else if (period.mode === '365d') {
            currentEnd = today;
            currentStart = subDays(currentEnd, 365);
            previousEnd = subDays(currentStart, 1);
            previousStart = subDays(previousEnd, 365);
        } else {
            // All time - compare last 90 days to previous 90 days
            currentEnd = today;
            currentStart = subDays(currentEnd, 90);
            previousEnd = subDays(currentStart, 1);
            previousStart = subDays(previousEnd, 90);
        }

        // Filter runs for current and previous periods
        const currentRuns = runs.filter(r => {
            const date = parseActivityLocalDate(r.start_date_local);
            return date >= currentStart && date <= currentEnd;
        });

        const previousRuns = runs.filter(r => {
            const date = parseActivityLocalDate(r.start_date_local);
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

        // Race Readiness Score (0-100)
        // Blend of fitness, freshness, quality density, and long-run support.
        const window28Start = subDays(currentEnd, 27);
        const recent28Runs = runs.filter(r => {
            const d = parseActivityLocalDate(r.start_date_local);
            return d >= window28Start && d <= currentEnd;
        });

        const qualityRuns = recent28Runs.filter(r => {
            const highEffortByHR = !!r.average_heartrate && r.average_heartrate >= maxHR * 0.82;
            const highEffortBySpeed = currentAvgSpeed ? r.average_speed >= currentAvgSpeed * 1.03 : false;
            const meaningfulDistance = r.distance >= 5000;
            return meaningfulDistance && (highEffortByHR || highEffortBySpeed || (r.suffer_score || 0) >= 50);
        });

        const longRunWindowStart = subDays(currentEnd, 13);
        const recentLongRuns = runs.filter(r => {
            const d = parseActivityLocalDate(r.start_date_local);
            return d >= longRunWindowStart && d <= currentEnd;
        });
        const longestRecentRunKm = recentLongRuns.reduce((max, r) => Math.max(max, r.distance / 1000), 0);

        const fitnessScore = clamp((ctl - 8) / 32, 0, 1) * 35; // CTL contribution
        const freshnessScore = (1 - clamp(Math.abs(tsb - 8) / 25, 0, 1)) * 25; // Optimal around +8
        const qualityScore = clamp(qualityRuns.length / 6, 0, 1) * 20; // ~1.5 quality sessions/week
        const longRunScore = clamp(longestRecentRunKm / 16, 0, 1) * 20; // Support toward HM readiness
        const readinessScore = Math.round(fitnessScore + freshnessScore + qualityScore + longRunScore);

        const readinessBand =
            readinessScore >= 75 ? 'ready'
                : readinessScore >= 55 ? 'building'
                    : 'base';

        return {
            predictions: racePredictions,
            ctl,
            tsb,
            hasPreviousPeriod: previousRuns.length > 0,
            readinessScore,
            readinessBand,
            qualityRuns: qualityRuns.length,
            longestRecentRunKm
        };
    }, [activities, period, maxHR, restHR]);

    const [activeTooltip, setActiveTooltip] = useState<'ctl' | 'tsb' | 'readiness' | null>(null);
    const tooltipAnchorRef = useRef<HTMLDivElement>(null);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});

    // Close tooltip when clicking outside or pressing escape
    useEffect(() => {
        let frame = 0;
        if (activeTooltip && tooltipAnchorRef.current) {
            frame = requestAnimationFrame(() => {
                if (!tooltipAnchorRef.current) return;
                const rect = tooltipAnchorRef.current.getBoundingClientRect();
                const TOOLTIP_W = 256;
                const left = Math.min(
                    Math.max(8, rect.right - TOOLTIP_W),
                    window.innerWidth - TOOLTIP_W - 8
                );

                setTooltipStyle({
                    position: 'fixed',
                    top: rect.bottom + 8,
                    left,
                    width: TOOLTIP_W,
                });
            });
        }

        const handleClickOutside = () => setActiveTooltip(null);
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveTooltip(null); };

        if (activeTooltip) {
            // Defer attachment to avoid immediate close on the click that opened it
            setTimeout(() => {
                window.addEventListener('click', handleClickOutside);
                window.addEventListener('keydown', handleEsc);
            }, 0);
        }
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('keydown', handleEsc);
        };
    }, [activeTooltip]);

    if (!predictions) {
        return (
            <div className="rv-panel px-5 py-5 sm:px-6 sm:py-6">
                <p className="rv-kicker mb-2">Race Readiness</p>
                <h2 className="rv-section-title text-[1.7rem]">Projection unavailable</h2>
                <div className="py-8 text-center text-sm text-[var(--rv-text-dim)]">
                    <p className="rv-mini-label text-[var(--rv-text)]">Insufficient data</p>
                    <p className="mt-1 text-sm opacity-70">Add more runs to estimate race times and readiness.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="rv-panel relative px-5 py-5 sm:px-6 sm:py-6">
            <div className="mb-5 flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.1fr)_auto] xl:items-start">
                <div>
                    <p className="rv-kicker mb-2">Race Readiness</p>
                    <h2 className="rv-section-title text-[1.7rem]">Projected race times</h2>
                    <p className="mt-2 max-w-[46ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                        Compare equivalent race times from your current block, then open the pace guide if you want session targets.
                    </p>
                </div>
                <div ref={tooltipAnchorRef} className="rv-pill-label relative z-10 flex flex-wrap items-center gap-2 xl:justify-end">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === 'ctl' ? null : 'ctl');
                        }}
                        className={`rounded-full border px-2.5 py-1 cursor-help transition-colors ${predictions.ctl >= 25 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)]'} ${activeTooltip === 'ctl' ? 'ring-2 ring-emerald-500/35' : ''}`}
                    >
                        Fitness {predictions.ctl.toFixed(0)}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === 'tsb' ? null : 'tsb');
                        }}
                        className={`rounded-full border px-2.5 py-1 cursor-help transition-colors ${predictions.tsb > 5 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' :
                            predictions.tsb < -10 ? 'border-red-500/25 bg-red-500/10 text-red-400' :
                                'border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)]'
                            } ${activeTooltip === 'tsb' ? 'ring-2 ring-[var(--rv-border-strong)]' : ''}`}
                    >
                        Freshness {predictions.tsb > 0 ? '+' : ''}{predictions.tsb.toFixed(0)}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === 'readiness' ? null : 'readiness');
                        }}
                        className={`rounded-full border px-2.5 py-1 cursor-help transition-colors ${predictions.readinessBand === 'ready'
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                            : predictions.readinessBand === 'building'
                                ? 'border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 text-[var(--rv-yellow)]'
                                : 'border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)]'
                            } ${activeTooltip === 'readiness' ? 'ring-2 ring-[var(--rv-border-strong)]' : ''}`}
                    >
                        Readiness {predictions.readinessScore}
                    </button>

                </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
                {predictions.predictions.map(pred => (
                    <div
                        key={pred.name}
                        className="rounded-[1.45rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3.5"
                    >
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="rv-mini-label">
                                {pred.name}
                            </span>
                            {pred.delta !== null && (
                                <span className={`rv-pill-label flex items-center gap-1 text-[0.72rem] ${pred.isFaster ? 'text-emerald-400' : 'text-[var(--rv-orange)]'}`}>
                                    <span>{pred.isFaster ? '↓' : '↑'}</span>
                                    <span>{formatTime(Math.abs(pred.delta))}</span>
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="rv-metric text-[2.25rem] leading-none text-[var(--rv-text)]">
                                {formatTime(pred.time)}
                            </span>
                            <span className="text-sm font-semibold text-[var(--rv-text-dim)]">
                                {formatPace(pred.pace)} /km
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-3 text-center text-sm font-medium text-[var(--rv-text-faint)]">
                Built from fitness, freshness, recent quality sessions, and long-run support.
            </div>
            {activeTooltip && createPortal(
                <div
                    className="rv-panel rv-panel-strong z-[9999] p-3 animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
                    style={tooltipStyle}
                >
                    {activeTooltip === 'ctl' ? (
                        <>
                            <div className="mb-1 text-sm font-semibold text-emerald-400">Fitness (CTL)</div>
                            <div className="text-sm font-normal normal-case leading-6 text-[var(--rv-text-dim)]">
                                Weighted average of your daily training load over the last 42 days. Higher values indicate higher fitness but higher fatigue.
                            </div>
                        </>
                    ) : activeTooltip === 'tsb' ? (
                        <>
                            <div className={`mb-1 text-sm font-semibold ${predictions.tsb > 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>Freshness (TSB)</div>
                            <div className="text-sm font-normal normal-case leading-6 text-[var(--rv-text-dim)]">
                                Difference between fitness (CTL) and fatigue (ATL).
                                <br />
                                <span className="mt-1 block text-emerald-600">+ Positive: Fresh & Ready</span>
                                <span className="block text-red-500">- Negative: Fatigued & Building</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mb-1 text-sm font-semibold text-emerald-400">Readiness Score (0-100)</div>
                            <div className="text-sm font-normal normal-case leading-6 text-[var(--rv-text-dim)]">
                                Composite of fitness (CTL), freshness (TSB), quality sessions (28d), and long-run support (14d).
                                <span className="mt-1 block text-emerald-600">75+: Ready to race</span>
                                <span className="block text-amber-500">55-74: Building fitness</span>
                                <span className="block text-[var(--rv-text-dim)]">&lt;55: Base phase</span>
                                <span className="mt-1 block text-[0.72rem] text-[var(--rv-text-faint)]">
                                    Quality runs: {predictions.qualityRuns} | Longest recent: {predictions.longestRecentRunKm.toFixed(1)} km
                                </span>
                            </div>
                        </>
                    )}
                </div>,
                document.body
            )}

            {mostRecentActivityId && allActivities && (
                <div className="mt-4">
                    <AIInsightCard
                        insightType="race-prediction"
                        payload={raceInsightPayload}
                        mostRecentActivityId={mostRecentActivityId}
                        conditionMet={Boolean(raceInsightPayload.vdot)}
                        windowLabel="Based on last 90 days"
                    />
                </div>
            )}
        </div>
    );
}
