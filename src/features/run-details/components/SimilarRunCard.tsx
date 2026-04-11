import type { Activity } from '@/types/activity';
import type { SimilarRunResult } from '@/services/api/memoryApi';

interface SimilarRunCardProps {
    run: SimilarRunResult;
    onSelect?: (activity: Activity) => void;
    onOpenRun: (stravaId: number, onSelect?: (activity: Activity) => void) => Promise<void>;
}

export function SimilarRunCard({
    run,
    onSelect,
    onOpenRun,
}: SimilarRunCardProps) {
    const formattedPace = run.paceMinPerKm
        ? `${Math.floor(run.paceMinPerKm)}:${String(Math.round((run.paceMinPerKm % 1) * 60)).padStart(2, '0')}/km`
        : null;
    const formattedDate = new Date(`${run.activityDate}T12:00:00`).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    return (
        <button
            type="button"
            onClick={() => void onOpenRun(run.stravaId, onSelect)}
            disabled={!onSelect}
            className="group flex w-full flex-col gap-1 rounded-[1.2rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] px-4 py-3 text-left transition hover:border-[var(--rv-border-strong)] hover:bg-[var(--rv-bg-elevated)] disabled:cursor-default disabled:opacity-60"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="rv-mini-label">{formattedDate}</span>
                <span className="rv-pill-label text-[0.65rem] text-[var(--rv-text-faint)]">
                    {run.runProfile !== 'unknown' ? run.runProfile : ''}
                </span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="rv-data text-[1.25rem]">
                    {run.distanceKm.toFixed(1)}
                    <span className="ml-1 text-[0.75rem] font-normal text-[var(--rv-text-dim)]">km</span>
                </span>
                {formattedPace ? (
                    <span className="text-sm text-[var(--rv-text-dim)]">{formattedPace}</span>
                ) : null}
                {run.avgHR ? (
                    <span className="text-sm text-[var(--rv-text-faint)]">{run.avgHR} bpm</span>
                ) : null}
            </div>
        </button>
    );
}
