import { useMemo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    type ChartOptions,
    type Plugin,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Chart, Line } from 'react-chartjs-2';
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
import type { Activity, ActivityStreams, Gear } from '../types';
import { isRun } from '../types';
import { format } from 'date-fns';
import { activities as activitiesApi, gear as gearApi } from '../services/api';
import type { SimilarRunResult } from '../services/api';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSimilarRuns } from '../hooks/useSimilarRuns';
import { getBrandLogoUrl, getBrandFallbackEmoji } from '../services/logoService';
import { parseActivityLocalDate } from '../utils/activityDate';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { buildRunDetailPayload } from '@/utils/insightPayloads';

// Brand logo component with fallback support
function BrandLogo({ brandName, className }: { brandName?: string; className?: string }) {
    const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
    const logoUrl = getBrandLogoUrl(brandName, 48, 'dark');
    const fallbackEmoji = getBrandFallbackEmoji(brandName);

    if (!logoUrl || failedLogoUrl === logoUrl) {
        return (
            <span className={`${className} inline-flex items-center justify-center rounded-md bg-white/5 px-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--rv-text-faint)] leading-none`}>
                {fallbackEmoji}
            </span>
        );
    }

    return (
        <img
            src={logoUrl}
            alt={brandName || 'Brand'}
            className={`${className} block w-5 h-5 object-contain`}
            onError={() => setFailedLogoUrl(logoUrl)}
        />
    );
}

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

interface RunDetailsProps {
    activity: Activity;
    allActivities: Activity[];
    shoes: Gear[];
    onClose: () => void;
    onSelect?: (activity: Activity) => void;
}

const FOOD_EQUIVALENTS = [
    { name: 'Mozzarella Sticks', cals: 100 },
    { name: 'Slices of Pizza', cals: 285 },
    { name: 'Glazed Donuts', cals: 190 },
    { name: 'Double Cheeseburgers', cals: 440 },
    { name: 'Avocado Toasts', cals: 250 },
    { name: 'Pints of Beer', cals: 210 },
];

function getOrdinal(n: number) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatPace(paceMinKm: number) {
    if (!paceMinKm || isNaN(paceMinKm) || !isFinite(paceMinKm)) return '--:--';
    const min = Math.floor(paceMinKm);
    const sec = Math.round((paceMinKm - min) * 60);
    if (sec === 60) return `${min + 1}:00`;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDistanceKm(meters: number) {
    return (meters / 1000).toFixed(2);
}

function formatWholeKmTick(value: number | string) {
    const numericValue = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(numericValue)) return '';

    const roundedValue = Math.round(numericValue);
    return Math.abs(numericValue - roundedValue) < 0.001 ? `${roundedValue}` : '';
}

