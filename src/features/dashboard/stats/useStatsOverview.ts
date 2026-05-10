import { useEffect, useMemo, useState } from 'react';

import type { CSSProperties } from 'react';

import {
    buildInjuryRiskPayload,
    buildOverviewPayload,
    getInsightWindowLabel,
    viewPeriodToDays,
} from '@/domain/insights';
import { useCoachPersona } from '@/hooks/useCoachPersona';
import { buildCurrentWeekSummary } from '@/utils/currentWeekSummary';
import type { Activity } from '@/types/activity';
import type { ViewPeriod } from '@/lib/dashboard';

import {
    buildStatsOverviewModel,
    getSelectedPeriodEnd,
} from './buildStatsOverview';

interface UseStatsOverviewOptions {
    activities: Activity[];
    allActivities: Activity[];
    period: ViewPeriod;
    variant: 'overview' | 'training';
    mostRecentActivityId?: number;
    maxHR: number;
}

export function useStatsOverview({
    activities,
    allActivities,
    period,
    variant,
    mostRecentActivityId,
    maxHR,
}: UseStatsOverviewOptions) {
    const [activeHelp, setActiveHelp] = useState<string | null>(null);
    const [activeMetric, setActiveMetric] = useState<'acwr' | 'ramp' | 'consistency' | 'longRunRatio' | 'efficiency' | 'gapTrend' | 'monotony' | 'strain'>('acwr');
    const { persona } = useCoachPersona();
    const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);
    const selectedPeriodEnd = useMemo(() => getSelectedPeriodEnd(period), [period]);

    useEffect(() => {
        if (!activeHelp) return;

        const handleClickOutside = () => setActiveHelp(null);
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveHelp(null);
            }
        };

        const timeoutId = window.setTimeout(() => {
            window.addEventListener('click', handleClickOutside);
            window.addEventListener('keydown', handleEscape);
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [activeHelp]);

    const model = useMemo(
        () => buildStatsOverviewModel({
            activities,
            period,
            selectedPeriodEnd,
            maxHR,
        }),
        [activities, maxHR, period, selectedPeriodEnd]
    );

    const overviewWindowLabel = getInsightWindowLabel(viewPeriodToDays(period));
    const riskWatchPayload = useMemo(() => {
        const payload = buildInjuryRiskPayload(allActivities, 30);
        if (!payload.shouldShow) return null;

        const qualityRuns14d = payload.recentThresholdRuns14d + payload.recentIntervalRuns14d + payload.recentRaceRuns14d;
        const hasDistinctRiskSignal =
            payload.loadRatio > 1.75 ||
            payload.rampRate3Week > 50 ||
            (payload.loadRatio > 1.55 && payload.rampRate3Week > 35) ||
            payload.consecutiveRunDays >= 6 ||
            (qualityRuns14d >= 3 && payload.recentRestDays <= 2);

        return hasDistinctRiskSignal ? payload : null;
    }, [allActivities]);
    const weekContext = useMemo(
        () => buildCurrentWeekSummary(allActivities, model.stats.acwr ?? null),
        [allActivities, model.stats.acwr]
    );

    return {
        activeHelp,
        setActiveHelp,
        activeMetric,
        setActiveMetric,
        model,
        mostRecentActivityId,
        overviewPayload: buildOverviewPayload(allActivities, period),
        overviewWindowLabel,
        persona,
        reveal,
        riskWatchPayload,
        selectedPeriodEnd,
        showOverview: variant === 'overview',
        weekContext,
    };
}
