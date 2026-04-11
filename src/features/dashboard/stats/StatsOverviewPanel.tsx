import { HeartPulse, Mountain, PieChart, Scale, Target, TrendingUp } from 'lucide-react';

import { TrainingHealthTrendChart } from '@/features/dashboard/stats/TrainingHealthTrendChart';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import type { Activity } from '@/types/activity';
import type { ViewPeriod } from '@/lib/dashboard';

import { StatCard } from './components/StatCard';
import { SnapshotCell, ToplineMetric } from './components/MetricSummary';
import { useStatsOverview } from './useStatsOverview';

interface StatsOverviewProps {
    activities: Activity[];
    allActivities: Activity[];
    period: ViewPeriod;
    variant?: 'overview' | 'training';
    mostRecentActivityId?: number;
    maxHR?: number;
}

const ICONS = {
    scale: Scale,
    trending: TrendingUp,
    target: Target,
    pie: PieChart,
    heart: HeartPulse,
    mountain: Mountain,
} as const;

export function StatsOverviewPanel({
    activities,
    allActivities,
    period,
    variant = 'overview',
    mostRecentActivityId,
    maxHR = 185,
}: StatsOverviewProps) {
    const {
        activeHelp,
        setActiveHelp,
        activeMetric,
        setActiveMetric,
        injuryRiskPayload,
        model,
        overviewPayload,
        overviewWindowLabel,
        persona,
        reveal,
        selectedPeriodEnd,
        showOverview,
        trainingHealthPayload,
        trainingHealthWindowLabel,
        weekContext,
    } = useStatsOverview({
        activities,
        allActivities,
        period,
        variant,
        mostRecentActivityId,
        maxHR,
    });

    return (
        <div className="space-y-4">
            {showOverview ? (
                <>
                    <section className="rv-panel rv-panel-strong px-5 py-5 sm:px-6 sm:py-6" style={reveal(60)}>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {model.overviewToplineMetrics.map((metric) => (
                                <ToplineMetric
                                    key={metric.label}
                                    label={metric.label}
                                    value={metric.value}
                                    unit={metric.unit}
                                />
                            ))}
                        </div>
                    </section>

                    <section className="rv-panel px-5 py-4 sm:px-6 sm:py-5" style={reveal(120)}>
                        <p className="rv-kicker mb-3">Block Snapshot</p>
                        <div className="overflow-hidden rounded-[1.35rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)]">
                            <div className="grid divide-y divide-[var(--rv-border)] bg-[var(--rv-bg-panel)] md:grid-cols-5 md:divide-x md:divide-y-0">
                                {model.snapshotMetrics.map((metric) => (
                                    <SnapshotCell
                                        key={metric.label}
                                        label={metric.label}
                                        value={metric.value}
                                        unit={metric.unit}
                                        detail={metric.detail}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>

                    {mostRecentActivityId ? (
                        <section style={reveal(180)}>
                            <AIInsightCard
                                insightType="overview"
                                payload={overviewPayload}
                                mostRecentActivityId={mostRecentActivityId}
                                windowLabel={overviewWindowLabel}
                                persona={persona}
                                useMemory
                                weekContext={weekContext}
                            />
                        </section>
                    ) : null}

                    {mostRecentActivityId && injuryRiskPayload.shouldShow ? (
                        <section style={reveal(200)}>
                            <AIInsightCard
                                insightType="injury-risk"
                                payload={injuryRiskPayload}
                                mostRecentActivityId={mostRecentActivityId}
                                className="border-amber-500/40"
                                windowLabel="Last 30 days"
                                persona={persona}
                            />
                        </section>
                    ) : null}
                </>
            ) : (
                <section className="space-y-3">
                    <div className="grid min-[420px]:grid-cols-3 grid-cols-2 gap-2.5 xl:grid-cols-4">
                        {model.trainingMetrics.map((metric, index) => {
                            const Icon = ICONS[metric.icon];
                            return (
                                <StatCard
                                    key={metric.metricKey}
                                    label={metric.label}
                                    value={metric.value}
                                    unit={metric.unit}
                                    icon={Icon}
                                    color={metric.color}
                                    helpMetric={metric.helpMetric}
                                    helpText={metric.helpText}
                                    activeHelp={activeHelp}
                                    onToggleHelp={setActiveHelp}
                                    detail={metric.detail}
                                    tone={metric.tone}
                                    style={reveal(120 + index * 40)}
                                    metricKey={metric.metricKey}
                                    isSelected={activeMetric === metric.metricKey}
                                    onSelectMetric={setActiveMetric}
                                />
                            );
                        })}
                    </div>
                    <TrainingHealthTrendChart
                        activities={allActivities}
                        period={period}
                        selectedPeriodEnd={selectedPeriodEnd}
                        metric={activeMetric}
                        maxHR={maxHR}
                    />
                    {mostRecentActivityId ? (
                        <div className="mt-4">
                            <AIInsightCard
                                insightType="training-health"
                                payload={trainingHealthPayload}
                                mostRecentActivityId={mostRecentActivityId}
                                windowLabel={trainingHealthWindowLabel}
                                persona={persona}
                                useMemory
                                weekContext={weekContext}
                            />
                        </div>
                    ) : null}
                </section>
            )}
        </div>
    );
}
