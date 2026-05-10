import { Bot, Sparkles, RefreshCw, X } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { PERSONAS, useCoachPersona, type CoachPersona } from '@/hooks/useCoachPersona';
import { useInsight } from '@/hooks/useInsight';
import { cn } from '@/lib/utils';

export type InsightType =
    | 'training-block'
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
        effortPattern?: string;
    };
    weekContext?: {
        totalKm: number;
        runCount: number;
        avgPaceMinPerKm: number | null;
        avgHR: number | null;
        easyRuns: number;
        steadyRuns: number;
        thresholdRuns: number;
        intervalRuns: number;
        raceRuns: number;
        longRuns: number;
        loadRatio: number | null;
        currentWeekKey?: string;
    };
}

const INSIGHT_LABELS: Record<InsightType, string> = {
    'training-block': 'Coach Insight',
    overview: 'Training Insight',
    'training-health': 'Training Health',
    fitness: 'Fitness Insight',
    volume: 'Volume Insight',
    'injury-risk': 'Risk Watch',
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
    const { persona: activePersona, setPersona } = useCoachPersona();
    const { insight, loading, error, dismissed, refresh, dismiss } = useInsight({
        insightType,
        payload,
        mostRecentActivityId,
        enabled: conditionMet,
        persona: persona ?? activePersona,
        useMemory,
        activityContext,
        weekContext,
    });
    const resolvedPersona = persona ?? activePersona;
    const coach = PERSONAS.find((candidate) => candidate.id === resolvedPersona) ?? PERSONAS[1];
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
                    </div>

                    {showSkeleton ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-2/3" />
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
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    aria-label={`Select coach persona. Current coach: ${coach.name}`}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-[0.68rem] font-normal text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <Bot className="size-3" />
                                    {coach.name}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="min-w-56">
                                    <DropdownMenuLabel>Choose coach persona</DropdownMenuLabel>
                                    <DropdownMenuGroup>
                                        <DropdownMenuRadioGroup
                                            value={resolvedPersona}
                                            onValueChange={(value) => setPersona(value as CoachPersona)}
                                        >
                                            {PERSONAS.map((candidate) => (
                                                <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{candidate.name}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {candidate.title}
                                                        </span>
                                                    </div>
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={refresh}
                                    disabled={loading}
                                    className="inline-flex items-center gap-1 px-1.5 py-1 text-[0.68rem] font-normal text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
                                    Refresh
                                </button>
                                <button
                                    type="button"
                                    onClick={dismiss}
                                    disabled={loading}
                                    className="inline-flex items-center gap-1 px-1.5 py-1 text-[0.68rem] font-normal text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <X className="size-3" />
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
