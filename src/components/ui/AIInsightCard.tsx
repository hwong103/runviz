import { Sparkles, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PERSONAS, type CoachPersona } from '@/hooks/useCoachPersona';
import { useInsight } from '@/hooks/useInsight';
import { cn } from '@/lib/utils';

export type InsightType =
    | 'overview'
    | 'training-health'
    | 'fitness'
    | 'volume'
    | 'injury-risk'
    | 'race-prediction'
    | 'run-detail';

export interface AIInsightCardProps {
    insightType: InsightType;
    payload: object;
    mostRecentActivityId: number;
    className?: string;
    conditionMet?: boolean;
    windowLabel?: string;
    persona?: CoachPersona;
    useMemory?: boolean;
    activityContext?: {
        distanceKm: number;
        paceMinPerKm: number | null;
        avgHR: number | null;
        elevationPerKm: number | null;
        movingTimeMins: number;
        runProfile: string;
    };
    weekContext?: {
        totalKm: number;
        runCount: number;
        avgPaceMinPerKm: number | null;
        avgHR: number | null;
        easyRuns: number;
        thresholdRuns: number;
        raceRuns: number;
        loadRatio: number | null;
        currentWeekKey?: string;
    };
}

const INSIGHT_LABELS: Record<InsightType, string> = {
    overview: 'Training Insight',
    'training-health': 'Training Health',
    fitness: 'Fitness Insight',
    volume: 'Volume Insight',
    'injury-risk': 'Injury Insight',
    'race-prediction': 'Race Insight',
    'run-detail': 'Run Insight',
};

export function AIInsightCard({
    insightType,
    payload,
    mostRecentActivityId,
    className,
    conditionMet = true,
    windowLabel,
    persona,
    useMemory = false,
    activityContext,
    weekContext,
}: AIInsightCardProps) {
    const { insight, loading, error, dismissed, refresh, dismiss } = useInsight({
        insightType,
        payload,
        mostRecentActivityId,
        enabled: conditionMet,
        persona,
        useMemory,
        activityContext,
        weekContext,
    });
    const coachName = PERSONAS.find((candidate) => candidate.id === (persona ?? 'neutral'))?.name ?? 'Jordan';
    const showSkeleton = loading && !insight;

    // If condition not met, don't render anything
    if (!conditionMet) {
        return null;
    }

    // Silent error - return null
    if (error) {
        return null;
    }

    if (dismissed) {
        return null;
    }

    return (
        <div
            className={cn(
                'relative rounded-xl border border-border/50 bg-muted/30 p-4',
                insightType === 'injury-risk' && 'border-amber-500/40',
                className
            )}
        >
            <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="rv-kicker text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {INSIGHT_LABELS[insightType]}
                        </span>
                        <span className="text-[0.62rem] font-medium text-muted-foreground/50">
                            {coachName}
                        </span>
                    </div>

                    {showSkeleton ? (
                        <div className="mt-2 space-y-1.5">
                            <div className="h-4 w-full animate-pulse rounded bg-muted-foreground/20" />
                            <div className="h-4 w-2/3 animate-pulse rounded bg-muted-foreground/20" />
                        </div>
                    ) : (
                        <p className={cn(
                            'mt-2 text-sm leading-6 text-foreground/80 transition-opacity',
                            loading && 'opacity-70'
                        )}>
                            {insight}
                        </p>
                    )}

                    {windowLabel && !showSkeleton && (
                        <p className="mt-2 rv-mini-label text-xs text-muted-foreground">
                            {windowLabel}
                        </p>
                    )}

                    {!showSkeleton && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={refresh}
                                disabled={loading}
                                className="h-auto px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <RefreshCw className="mr-1 size-3" />
                                Refresh
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={dismiss}
                                disabled={loading}
                                className="h-auto px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <X className="mr-1 size-3" />
                                Dismiss
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
