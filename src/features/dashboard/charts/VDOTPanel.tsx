import { useMemo } from 'react';
import { startOfDay, subDays } from 'date-fns';
import type { Activity } from '@/types/activity';
import { isRun } from '@/types/activity';
import { calcVDOTFromActivities } from '@/analytics/vdot';
import {
    activitiesToDailyLoads,
    calculateTrainingLoadHistory,
} from '@/analytics/trainingLoad';
import { buildRacePredictionPayload } from '@/domain/insights';
import { parseActivityLocalDate } from '@/utils/activityDate';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { useCoachPersona } from '@/hooks/useCoachPersona';
import type { ViewPeriod } from '@/lib/dashboard';

interface VDOTPanelProps {
    activities: Activity[];
    allActivities?: Activity[];
    period?: ViewPeriod;
    maxHR?: number;
    restHR?: number;
    mostRecentActivityId?: number;
}

const ZONE_META: Array<{ key: 'E' | 'M' | 'T' | 'I' | 'R'; label: string; color: string }> = [
    { key: 'E', label: 'Easy', color: '#22C55E' },
    { key: 'M', label: 'Marathon', color: '#EAB308' },
    { key: 'T', label: 'Threshold', color: '#F97316' },
    { key: 'I', label: 'Interval', color: '#EF4444' },
    { key: 'R', label: 'Repetition', color: '#EF4444' },
];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function VDOTPanel({
    activities,
    allActivities,
    period,
    maxHR = 185,
    restHR = 60,
    mostRecentActivityId,
}: VDOTPanelProps) {
    const { persona } = useCoachPersona();
    void period;
    const result = useMemo(() => calcVDOTFromActivities(activities), [activities]);
    const readiness = useMemo(() => {
        const runs = (allActivities ?? activities).filter(isRun);
        if (runs.length === 0) return null;

        const today = startOfDay(new Date());
        const window28Start = subDays(today, 27);
        const recent28Runs = runs.filter((run) => parseActivityLocalDate(run.start_date_local) >= window28Start);

        const dailyLoads = activitiesToDailyLoads(runs, maxHR, restHR);
        const metrics = calculateTrainingLoadHistory(dailyLoads, subDays(today, 90), today);
        const latest = metrics[metrics.length - 1];
        if (!latest) return null;

        const ctl = latest.ctl;
        const tsb = latest.tsb;

        const poolForSpeed = runs.slice(-60);
        const totalDist = poolForSpeed.reduce((sum, run) => sum + run.distance, 0);
        const totalTime = poolForSpeed.reduce((sum, run) => sum + run.moving_time, 0);
        const avgSpeed = totalTime > 0 ? totalDist / totalTime : 0;

        const qualityRuns = recent28Runs.filter((run) => {
            const highHR = !!run.average_heartrate && run.average_heartrate >= maxHR * 0.82;
            const fastPace = avgSpeed > 0 && run.average_speed >= avgSpeed * 1.03;
            return run.distance >= 5000 && (highHR || fastPace || (run.suffer_score ?? 0) >= 50);
        });

        const longRunWindowStart = subDays(today, 13);
        const longestRecent = runs
            .filter((run) => parseActivityLocalDate(run.start_date_local) >= longRunWindowStart)
            .reduce((max, run) => Math.max(max, run.distance / 1000), 0);

        const fitnessScore = clamp((ctl - 8) / 32, 0, 1) * 35;
        const freshnessScore = (1 - clamp(Math.abs(tsb - 8) / 25, 0, 1)) * 25;
        const qualityScore = clamp(qualityRuns.length / 6, 0, 1) * 20;
        const longRunScore = clamp(longestRecent / 16, 0, 1) * 20;
        const score = Math.round(fitnessScore + freshnessScore + qualityScore + longRunScore);
        const band = score >= 75 ? 'ready' : score >= 55 ? 'building' : 'base';

        return { ctl, tsb, score, band };
    }, [activities, allActivities, maxHR, restHR]);
    const insightPayload = useMemo(
        () => (allActivities ? buildRacePredictionPayload(allActivities, maxHR) : {}),
        [allActivities, maxHR]
    );

    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-5 flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.05fr)_auto] xl:items-start">
                <div>
                    <p className="rv-kicker mb-2">Race Prediction</p>
                    <h2 className="rv-section-title text-[1.55rem]">VDOT pace guide</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--rv-text-dim)] xl:max-w-[60ch]">
                        Race time predictions and training zones anchored to your strongest recent effort.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {result && (
                        <span className="rounded-full border border-[var(--rv-blue)]/25 bg-[var(--rv-blue)]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--rv-blue)]">
                            VDOT {result.vdot.toFixed(1)}
                        </span>
                    )}
                    {readiness && (
                        <>
                            <span className={`rv-pill-label rounded-full border px-2.5 py-1 text-[0.72rem] ${
                                readiness.ctl >= 25
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                                    : 'border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)]'
                            }`}>
                                Fitness {readiness.ctl.toFixed(0)}
                            </span>
                            <span className={`rv-pill-label rounded-full border px-2.5 py-1 text-[0.72rem] ${
                                readiness.tsb > 5
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                                    : readiness.tsb < -10
                                        ? 'border-red-500/25 bg-red-500/10 text-red-400'
                                        : 'border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)]'
                            }`}>
                                Freshness {readiness.tsb > 0 ? '+' : ''}{readiness.tsb.toFixed(0)}
                            </span>
                            <span className={`rv-pill-label rounded-full border px-2.5 py-1 text-[0.72rem] ${
                                readiness.band === 'ready'
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                                    : readiness.band === 'building'
                                        ? 'border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 text-[var(--rv-yellow)]'
                                        : 'border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[var(--rv-text-dim)]'
                            }`}>
                                Readiness {readiness.score}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {!result ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--rv-border)] px-5 py-10 text-center text-sm text-[var(--rv-text-dim)]">
                    No qualifying efforts found. Run a solid 5K, 10K, or half marathon to unlock VDOT guidance.
                </div>
            ) : (
                <div className="space-y-5">
                    <p className="text-sm text-[var(--rv-text-dim)]">Reference effort: {result.sourceLabel}</p>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.9fr)] xl:items-start">
                        <div className="grid gap-3 sm:grid-cols-2">
                            {ZONE_META.map((zone) => {
                                const [slow, fast] = result.trainingZones[zone.key];
                                return (
                                    <div
                                        key={zone.key}
                                        className="rounded-[1.2rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-3">
                                            <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: zone.color }}>
                                                {zone.key}
                                            </span>
                                            <span className="text-sm font-semibold text-[var(--rv-text)]">{zone.label}</span>
                                        </div>
                                        <div className="rv-metric text-[1.2rem] leading-tight text-[var(--rv-text)]">
                                            {formatPace(fast)} - {formatPace(slow)} /km
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-3 self-start">
                            {result.racePredictions.map((prediction) => (
                                <div
                                    key={prediction.label}
                                    className="rounded-[1.2rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3"
                                >
                                    <div className="rv-mini-label mb-1.5">{prediction.label}</div>
                                    <div className="rv-metric text-[1.55rem] leading-none text-[var(--rv-text)]">{formatTime(prediction.timeS)}</div>
                                    <div className="mt-1 text-sm text-[var(--rv-text-dim)]">
                                        {formatPace((prediction.timeS / prediction.meters) * 1000 / 60)} /km
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {result && mostRecentActivityId && allActivities && (
                <div className="mt-6">
                    <AIInsightCard
                        insightType="race-prediction"
                        payload={insightPayload}
                        mostRecentActivityId={mostRecentActivityId}
                        conditionMet={Boolean(insightPayload.vdot)}
                        windowLabel="Based on last 90 days"
                        persona={persona}
                    />
                </div>
            )}
        </div>
    );
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatPace(minutesPerKm: number): string {
    if (!Number.isFinite(minutesPerKm) || minutesPerKm <= 0) return '--:--';

    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm - minutes) * 60);
    if (seconds === 60) {
        return `${minutes + 1}:00`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
