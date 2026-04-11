import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Chart, Line } from 'react-chartjs-2';
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Flame,
    Gauge,
    HeartPulse,
    Mountain,
    X,
} from 'lucide-react';

import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { BrandLogo as ShoeBrandLogo } from '@/components/ui/BrandLogo';
import { useCoachPersona } from '@/hooks/useCoachPersona';
import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';

import { RankChart } from './components/RankChart';
import { InsightCard, MetricTile, SummaryTile } from './components/RunDetailCards';
import { SimilarRunsPanel } from './components/SimilarRunsPanel';
import {
    formatDistanceKm,
    formatDuration,
} from './runDetailMetrics';
import { useRunDetails } from './useRunDetails';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler
);

export interface RunDetailsProps {
    activity: Activity;
    allActivities: Activity[];
    shoes: Gear[];
    onClose: () => void;
    onSelect?: (activity: Activity) => void;
}

export function RunDetailsModal({
    activity: initialActivity,
    allActivities,
    shoes,
    onClose,
    onSelect,
}: RunDetailsProps) {
    const { persona } = useCoachPersona();
    const {
        activity,
        averageHeartrate,
        chartData,
        chartOptions,
        chartTheme,
        formattedActivityDate,
        heartRateSummary,
        hrChartData,
        hrChartOptions,
        loadingStreams,
        nextActivity,
        openSimilarRun,
        prevActivity,
        runInsightContext,
        runInsightPayload,
        similar,
        similarLoading,
        stats,
        viewMode,
        setViewMode,
    } = useRunDetails({
        activity: initialActivity,
        allActivities,
        shoes,
    });

    const neutralBadgeStyle = {
        borderColor: 'color-mix(in srgb, var(--rv-border-strong) 72%, transparent)',
        background: 'color-mix(in srgb, var(--rv-bg-elevated) 92%, var(--rv-bg-panel-strong))',
        color: 'var(--rv-text-dim)',
    } as const;

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[color-mix(in_srgb,var(--rv-bg)_90%,transparent)] p-2 backdrop-blur-xl sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="run-details-title"
                className="rv-shell-card mx-auto my-0 flex min-h-[calc(100dvh-1rem)] w-full max-w-7xl flex-col overflow-hidden sm:my-4 sm:min-h-[calc(100dvh-2rem)]"
            >
                <div className="border-b border-white/6 bg-black/10 px-4 py-4 sm:px-7">
                    <div className="grid gap-3 [grid-template-columns:minmax(0,1fr)_auto] sm:gap-4">
                        <div className="min-w-0">
                            <span className="rv-kicker">Run Details</span>
                        </div>

                        <div className="flex shrink-0 items-center justify-self-end gap-2 self-start">
                            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                                <button
                                    type="button"
                                    onClick={() => prevActivity && onSelect?.(prevActivity)}
                                    disabled={!prevActivity}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--rv-text-dim)] transition hover:bg-white/8 hover:text-[var(--rv-text)] disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Open older run"
                                    title="Older run"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => nextActivity && onSelect?.(nextActivity)}
                                    disabled={!nextActivity}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--rv-text-dim)] transition hover:bg-white/8 hover:text-[var(--rv-text)] disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Open newer run"
                                    title="Newer run"
                                >
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rv-button-secondary inline-flex h-11 w-11 items-center justify-center"
                                aria-label="Close run details"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="col-span-2 min-w-0">
                            <div className="flex min-w-0 items-stretch gap-2 overflow-hidden">
                                <span className="rv-chip rv-chip-micro h-10 shrink-0 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" style={neutralBadgeStyle}>
                                    {formattedActivityDate}
                                </span>
                                {stats.currentShoe ? (
                                    <span className="rv-chip rv-chip-micro h-10 min-w-0 flex-1 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:flex-none sm:max-w-full" style={neutralBadgeStyle}>
                                        <ShoeBrandLogo
                                            key={stats.currentShoe.brand_name}
                                            brandName={stats.currentShoe.brand_name}
                                            size={64}
                                            className="h-6 w-6 shrink-0 object-contain opacity-90"
                                        />
                                        <span className="min-w-0 truncate">{stats.currentShoe.name}</span>
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        <div className="col-span-2 min-w-0">
                            <h1 id="run-details-title" className="rv-metric max-w-5xl text-[clamp(2.2rem,12vw,4.4rem)] text-[var(--rv-text)] [text-wrap:balance] sm:max-w-4xl">
                                {activity.name}
                            </h1>
                            <p className="rv-body-copy-sm mt-3 max-w-2xl">
                                A calmer view of this session with pacing, ranking, and nearby efforts from the same training block.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
                    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                        <div className="min-w-0 space-y-4">
                            <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricTile
                                    icon={<Gauge className="h-4 w-4" />}
                                    label="Distance"
                                    value={formatDistanceKm(activity.distance)}
                                    unit="km"
                                    accentClassName="text-[var(--rv-blue)]"
                                />
                                <MetricTile
                                    icon={<BarChart3 className="h-4 w-4" />}
                                    label="Avg pace"
                                    value={stats.avgPaceLabel}
                                    unit="/km"
                                    accentClassName="text-[var(--rv-text)]"
                                />
                                <MetricTile
                                    icon={<Flame className="h-4 w-4" />}
                                    label="Calories"
                                    value={stats.calories.toString()}
                                    unit="kcal"
                                    accentClassName="text-[var(--rv-yellow)]"
                                    detail={`${stats.foodCount} ${stats.food.name}`}
                                />
                                <MetricTile
                                    icon={<HeartPulse className="h-4 w-4" />}
                                    label="Avg heart rate"
                                    value={averageHeartrate ? averageHeartrate.toString() : 'N/A'}
                                    unit={averageHeartrate ? 'bpm' : undefined}
                                    accentClassName="text-[var(--rv-green)]"
                                    detail={activity.total_elevation_gain > 0 ? `${Math.round(activity.total_elevation_gain)}m climbed` : undefined}
                                />
                            </section>

                            {runInsightPayload.shouldShow ? (
                                <section>
                                    <AIInsightCard
                                        insightType="run-detail"
                                        payload={runInsightPayload}
                                        mostRecentActivityId={activity.id}
                                        persona={persona}
                                        useMemory
                                        activityContext={runInsightContext}
                                    />
                                </section>
                            ) : null}

                            <section className="rv-panel rv-panel-strong min-w-0 px-4 py-5 sm:px-6">
                                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <p className="rv-kicker mb-2">Performance Trace</p>
                                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">
                                            Pacing and effort
                                        </h2>
                                        <p className="rv-body-copy-sm mt-2 max-w-2xl">
                                            Switch between the smoothed pace trace and the split view to see how the run settled across distance.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setViewMode((current) => current === 'stream' ? 'splits' : 'stream')}
                                        className={`rv-chip rv-chip-compact transition ${viewMode === 'splits'
                                            ? 'border-[var(--rv-yellow)]/26 bg-[var(--rv-yellow)]/12 text-[var(--rv-yellow)]'
                                            : 'border-[var(--rv-blue)]/24 bg-[var(--rv-blue)]/10 text-[var(--rv-blue)]'
                                        }`}
                                    >
                                        {viewMode === 'splits' ? 'Splits' : 'Live Trace'}
                                    </button>
                                </div>

                                <div
                                    className="min-w-0 rounded-[1.6rem] p-3 sm:p-4"
                                    style={{
                                        border: `1px solid ${chartTheme.panelBorder}`,
                                        background: chartTheme.panelBg,
                                    }}
                                >
                                    <div className="h-72 sm:h-80">
                                        {loadingStreams ? (
                                            <div className="flex h-full items-center justify-center">
                                                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--rv-blue)]/25 border-t-[var(--rv-yellow)]" />
                                            </div>
                                        ) : chartData ? (
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            <Chart type="bar" data={chartData as any} options={chartOptions as any} />
                                        ) : (
                                            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                                                <BarChart3 className="h-8 w-8 text-[var(--rv-text-faint)]" />
                                                <p className="rv-mini-label text-[var(--rv-text)]">Performance data unavailable</p>
                                                <p className="rv-body-copy-sm max-w-sm">
                                                    Strava did not return enough stream detail for this run, so the trace view is hidden for now.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {hrChartData && heartRateSummary ? (
                                <section className="rv-panel rv-panel-strong min-w-0 px-4 py-5 sm:px-6">
                                    <div className="mb-5">
                                        <p className="rv-kicker mb-2">Effort Lens</p>
                                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">
                                            {heartRateSummary.title}
                                        </h2>
                                        <p className="rv-body-copy-sm mt-2 max-w-2xl">
                                            {heartRateSummary.description}
                                        </p>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <span className="rv-chip rv-chip-micro border-[var(--rv-green)]/20 bg-[var(--rv-green)]/10 text-[var(--rv-green)]">
                                                Avg {heartRateSummary.averageHr} bpm
                                            </span>
                                            <span className="rv-chip rv-chip-micro border-[var(--rv-yellow)]/20 bg-[var(--rv-yellow)]/10 text-[var(--rv-yellow)]">
                                                Peak {heartRateSummary.peakHr} bpm
                                            </span>
                                            <span className="rv-chip rv-chip-micro border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/10 text-[var(--rv-blue)]">
                                                Drift {heartRateSummary.driftLabel}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="min-w-0 rounded-[1.6rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] p-3 sm:p-4">
                                        <div className="h-56 sm:h-64">
                                            <Line data={hrChartData} options={hrChartOptions} />
                                        </div>
                                    </div>
                                </section>
                            ) : null}
                        </div>

                        <aside className="min-w-0 space-y-4">
                            <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                <SummaryTile
                                    label="Moving time"
                                    value={formatDuration(activity.moving_time)}
                                    icon={<ArrowRight className="h-4 w-4" />}
                                />
                                <SummaryTile
                                    label="Elevation gain"
                                    value={activity.total_elevation_gain > 0 ? `${Math.round(activity.total_elevation_gain)}m` : 'Flat route'}
                                    icon={<Mountain className="h-4 w-4" />}
                                />
                            </section>

                            <SimilarRunsPanel
                                similar={similar}
                                similarLoading={similarLoading}
                                onSelect={onSelect}
                                onOpenRun={openSimilarRun}
                            />

                            <section className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                <InsightCard
                                    kicker="Distance Rank"
                                    title={`${stats.distanceRankText} longest run`}
                                    description="Your place in the full run history by distance. The marker sits on the matching distance bucket."
                                >
                                    <div className="h-44">
                                        <RankChart
                                            labels={stats.distLabels}
                                            data={stats.distBins}
                                            highlightBin={stats.myDistBin}
                                            rankLabel={stats.distanceRankText}
                                            barColor={chartTheme.primaryFill}
                                            barBorder={chartTheme.primaryLine}
                                            badgeColor="rgb(200, 166, 107)"
                                            tickColor={chartTheme.tickColor}
                                        />
                                    </div>
                                </InsightCard>

                                <InsightCard
                                    kicker="Pace Rank"
                                    title={`${stats.paceRankText} fastest at ${stats.clusterLabel}km`}
                                    description="Compared against runs within roughly two kilometers of this session."
                                >
                                    <div className="h-44">
                                        <RankChart
                                            labels={stats.paceLabels}
                                            data={stats.paceBins}
                                            highlightBin={stats.myPaceBin}
                                            rankLabel={stats.paceRankText}
                                            barColor={chartTheme.secondaryFill}
                                            barBorder={chartTheme.secondaryLine}
                                            badgeColor="rgb(124, 156, 255)"
                                            tickColor={chartTheme.tickColor}
                                        />
                                    </div>
                                </InsightCard>
                            </section>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}
