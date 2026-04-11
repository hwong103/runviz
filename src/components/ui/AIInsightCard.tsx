import { Bot, Sparkles, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        className="h-auto rounded-full bg-background/70 px-2.5 py-1 text-[0.68rem] font-normal text-muted-foreground shadow-sm"
                                        aria-label={`Select coach persona. Current coach: ${coach.name}`}
                                    >
                                        <Bot data-icon="inline-start" />
                                        {coach.name}
                                    </Button>
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
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={refresh}
                                    disabled={loading}
                                    className="h-auto px-1.5 py-1 text-[0.68rem] font-normal text-muted-foreground hover:text-foreground"
                                >
                                    <RefreshCw
                                        data-icon="inline-start"
                                        className={cn(loading && 'animate-spin')}
                                    />
                                    Refresh
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={dismiss}
                                    disabled={loading}
                                    className="h-auto px-1.5 py-1 text-[0.68rem] font-normal text-muted-foreground hover:text-foreground"
                                >
                                    <X data-icon="inline-start" />
                                    Dismiss
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
