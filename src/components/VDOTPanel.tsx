import { useMemo } from 'react';
import type { Activity } from '../types';
import { calcVDOTFromActivities } from '../analytics/vdot';

interface VDOTPanelProps {
    activities: Activity[];
}

const ZONE_META: Array<{ key: 'E' | 'M' | 'T' | 'I' | 'R'; label: string; color: string }> = [
    { key: 'E', label: 'Easy', color: '#22C55E' },
    { key: 'M', label: 'Marathon', color: '#EAB308' },
    { key: 'T', label: 'Threshold', color: '#F97316' },
    { key: 'I', label: 'Interval', color: '#EF4444' },
    { key: 'R', label: 'Repetition', color: '#EF4444' },
];

export function VDOTPanel({ activities }: VDOTPanelProps) {
    const result = useMemo(() => calcVDOTFromActivities(activities), [activities]);

    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <p className="rv-kicker mb-2">Training Paces</p>
                    <h2 className="rv-section-title text-[1.55rem]">VDOT pace guide</h2>
                    <p className="mt-2 max-w-[48ch] text-sm leading-6 text-[var(--rv-text-dim)]">
                        Use your strongest recent race-like effort to anchor training paces and forecast equivalent race times.
                    </p>
                </div>
                {result && (
                    <div className="rounded-full border border-[var(--rv-blue)]/25 bg-[var(--rv-blue)]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--rv-blue)]">
                        VDOT {result.vdot.toFixed(1)}
                    </div>
                )}
            </div>

            {!result ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--rv-border)] px-5 py-10 text-center text-sm text-[var(--rv-text-dim)]">
                    No qualifying efforts found. Run a solid 5K, 10K, or half marathon to unlock VDOT guidance.
                </div>
            ) : (
                <div className="space-y-6">
                    <p className="text-sm text-[var(--rv-text-dim)]">Reference effort: {result.sourceLabel}</p>

                    <div className="grid gap-3">
                        {ZONE_META.map((zone) => {
                            const [slow, fast] = result.trainingZones[zone.key];
                            return (
                                <div
                                    key={zone.key}
                                    className="rounded-[1.35rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3"
                                >
                                    <div className="mb-1 flex items-center justify-between gap-3">
                                        <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: zone.color }}>
                                            {zone.key}
                                        </span>
                                        <span className="text-sm font-semibold text-[var(--rv-text)]">{zone.label}</span>
                                    </div>
                                    <div className="rv-metric text-[1.35rem] text-[var(--rv-text)]">
                                        {formatPace(fast)} - {formatPace(slow)} /km
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {result.racePredictions.map((prediction) => (
                            <div
                                key={prediction.label}
                                className="rounded-[1.4rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-4"
                            >
                                <div className="rv-mini-label mb-2">{prediction.label}</div>
                                <div className="rv-metric text-[1.8rem] text-[var(--rv-text)]">{formatTime(prediction.timeS)}</div>
                                <div className="mt-1 text-sm text-[var(--rv-text-dim)]">
                                    {formatPace((prediction.timeS / prediction.meters) * 1000 / 60)} /km
                                </div>
                            </div>
                        ))}
                    </div>
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