function average(values: number[]) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function RunDetails({ activity: initialActivity, allActivities, shoes, onClose, onSelect }: RunDetailsProps) {
    // Reset internal state when ID changes (navigation)
    const [activity, setActivity] = useState<Activity>(initialActivity);
    useEffect(() => { setActivity(initialActivity); }, [initialActivity]);

    const [streams, setStreams] = useState<ActivityStreams | null>(null);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [viewMode, setViewMode] = useState<'stream' | 'splits'>('stream');
    const [fetchedShoe, setFetchedShoe] = useState<Gear | null>(null);
    const chartTheme = useChartTheme();

    // Navigation Logic
    const currentIndex = allActivities.findIndex(a => a.id === initialActivity.id);
    const hasNext = currentIndex > 0;
    const hasPrev = currentIndex < allActivities.length - 1;

    // Previous in list = Older date (higher index)
    // Next in list = Newer date (lower index)
    // BUT typically users expect "Left" = Previous (Older) and "Right" = Next (Newer)
    // Let's stick to chronological: "Prev" takes you to the older run, "Next" to newer.
    const prevActivity = hasPrev ? allActivities[currentIndex + 1] : null;
    const nextActivity = hasNext ? allActivities[currentIndex - 1] : null;

    // Fetch gear details if they are missing from props
    useEffect(() => {
        if (!activity.gear_id) return;

        const knownShoe = shoes.find(s => s.id === activity.gear_id);
        if (knownShoe) return;

        // Valid gear ID but not in props? Fetch it!
        // Strava gear IDs usually start with 'g' or 's' (shoes/gear)
        if (activity.gear_id.startsWith('g') || activity.gear_id.startsWith('s')) {
            gearApi.get(activity.gear_id)
                .then(setFetchedShoe)
                .catch(err => console.error("Failed to fetch gear", err));
        }
    }, [activity.gear_id, shoes]);

    useEffect(() => {
        const fetchData = async () => {
            setLoadingStreams(true);
            try {
                const fullActivity = await activitiesApi.get(initialActivity.id);
                if (fullActivity) setActivity(fullActivity);
                const streamData = await activitiesApi.getStreams(initialActivity.id);
                setStreams(streamData);
            } catch (err) {
                console.error("Failed to fetch detailed activity data:", err);
            } finally {
                setLoadingStreams(false);
            }
        };
        fetchData();
    }, [initialActivity.id]);

    const runs = useMemo(() =>
        allActivities.filter(isRun)
            .sort((a, b) => parseActivityLocalDate(b.start_date_local).getTime() - parseActivityLocalDate(a.start_date_local).getTime())
        , [allActivities]);

    const activityDate = useMemo(() => parseActivityLocalDate(activity.start_date_local), [activity.start_date_local]);

    const stats = useMemo(() => {
        // --- LONG DISTANCE HISTOGRAM ---
        const allDistances = runs.map(r => r.distance / 1000);
        const maxDist = Math.ceil(Math.max(...allDistances, 1) / 2) * 2;
        const binCount = 10;
        const binSize = maxDist / binCount;

        const distBins = new Array(binCount).fill(0);
        const distLabels = [];
        for (let i = 0; i < binCount; i++) {
            const edge = maxDist - (i * binSize);
            distLabels.push(Math.round(edge));
        }

        runs.forEach(r => {
            const d = r.distance / 1000;
            const index = Math.min(Math.floor((maxDist - d) / binSize), binCount - 1);
            if (index >= 0) distBins[index]++;
        });

        const myDist = activity.distance / 1000;
        const myDistBin = Math.min(Math.floor((maxDist - myDist) / binSize), binCount - 1);

        // --- PACE HISTOGRAM ---
        const targetDist = activity.distance / 1000;
        const similarRuns = runs.filter(r => Math.abs(r.distance / 1000 - targetDist) < 2);
        const paces = similarRuns.map(r => (r.moving_time / r.distance) * 1000 / 60);
        const validPaces = paces.filter(p => !isNaN(p) && isFinite(p));

        const minPace = Math.floor(Math.min(...validPaces, 4));
        const maxPace = Math.ceil(Math.max(...validPaces, 8));
        const paceBinCount = 6;
        const paceBinSize = Math.max((maxPace - minPace) / paceBinCount, 0.1);

        const paceBins = new Array(paceBinCount).fill(0);
        const paceLabels = [];
        for (let i = 0; i < paceBinCount; i++) {
            const p = minPace + (i * paceBinSize);
            paceLabels.push(formatPace(p));
        }

        validPaces.forEach(p => {
            const bin = Math.min(Math.floor((p - minPace) / paceBinSize), paceBinCount - 1);
            if (bin >= 0) paceBins[bin]++;
        });

        const myPace = (activity.moving_time / activity.distance) * 1000 / 60;
        const myPaceBin = Math.min(Math.floor((myPace - minPace) / paceBinSize), paceBinCount - 1);

        const sortedByDistance = [...runs].sort((a, b) => b.distance - a.distance);
        const distanceRank = Math.max(sortedByDistance.findIndex(a => a.id === activity.id) + 1, 1);

        const similarSortedByPace = [...similarRuns].sort((a, b) => (a.moving_time / a.distance) - (b.moving_time / b.distance));
        const paceRank = Math.max(similarSortedByPace.findIndex(a => a.id === activity.id) + 1, 1);
        const clusterLabel = Math.round(targetDist);

        const calories = activity.calories || (activity.kilojoules ? Math.round(activity.kilojoules) : Math.round((activity.distance / 1000) * 70)); // 70 is a rough default for kcal/km
        // Use activity.id as a seed to keep food choice consistent for the same run
        const food = FOOD_EQUIVALENTS[activity.id % FOOD_EQUIVALENTS.length];
        const foodCount = (calories / food.cals).toFixed(1);

        return {
            distBins,
            distLabels,
            myDistBin,
            paceBins,
            paceLabels,
            myPaceBin,
            distanceRank,
            paceRank,
            distanceRankText: getOrdinal(distanceRank),
            paceRankText: getOrdinal(paceRank),
            clusterLabel,
            calories,
            food,
            foodCount,
            avgPaceLabel: formatPace((activity.moving_time / activity.distance) * 1000 / 60),
            currentShoe: shoes.find(s => s.id === activity.gear_id) || fetchedShoe
        };
    }, [activity, runs, shoes, fetchedShoe]);

    const averageHeartrate = activity.average_heartrate ? Math.round(activity.average_heartrate) : null;
    const runInsightPayload = useMemo(() => buildRunDetailPayload(activity, allActivities), [activity, allActivities]);
    const runInsightContext = useMemo(() => {
        const paceMinPerKm = activity.average_speed > 0
            ? (1 / activity.average_speed) * 1000 / 60
            : null;
        const elevationPerKm = activity.total_elevation_gain > 0 && activity.distance > 0
            ? (activity.total_elevation_gain / activity.distance) * 1000
            : null;

        return {
            distanceKm: activity.distance / 1000,
            paceMinPerKm,
            avgHR: activity.average_heartrate ?? null,
            elevationPerKm,
            movingTimeMins: activity.moving_time / 60,
            runProfile: 'unknown' as const,
        };
    }, [activity]);
    const { similar, loading: similarLoading } = useSimilarRuns({
        activityId: activity.id,
        distanceKm: runInsightContext.distanceKm,
        paceMinPerKm: runInsightContext.paceMinPerKm,
        avgHR: runInsightContext.avgHR,
        elevationPerKm: runInsightContext.elevationPerKm,
        movingTimeMins: runInsightContext.movingTimeMins,
        runProfile: runInsightContext.runProfile,
        enabled: true,
    });
    const distanceAxisMax = useMemo(() => Math.max(1, Math.ceil(activity.distance / 1000)), [activity.distance]);
    const heartRateSummary = useMemo(() => {
        const hrSamples = streams?.heartrate?.data?.filter((hr): hr is number => hr > 0) ?? [];
        if (hrSamples.length === 0) {
            return null;
        }

        const sampleWindow = Math.max(3, Math.floor(hrSamples.length / 3));
        const openingAverage = Math.round(average(hrSamples.slice(0, sampleWindow)));
        const closingAverage = Math.round(average(hrSamples.slice(-sampleWindow)));
        const averageHr = Math.round(average(hrSamples));
        const peakHr = Math.round(Math.max(...hrSamples));
        const drift = closingAverage - openingAverage;

        if (drift >= 8) {
            return {
                title: 'Late-run drift',
                description: `Your effort climbed from ${openingAverage} bpm early to ${closingAverage} bpm late, a +${drift} bpm rise that points to a harder finish or accumulating fatigue.`,
                averageHr,
                peakHr,
                driftLabel: `+${drift} bpm`,
            };
        }

        if (drift <= -6) {
            return {
                title: 'Settled after the start',
                description: `Your heart rate eased from ${openingAverage} bpm early to ${closingAverage} bpm later, which usually means the effort came under control as the run progressed.`,
                averageHr,
                peakHr,
                driftLabel: `${drift} bpm`,
            };
        }

        return {
            title: 'Steady effort profile',
            description: `Your heart rate held fairly even from ${openingAverage} bpm to ${closingAverage} bpm, with a peak of ${peakHr} bpm instead of a big late spike.`,
            averageHr,
            peakHr,
            driftLabel: `${drift > 0 ? '+' : ''}${drift} bpm`,
        };
    }, [streams?.heartrate?.data]);

    const chartData = useMemo(() => {
        if (!streams?.velocity_smooth?.data || !streams.distance?.data) return null;

        if (viewMode === 'splits') {
            const splits = [];
            let currentSplitDist = 0;
            let currentSplitTime = 0;
            let currentSplitHR = 0;
            let hrCount = 0;
            let lastDist = 0;
            let lastTime = 0;

            for (let i = 0; i < streams.distance.data.length; i++) {
                const d = streams.distance.data[i];
                const t = streams.time?.data[i] || 0;
                const hr = streams.heartrate?.data[i];

                currentSplitDist += (d - lastDist);
                currentSplitTime += (t - lastTime);
                if (hr) {
                    currentSplitHR += hr;
                    hrCount++;
                }

                if (currentSplitDist >= 1000 || i === streams.distance.data.length - 1) {
                    const pace = (currentSplitTime / currentSplitDist) * 1000 / 60;
                    splits.push({
                        distance: Math.round(d / 1000),
                        pace,
                        hr: hrCount > 0 ? Math.round(currentSplitHR / hrCount) : null
                    });
                    currentSplitDist = 0;
                    currentSplitTime = 0;
                    currentSplitHR = 0;
                    hrCount = 0;
                }
                lastDist = d;
                lastTime = t;
            }

            return {
                labels: splits.map(s => s.distance.toString()),
                datasets: [
                    {
                        type: 'bar' as const,
                        label: 'Pace',
                        data: splits.map(s => s.pace),
                        backgroundColor: chartTheme.primaryFill,
                        hoverBackgroundColor: chartTheme.accentBg,
                        borderColor: chartTheme.primaryLine,
                        borderWidth: 1,
                        borderRadius: 10,
                        yAxisID: 'y',
                        base: Math.ceil(Math.max(...splits.map(s => s.pace), 8)) + 1,
                    },
                    {
                        type: 'line' as const,
                        label: 'Heart Rate',
                        data: splits.map(s => s.hr),
                        borderColor: chartTheme.secondaryLine,
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.28,
                        pointRadius: 4,
                        pointBackgroundColor: chartTheme.secondaryLine,
                        borderWidth: 2,
                        yAxisID: 'y1',
                    }
                ],
                paces: splits.map(s => s.pace)
            };
        } else {
            const rawPoints = streams.velocity_smooth.data.length;
            const step = Math.max(1, Math.floor(rawPoints / 120));
            const velocityData: number[] = [];
            const hrData: Array<number | null> = [];
            const distances: number[] = [];

            for (let i = 0; i < rawPoints; i += step) {
                const dist = streams.distance.data[i];
                const speed = streams.velocity_smooth.data[i];
                const hr = streams.heartrate?.data ? streams.heartrate.data[i] : null;

                if (speed <= 0.5) continue;
                const pace = (1 / speed) * 1000 / 60;
                if (pace > 15) continue;

                velocityData.push(pace);
                hrData.push(hr);
                distances.push(dist / 1000);
            }

            return {
                datasets: [
                    {
                        type: 'bar' as const,
                        label: 'Pace',
                        data: velocityData.map((pace, index) => ({ x: distances[index], y: pace })),
                        backgroundColor: chartTheme.primaryFill,
                        hoverBackgroundColor: chartTheme.accentBg,
                        borderColor: chartTheme.primaryLine,
                        borderWidth: 1,
                        borderRadius: 6,
                        barPercentage: 1.0,
                        categoryPercentage: 1.0,
                        yAxisID: 'y',
                        base: Math.ceil(Math.max(...velocityData, 8)) + 1,
                    },
                    {
                        type: 'line' as const,
                        label: 'Heart Rate',
                        data: hrData.map((hr, index) => ({ x: distances[index], y: hr })),
                        borderColor: chartTheme.secondaryLine,
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0,
                        borderWidth: 2,
                        yAxisID: 'y1',
                    }
                ],
                paces: velocityData
            };
        }
    }, [chartTheme, streams, viewMode]);

    const hrChartData = useMemo(() => {
        if (!streams?.heartrate?.data || !streams.distance?.data) return null;

        const rawPoints = streams.heartrate.data.length;
        const step = Math.max(1, Math.floor(rawPoints / 120));
        const hrData: number[] = [];
        const distances: number[] = [];

        for (let i = 0; i < rawPoints; i += step) {
            const dist = streams.distance.data[i];
            const hr = streams.heartrate.data[i];

            if (!hr || hr <= 0) continue;

            hrData.push(hr);
            distances.push(dist / 1000);
        }

        return {
            datasets: [{
                type: 'line' as const,
                label: 'Heart Rate',
                data: hrData.map((hr, index) => ({ x: distances[index], y: hr })),
                borderColor: chartTheme.secondaryLine,
                backgroundColor: chartTheme.secondaryFill,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 2,
            }]
        };
    }, [chartTheme, streams]);

    const hrChartOptions = useMemo<ChartOptions<'line'>>(() => {
        if (!hrChartData) return {};

        const hrValues = streams?.heartrate?.data?.filter((hr): hr is number => hr > 0) ?? [];
        const minHr = hrValues.length > 0 ? Math.min(...hrValues) : 0;
        const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : 200;
        const hrMin = Math.max(0, Math.floor(minHr) - 10);
        const hrMax = Math.ceil(maxHr) + 10;

        return {
            maintainAspectRatio: false,
            layout: { padding: { left: 12, right: 12, top: 16, bottom: 0 } },
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: chartTheme.tooltipBg,
                    borderColor: chartTheme.tooltipBorder,
                    borderWidth: 1,
                    titleColor: chartTheme.tooltipTitle,
                    bodyColor: chartTheme.tooltipBody,
                    titleFont: { size: 11, weight: 'bold' as const },
                    bodyFont: { size: 11 },
                    padding: 12,
                    callbacks: {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        label: (context: any) => `${context.dataset.label || ''}: ${Math.round(context.parsed.y)} bpm`,
                    },
                },
            },
            scales: {
                x: {
                    type: 'linear' as const,
                    display: true,
                    min: 0,
                    max: distanceAxisMax,
                    title: { display: true, text: 'Distance (km)', color: chartTheme.axisColor, font: { size: 10, weight: 'bold' } },
                    ticks: {
                        color: chartTheme.tickColor,
                        font: { size: 10, weight: 'bold' },
                        stepSize: 1,
                        callback: (value: number | string) => formatWholeKmTick(value),
                    },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Heart Rate (bpm)', color: chartTheme.axisColor, font: { size: 10, weight: 'bold' } },
                    min: hrMin,
                    max: hrMax,
                    ticks: { color: chartTheme.tickColor, font: { size: 10, weight: 'bold' } },
                    grid: { color: chartTheme.gridColor },
                },
            },
        };
    }, [chartTheme, distanceAxisMax, hrChartData, streams?.heartrate?.data]);

    const chartOptions = useMemo(() => {
        if (!chartData) return {};
        const paces = chartData.paces.filter(p => !isNaN(p) && isFinite(p));
        const minPaceFound = Math.min(...paces);
        const maxPaceFound = Math.max(...paces);
        const paceMin = Math.max(0, Math.floor(minPaceFound) - 1);
        const paceMax = Math.ceil(maxPaceFound) + 1;

        return {
            maintainAspectRatio: false,
            layout: { padding: { left: 12, right: 12, top: 16, bottom: 0 } },
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: chartTheme.tooltipBg,
                    borderColor: chartTheme.tooltipBorder,
                    borderWidth: 1,
                    titleColor: chartTheme.tooltipTitle,
                    bodyColor: chartTheme.tooltipBody,
                    titleFont: { size: 11, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 12,
                    callbacks: {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        label: (context: any) => {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.yAxisID === 'y') label += formatPace(context.parsed.y);
                            else label += Math.round(context.parsed.y) + ' bpm';
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: viewMode === 'stream' ? 'linear' : 'category',
                    display: true,
                    min: viewMode === 'stream' ? 0 : undefined,
                    max: viewMode === 'stream' ? distanceAxisMax : undefined,
                    grid: { color: chartTheme.gridColor },
                    border: { display: false },
                    ticks: {
                        color: chartTheme.tickColor,
                        font: { size: 10, weight: 'bold' },
                        stepSize: viewMode === 'stream' ? 1 : undefined,
                        maxTicksLimit: viewMode === 'stream' ? distanceAxisMax + 1 : 12,
                        callback: (value: number | string) => viewMode === 'stream' ? formatWholeKmTick(value) : value,
                    },
                    title: { display: true, text: 'KILOMETERS', color: chartTheme.axisColor, font: { size: 10, weight: 'bold' }, padding: { top: 10 } }
                },
                y: {
                    reverse: true,
                    position: 'left' as const,
                    min: paceMin,
                    max: paceMax,
                    grid: { color: chartTheme.gridColor, drawTicks: false },
                    border: { display: false },
                    ticks: { color: chartTheme.tickColor, font: { size: 10, weight: 'bold' }, padding: 10, callback: (value: number | string) => formatPace(typeof value === 'string' ? parseFloat(value) : value) },
                    title: { display: true, text: 'PACE', color: chartTheme.axisColor, font: { size: 10, weight: 'bold' }, padding: { bottom: 10 } }
                },
                y1: {
                    position: 'right' as const,
                    grid: { display: false },
                    min: 80,
                    max: 200,
                    border: { display: false },
                    ticks: { color: chartTheme.tickColor, font: { size: 10, weight: 'bold' }, padding: 10 },
                    title: { display: true, text: 'HEART RATE', color: chartTheme.axisColor, font: { size: 10, weight: 'bold' }, padding: { bottom: 10 } }
                }
            }
        };
    }, [chartData, chartTheme, distanceAxisMax, viewMode]);

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[color-mix(in_srgb,var(--rv-bg)_90%,transparent)] p-4 backdrop-blur-xl">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="run-details-title"
                className="rv-shell-card mx-auto my-4 flex min-h-[calc(100dvh-2rem)] w-full max-w-7xl flex-col overflow-hidden"
            >
                <div className="border-b border-white/6 bg-black/10 px-5 py-4 sm:px-7">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className="rv-kicker">Run Details</span>
                                <span className="rv-chip rv-chip-micro border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/10 text-[var(--rv-blue)]">
                                    {format(activityDate, 'eeee, d MMM y')}
                                </span>
                                {stats.currentShoe && (
                                    <span className="rv-chip rv-chip-micro max-w-full border-[var(--rv-green)]/20 bg-[var(--rv-green)]/10 text-[var(--rv-green)]">
                                        <BrandLogo key={stats.currentShoe.brand_name} brandName={stats.currentShoe.brand_name} className="shrink-0" />
                                        <span className="truncate">{stats.currentShoe.name}</span>
                                    </span>
                                )}
                            </div>
                            <h1 id="run-details-title" className="rv-metric max-w-4xl text-[clamp(2.7rem,5vw,4.4rem)] text-[var(--rv-text)]">
                                {activity.name}
                            </h1>
                            <p className="rv-body-copy-sm mt-3 max-w-2xl">
                                A calmer view of this session with pacing, ranking, and nearby efforts from the same training block.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                        <div className="space-y-4">
                            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

                            {runInsightPayload.shouldShow && (
                                <section>
                                    <AIInsightCard
                                        insightType="run-detail"
                                        payload={runInsightPayload}
                                        mostRecentActivityId={activity.id}
                                        useMemory
                                        activityContext={runInsightContext}
                                    />
                                </section>
                            )}

                            <section className="rv-panel rv-panel-strong px-5 py-5 sm:px-6">
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
                                        onClick={() => setViewMode(v => v === 'stream' ? 'splits' : 'stream')}
                                        className={`rv-chip rv-chip-compact transition ${viewMode === 'splits'
                                            ? 'border-[var(--rv-yellow)]/26 bg-[var(--rv-yellow)]/12 text-[var(--rv-yellow)]'
                                            : 'border-[var(--rv-blue)]/24 bg-[var(--rv-blue)]/10 text-[var(--rv-blue)]'
                                            }`}
                                    >
                                        {viewMode === 'splits' ? 'Splits' : 'Live Trace'}
                                    </button>
                                </div>

                                <div
                                    className="rounded-[1.6rem] p-3 sm:p-4"
                                    style={{ border: `1px solid ${chartTheme.panelBorder}`, background: chartTheme.panelBg }}
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

                            {hrChartData && heartRateSummary && (
                                <section className="rv-panel rv-panel-strong px-5 py-5 sm:px-6">
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

                                    <div
                                        className="rounded-[1.6rem] p-3 sm:p-4"
                                        style={{ border: `1px solid ${chartTheme.panelBorder}`, background: chartTheme.panelBg }}
                                    >
                                        <div className="h-56 sm:h-64">
                                            <Line data={hrChartData} options={hrChartOptions} />
                                        </div>
                                    </div>
                                </section>
                            )}

                        </div>

                        <aside className="space-y-4">
                            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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

                            {(similarLoading || similar.length > 0) && (
                                <section className="rv-panel rv-panel-strong px-5 py-5 sm:px-6">
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
                                                    allActivities={allActivities}
                                                    onSelect={onSelect}
                                                />
                                            ))
                                        )}
                                    </div>
                                </section>
                            )}

                            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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

