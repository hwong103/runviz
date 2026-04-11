import type { Activity } from '@/types/activity';
import type { SimilarRunResult } from '@/services/api/memoryApi';

import { SimilarRunCard } from './SimilarRunCard';

interface SimilarRunsPanelProps {
    similar: SimilarRunResult[];
    similarLoading: boolean;
    onSelect?: (activity: Activity) => void;
    onOpenRun: (stravaId: number, onSelect?: (activity: Activity) => void) => Promise<void>;
}

export function SimilarRunsPanel({
    similar,
    similarLoading,
    onSelect,
    onOpenRun,
}: SimilarRunsPanelProps) {
    if (!similarLoading && similar.length === 0) {
        return null;
    }

    return (
        <section className="rv-panel rv-panel-strong min-w-0 px-4 py-5 sm:px-6">
            <div className="mb-5">
                <p className="rv-kicker mb-2">Runs Like This</p>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">
                    Comparable efforts
                </h2>
                <p className="rv-body-copy-sm mt-2">
                    Open another run with a similar distance, pace, and effort profile to compare how this session fits your broader training history.
                </p>
            </div>

            <div className="space-y-2.5">
                {similarLoading ? (
                    Array.from({ length: 4 }, (_, index) => (
                        <div
                            key={index}
                            className="h-20 animate-pulse rounded-[1.2rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)]"
                        />
                    ))
                ) : (
                    similar.map((run) => (
                        <SimilarRunCard
                            key={run.stravaId}
                            run={run}
                            onSelect={onSelect}
                            onOpenRun={onOpenRun}
                        />
                    ))
                )}
            </div>
        </section>
    );
}
