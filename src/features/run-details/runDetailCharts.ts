import type { ChartData, ChartOptions } from 'chart.js';

import type { ChartTheme } from '@/hooks/useChartTheme';
import type { ActivityStreams } from '@/types/activity';

import { formatPace, formatWholeKmTick } from './runDetailMetrics';

export interface PerformanceChartData {
    labels?: string[];
    datasets: Array<Record<string, unknown>>;
    paces: number[];
}

export type HeartRateChartData = ChartData<'line', { x: number; y: number }[], number>;

export function buildPerformanceChartData(
    streams: ActivityStreams | null,
    viewMode: 'stream' | 'splits',
    chartTheme: ChartTheme
): PerformanceChartData | null {
    if (!streams?.velocity_smooth?.data || !streams.distance?.data) return null;

    if (viewMode === 'splits') {
        const splits: Array<{ distance: number; pace: number; hr: number | null }> = [];
        let currentSplitDist = 0;
        let currentSplitTime = 0;
        let currentSplitHR = 0;
        let hrCount = 0;
        let lastDist = 0;
        let lastTime = 0;

        for (let index = 0; index < streams.distance.data.length; index += 1) {
            const distance = streams.distance.data[index];
            const time = streams.time?.data[index] || 0;
            const hr = streams.heartrate?.data[index];

            currentSplitDist += distance - lastDist;
            currentSplitTime += time - lastTime;

            if (hr) {
                currentSplitHR += hr;
                hrCount += 1;
            }

            if (currentSplitDist >= 1000 || index === streams.distance.data.length - 1) {
                const pace = (currentSplitTime / currentSplitDist) * 1000 / 60;
                splits.push({
                    distance: Math.round(distance / 1000),
                    pace,
                    hr: hrCount > 0 ? Math.round(currentSplitHR / hrCount) : null,
                });
                currentSplitDist = 0;
                currentSplitTime = 0;
                currentSplitHR = 0;
                hrCount = 0;
            }

            lastDist = distance;
            lastTime = time;
        }

        return {
            labels: splits.map((split) => split.distance.toString()),
            datasets: [
                {
                    type: 'bar' as const,
                    label: 'Pace',
                    data: splits.map((split) => split.pace),
                    backgroundColor: chartTheme.primaryFill,
                    hoverBackgroundColor: chartTheme.accentBg,
                    borderColor: chartTheme.primaryLine,
                    borderWidth: 1,
                    borderRadius: 10,
                    yAxisID: 'y',
                    base: Math.ceil(Math.max(...splits.map((split) => split.pace), 8)) + 1,
                },
                {
                    type: 'line' as const,
                    label: 'Heart Rate',
                    data: splits.map((split) => split.hr),
                    borderColor: chartTheme.secondaryLine,
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.28,
                    pointRadius: 4,
                    pointBackgroundColor: chartTheme.secondaryLine,
                    borderWidth: 2,
                    yAxisID: 'y1',
                },
            ],
            paces: splits.map((split) => split.pace),
        };
    }

    const rawPoints = streams.velocity_smooth.data.length;
    const step = Math.max(1, Math.floor(rawPoints / 120));
    const velocityData: number[] = [];
    const hrData: Array<number | null> = [];
    const distances: number[] = [];

    for (let index = 0; index < rawPoints; index += step) {
        const distance = streams.distance.data[index];
        const speed = streams.velocity_smooth.data[index];
        const hr = streams.heartrate?.data ? streams.heartrate.data[index] : null;

        if (speed <= 0.5) continue;
        const pace = (1 / speed) * 1000 / 60;
        if (pace > 15) continue;

        velocityData.push(pace);
        hrData.push(hr);
        distances.push(distance / 1000);
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
                barPercentage: 1,
                categoryPercentage: 1,
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
            },
        ],
        paces: velocityData,
    };
}

export function buildHeartRateChartData(
    streams: ActivityStreams | null,
    chartTheme: ChartTheme
): HeartRateChartData | null {
    if (!streams?.heartrate?.data || !streams.distance?.data) return null;

    const rawPoints = streams.heartrate.data.length;
    const step = Math.max(1, Math.floor(rawPoints / 120));
    const hrData: number[] = [];
    const distances: number[] = [];

    for (let index = 0; index < rawPoints; index += step) {
        const distance = streams.distance.data[index];
        const hr = streams.heartrate.data[index];

        if (!hr || hr <= 0) continue;

        hrData.push(hr);
        distances.push(distance / 1000);
    }

    return {
        datasets: [
            {
                type: 'line' as const,
                label: 'Heart Rate',
                data: hrData.map((hr, index) => ({ x: distances[index], y: hr })),
                borderColor: chartTheme.secondaryLine,
                backgroundColor: chartTheme.secondaryFill,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 2,
            },
        ],
    };
}