function SimilarRunCard({
    run,
    allActivities,
    onSelect,
}: {
    run: SimilarRunResult;
    allActivities: Activity[];
    onSelect?: (activity: Activity) => void;
}) {
    const matchedActivity = allActivities.find((activity) => Number(activity.id) === Number(run.stravaId));
    const formattedPace = run.paceMinPerKm
        ? `${Math.floor(run.paceMinPerKm)}:${String(Math.round((run.paceMinPerKm % 1) * 60)).padStart(2, '0')}/km`
        : null;
    const formattedDate = new Date(`${run.activityDate}T12:00:00`).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    const handleClick = async () => {
        if (!onSelect) {
            return;
        }

        if (matchedActivity) {
            onSelect(matchedActivity);
            return;
        }

        try {
            const activity = await activitiesApi.get(Number(run.stravaId));
            onSelect(activity);
        } catch (error) {
            console.error('Failed to open similar run:', error);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
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
                {formattedPace && (
                    <span className="text-sm text-[var(--rv-text-dim)]">{formattedPace}</span>
                )}
                {run.avgHR && (
                    <span className="text-sm text-[var(--rv-text-faint)]">{run.avgHR} bpm</span>
                )}
            </div>
        </button>
    );
}

function RankChart({
    labels,
    data,
    highlightBin,
    rankLabel,
    barColor,
    barBorder,
    badgeColor,
    tickColor,
}: {
    labels: Array<string | number>;
    data: number[];
    highlightBin: number;
    rankLabel: string;
    barColor: string;
    barBorder: string;
    badgeColor: string;
    tickColor: string;
}) {
    const badgePlugin = useMemo<Plugin<'bar'>>(() => ({
        id: 'rankBadge',
        afterDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            const bar = meta.data[highlightBin];
            if (!bar) return;

            const ctx = chart.ctx;
            const x = bar.x;
            const y = bar.y - 8;
            const fontSize = 12;
            const paddingH = 10;
            const paddingV = 5;

            ctx.save();
            ctx.font = `600 ${fontSize}px sans-serif`;

            const textWidth = ctx.measureText(rankLabel).width;
            const rectW = textWidth + paddingH * 2;
            const rectH = fontSize + paddingV * 2;
            const rectX = x - rectW / 2;
            const rectY = y - rectH;
            const radius = rectH / 2;

            ctx.beginPath();
            ctx.moveTo(rectX + radius, rectY);
            ctx.lineTo(rectX + rectW - radius, rectY);
            ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
            ctx.lineTo(rectX + rectW, rectY + rectH - radius);
            ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
            ctx.lineTo(rectX + radius, rectY + rectH);
            ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
            ctx.lineTo(rectX, rectY + radius);
            ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
            ctx.closePath();

            ctx.strokeStyle = badgeColor.replace('rgb(', 'rgba(').replace(')', ', 0.3)');
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = badgeColor.replace('rgb(', 'rgba(').replace(')', ', 0.12)');
            ctx.fill();

            ctx.fillStyle = badgeColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rankLabel, x, rectY + rectH / 2);
            ctx.restore();
        },
    }), [highlightBin, rankLabel, badgeColor]);

    return (
        <Bar
            data={{
                labels,
                datasets: [{
                    data,
                    backgroundColor: barColor,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: barBorder,
                }],
            }}
            options={{
                maintainAspectRatio: false,
                layout: { padding: { top: 36, left: 10, right: 10, bottom: 0 } },
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    y: { display: false },
                    x: {
                        display: true,
                        ticks: { color: tickColor, font: { size: 9, weight: 'bold' } },
                        grid: { display: false },
                        border: { display: false },
                    },
                },
            }}
            plugins={[badgePlugin]}
        />
    );
}

