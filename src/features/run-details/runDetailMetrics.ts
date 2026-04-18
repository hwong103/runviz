import type { Activity, ActivityStreams } from '@/types/activity';
import type { Gear } from '@/types/gear';
import { classifyRunEffort, inferRunEffortPattern, type RunEffortPattern, type RunEffortProfile } from '@/domain/insights/payloadUtils';
import { isRun } from '@/types/activity';
import { parseActivityLocalDate } from '@/utils/activityDate';

const FOOD_EQUIVALENTS = [
    { name: 'Mozzarella Sticks', cals: 100 },
    { name: 'Slices of Pizza', cals: 285 },
    { name: 'Glazed Donuts', cals: 190 },
    { name: 'Double Cheeseburgers', cals: 440 },
    { name: 'Avocado Toasts', cals: 250 },
    { name: 'Pints of Beer', cals: 210 },
] as const;

export interface RunDetailStats {
    distBins: number[];
    distLabels: number[];
    myDistBin: number;
    paceBins: number[];
    paceLabels: string[];
    myPaceBin: number;
    distanceRank: number;
    paceRank: number;
    distanceRankText: string;
    paceRankText: string;
    clusterLabel: number;
    calories: number;
    food: (typeof FOOD_EQUIVALENTS)[number];
    foodCount: string;
    avgPaceLabel: string;
    currentShoe?: Gear | null;
}

export interface RunInsightContext {
    distanceKm: number;
    paceMinPerKm: number | null;
    avgHR: number | null;
    elevationPerKm: number | null;
    movingTimeMins: number;
    runProfile: RunEffortProfile;
    effortPattern: RunEffortPattern;
}

export interface HeartRateSummary {
    title: string;
    description: string;
    averageHr: number;
    peakHr: number;
    driftLabel: string;
}

export function getOrdinal(n: number) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const value = n % 100;
    return n + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

export function formatPace(paceMinKm: number) {
    if (!paceMinKm || Number.isNaN(paceMinKm) || !Number.isFinite(paceMinKm)) return '--:--';
    const min = Math.floor(paceMinKm);
    const sec = Math.round((paceMinKm - min) * 60);
    if (sec === 60) return `${min + 1}:00`;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDistanceKm(meters: number) {
    return (meters / 1000).toFixed(2);
}

export function formatWholeKmTick(value: number | string) {
    const numericValue = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(numericValue)) return '';

    const roundedValue = Math.round(numericValue);
    return Math.abs(numericValue - roundedValue) < 0.001 ? `${roundedValue}` : '';
}

function average(values: number[]) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildRunStats(
    activity: Activity,
    runs: Activity[],
    shoes: Gear[],
    fetchedShoe: Gear | null
): RunDetailStats {
    const allDistances = runs.map((run) => run.distance / 1000);
    const maxDist = Math.ceil(Math.max(...allDistances, 1) / 2) * 2;
    const binCount = 10;
    const binSize = maxDist / binCount;

    const distBins = new Array(binCount).fill(0);
    const distLabels: number[] = [];
    for (let index = 0; index < binCount; index += 1) {
        const edge = maxDist - index * binSize;
        distLabels.push(Math.round(edge));
    }

    runs.forEach((run) => {
        const distance = run.distance / 1000;
        const index = Math.min(Math.floor((maxDist - distance) / binSize), binCount - 1);
        if (index >= 0) distBins[index] += 1;
    });

    const myDist = activity.distance / 1000;
    const myDistBin = Math.min(Math.floor((maxDist - myDist) / binSize), binCount - 1);

    const targetDist = activity.distance / 1000;
    const similarRuns = runs.filter((run) => Math.abs(run.distance / 1000 - targetDist) < 2);
    const paces = similarRuns.map((run) => (run.moving_time / run.distance) * 1000 / 60);
    const validPaces = paces.filter((pace) => !Number.isNaN(pace) && Number.isFinite(pace));

    const minPace = Math.floor(Math.min(...validPaces, 4));
    const maxPace = Math.ceil(Math.max(...validPaces, 8));
    const paceBinCount = 6;
    const paceBinSize = Math.max((maxPace - minPace) / paceBinCount, 0.1);

    const paceBins = new Array(paceBinCount).fill(0);
    const paceLabels: string[] = [];
    for (let index = 0; index < paceBinCount; index += 1) {
        paceLabels.push(formatPace(minPace + index * paceBinSize));
    }

    validPaces.forEach((pace) => {
        const bin = Math.min(Math.floor((pace - minPace) / paceBinSize), paceBinCount - 1);
        if (bin >= 0) paceBins[bin] += 1;
    });

    const myPace = (activity.moving_time / activity.distance) * 1000 / 60;
    const myPaceBin = Math.min(Math.floor((myPace - minPace) / paceBinSize), paceBinCount - 1);

    const sortedByDistance = [...runs].sort((left, right) => right.distance - left.distance);
    const distanceRank = Math.max(sortedByDistance.findIndex((run) => run.id === activity.id) + 1, 1);

    const similarSortedByPace = [...similarRuns].sort(
        (left, right) => left.moving_time / left.distance - right.moving_time / right.distance
    );
    const paceRank = Math.max(similarSortedByPace.findIndex((run) => run.id === activity.id) + 1, 1);
    const clusterLabel = Math.round(targetDist);

    const calories = activity.calories ||
        (activity.kilojoules
            ? Math.round(activity.kilojoules)
            : Math.round((activity.distance / 1000) * 70));
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
        currentShoe: shoes.find((shoe) => shoe.id === activity.gear_id) || fetchedShoe,
    };
}

export function buildRunInsightContext(
    activity: Activity,
    allActivities: Activity[] = [],
    streams: ActivityStreams | null = null,
): RunInsightContext {
    const paceMinPerKm = activity.average_speed > 0
        ? (1 / activity.average_speed) * 1000 / 60
        : null;
    const elevationPerKm = activity.total_elevation_gain > 0 && activity.distance > 0
        ? (activity.total_elevation_gain / activity.distance) * 1000
        : null;
    const anchorDate = parseActivityLocalDate(activity.start_date_local);
    const recentRuns = allActivities
        .filter((candidate) => isRun(candidate) && candidate.id !== activity.id)
        .filter((candidate) => {
            const date = parseActivityLocalDate(candidate.start_date_local);
            const diffMs = Math.abs(anchorDate.getTime() - date.getTime());
            return diffMs <= 90 * 86400000;
        });
    const referencePaces = recentRuns
        .filter((candidate) => candidate.average_speed > 0)
        .map((candidate) => (1 / candidate.average_speed) * 1000 / 60)
        .filter((pace) => Number.isFinite(pace) && pace > 0);
    const referencePace = referencePaces.length > 0
        ? referencePaces.reduce((sum, pace) => sum + pace, 0) / referencePaces.length
        : paceMinPerKm;

    return {
        distanceKm: activity.distance / 1000,
        paceMinPerKm,
        avgHR: activity.average_heartrate ?? null,
        elevationPerKm,
        movingTimeMins: activity.moving_time / 60,
        runProfile: classifyRunEffort(activity, referencePace ?? null),
        effortPattern: inferRunEffortPattern(streams),
    };
}

export function buildHeartRateSummary(streams: ActivityStreams | null): HeartRateSummary | null {
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
}