export function buildHeartRateChartOptions(
    chartTheme: ChartTheme,
    distanceAxisMax: number,
    hrValues: number[]
): ChartOptions<'line'> {
    const minHr = hrValues.length > 0 ? Math.min(...hrValues) : 0;
    const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : 200;
    const hrMin = Math.max(0, Math.floor(minHr) - 10);
    const hrMax = Math.ceil(maxHr) + 10;

    return {
        maintainAspectRatio: false,
        layout: { padding: { left: 12, right: 12, top: 16, bottom: 0 } },
        interaction: { mode: 'index', intersect: false },
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
                    label: (context: any) => `${context.dataset.label || ''}: ${Math.round(context.parsed.y)} bpm`,
                },
            },
        },
        scales: {
            x: {
                type: 'linear',
                display: true,
                min: 0,
                max: distanceAxisMax,
                title: {
                    display: true,
                    text: 'Distance (km)',
                    color: chartTheme.axisColor,
                    font: { size: 10, weight: 'bold' },
                },
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
                title: {
                    display: true,
                    text: 'Heart Rate (bpm)',
                    color: chartTheme.axisColor,
                    font: { size: 10, weight: 'bold' },
                },
                min: hrMin,
                max: hrMax,
                ticks: {
                    color: chartTheme.tickColor,
                    font: { size: 10, weight: 'bold' },
                },
                grid: { color: chartTheme.gridColor },
            },
        },
    };
}

export function buildPerformanceChartOptions(
    chartData: PerformanceChartData,
    chartTheme: ChartTheme,
    distanceAxisMax: number,
    viewMode: 'stream' | 'splits'
): ChartOptions<'bar'> {
    const paces = chartData.paces.filter((pace) => !Number.isNaN(pace) && Number.isFinite(pace));
    const minPaceFound = Math.min(...paces);
    const maxPaceFound = Math.max(...paces);
    const paceMin = Math.max(0, Math.floor(minPaceFound) - 1);
    const paceMax = Math.ceil(maxPaceFound) + 1;

    const xScale = viewMode === 'stream'
        ? {
            type: 'linear' as const,
            display: true,
            min: 0,
            max: distanceAxisMax,
            grid: { color: chartTheme.gridColor },
            border: { display: false },
            ticks: {
                color: chartTheme.tickColor,
                font: { size: 10, weight: 'bold' as const },
                stepSize: 1,
                maxTicksLimit: distanceAxisMax + 1,
                callback: (value: number | string) => formatWholeKmTick(value),
            },
            title: {
                display: true,
                text: 'KILOMETERS',
                color: chartTheme.axisColor,
                font: { size: 10, weight: 'bold' as const },
                padding: { top: 10 },
            },
        }
        : {
            type: 'category' as const,
            display: true,
            grid: { color: chartTheme.gridColor },
            border: { display: false },
            ticks: {
                color: chartTheme.tickColor,
                font: { size: 10, weight: 'bold' as const },
                maxTicksLimit: 12,
                callback: (value: number | string) => value,
            },
            title: {
                display: true,
                text: 'KILOMETERS',
                color: chartTheme.axisColor,
                font: { size: 10, weight: 'bold' as const },
                padding: { top: 10 },
            },
        };

    return {
        maintainAspectRatio: false,
        layout: { padding: { left: 12, right: 12, top: 16, bottom: 0 } },
        interaction: { mode: 'index', intersect: false },
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
                        if (context.dataset.yAxisID === 'y') {
                            label += formatPace(context.parsed.y);
                        } else {
                            label += `${Math.round(context.parsed.y)} bpm`;
                        }
                        return label;
                    },
                },
            },
        },
        scales: {
            x: xScale,
            y: {
                reverse: true,
                position: 'left',
                min: paceMin,
                max: paceMax,
                grid: { color: chartTheme.gridColor, drawTicks: false },
                border: { display: false },
                ticks: {
                    color: chartTheme.tickColor,
                    font: { size: 10, weight: 'bold' },
                    padding: 10,
                    callback: (value: number | string) =>
                        formatPace(typeof value === 'string' ? parseFloat(value) : value),
                },
                title: {
                    display: true,
                    text: 'PACE',
                    color: chartTheme.axisColor,
                    font: { size: 10, weight: 'bold' },
                    padding: { bottom: 10 },
                },
            },
            y1: {
                position: 'right',
                grid: { display: false },
                min: 80,
                max: 200,
                border: { display: false },
                ticks: {
                    color: chartTheme.tickColor,
                    font: { size: 10, weight: 'bold' },
                    padding: 10,
                },
                title: {
                    display: true,
                    text: 'HEART RATE',
                    color: chartTheme.axisColor,
                    font: { size: 10, weight: 'bold' },
                    padding: { bottom: 10 },
                },
            },
        },
    };
}