function MetricTile({
    icon,
    label,
    value,
    unit,
    accentClassName,
    detail,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    unit?: string;
    accentClassName?: string;
    detail?: string;
}) {
    return (
        <div className="rv-subtle-card px-4 py-4">
            <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rv-mini-label text-[var(--rv-text-faint)]">{label}</span>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] ${accentClassName || 'text-[var(--rv-text-dim)]'}`}>
                    {icon}
                </span>
            </div>
            <div className={`rv-data text-[2rem] ${accentClassName || 'text-[var(--rv-text)]'}`}>
                {value}
                {unit && <span className="ml-1 text-sm font-semibold text-[var(--rv-text-faint)]">{unit}</span>}
            </div>
            {detail && <p className="rv-body-copy-sm mt-2">{detail}</p>}
        </div>
    );
}

function InsightCard({
    kicker,
    title,
    description,
    children,
}: {
    kicker: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="rv-panel px-5 py-5 sm:px-6">
            <p className="rv-kicker mb-2">{kicker}</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">{title}</h2>
            <p className="rv-body-copy-sm mt-2 mb-4 max-w-xl">{description}</p>
            <div className="rounded-[1.5rem] border border-white/[0.06] bg-black/[0.12] p-3 sm:p-4">
                {children}
            </div>
        </section>
    );
}

function SummaryTile({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: ReactNode;
}) {
    return (
        <div className="rv-subtle-card flex items-center gap-4 px-4 py-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[var(--rv-yellow)]">
                {icon}
            </span>
            <div>
                <div className="rv-mini-label text-[var(--rv-text-faint)]">{label}</div>
                <div className="mt-1 text-base font-semibold tracking-[-0.02em] text-[var(--rv-text)]">{value}</div>
            </div>
        </div>
    );
}
