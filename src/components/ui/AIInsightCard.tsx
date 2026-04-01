import { Sparkles, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useInsight } from '@/hooks/useInsight';

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
    payload: Record<string, unknown> | any;
    mostRecentActivityId: number;
    className?: string;
    conditionMet?: boolean;
    windowLabel?: string;
}

export function AIInsightCard({
    insightType,
    payload,
    mostRecentActivityId,
    className,
    conditionMet = true,
    windowLabel,
}: AIInsightCardProps) {
    const { insight, loading, error, dismissed, refresh, dismiss } = useInsight({
        insightType,
        payload,
        mostRecentActivityId,
        enabled: conditionMet,
    });

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
                            AI insight
                        </span>
                    </div>

                    {loading ? (
                        <div className="mt-2 space-y-1.5">
                            <div className="h-4 w-full animate-pulse rounded bg-muted-foreground/20" />
                            <div className="h-4 w-2/3 animate-pulse rounded bg-muted-foreground/20" />
                        </div>
                    ) : (
                        <p className="mt-2 text-sm leading-6 text-foreground/80">
                            {insight}
                        </p>
                    )}

                    {windowLabel && !loading && (
                        <p className="mt-2 rv-mini-label text-xs text-muted-foreground">
                            {windowLabel}
                        </p>
                    )}

                    {!loading && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={refresh}
                                className="h-auto px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <RefreshCw className="mr-1 size-3" />
                                Refresh
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={dismiss}
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
