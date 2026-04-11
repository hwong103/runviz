import type { Activity } from '@/types/activity';

export const SAMPLE_FPS = 15;
const CADENCE_MIN = 120;
const CADENCE_MAX = 220;

export interface PoseSample {
    time: number;
    landmarks: Array<{ x: number; y: number }>;
}

export function processSamples(samples: PoseSample[], activity: Activity | null) {
    const cadences: number[] = [];
    const windowSize = 5 * SAMPLE_FPS;

    for (let index = 0; index < samples.length - windowSize; index += SAMPLE_FPS) {
        const slice = samples.slice(index, index + windowSize);
        const yCoords = slice.map((sample) => (sample.landmarks[31].y + sample.landmarks[32].y) / 2);
        const peaks = findPeaks(yCoords);
        const stepsInWindow = peaks.length;
        const spm = (stepsInWindow / 5) * 60;
        if (spm >= CADENCE_MIN && spm <= CADENCE_MAX) {
            cadences.push(spm);
        }
    }

    const avgCadence = cadences.length > 0
        ? Math.round(cadences.reduce((sum, value) => sum + value, 0) / cadences.length)
        : 0;

    const oscillations: number[] = [];
    samples.forEach((sample) => {
        const hipY = (sample.landmarks[23].y + sample.landmarks[24].y) / 2;
        const ankleY = (sample.landmarks[27].y + sample.landmarks[28].y) / 2;
        const legPixelLength = Math.max(0.1, Math.abs(hipY - ankleY));
        const pixelsPerCm = legPixelLength / 90;
        oscillations.push(hipY / pixelsPerCm);
    });
    const vertOsc = calculatePeakToPeak(oscillations);

    const leans: number[] = [];
    samples.forEach((sample) => {
        const shoulder = (sample.landmarks[11].x + sample.landmarks[12].x) / 2;
        const hip = (sample.landmarks[23].x + sample.landmarks[24].x) / 2;
        const shoulderY = (sample.landmarks[11].y + sample.landmarks[12].y) / 2;
        const hipY = (sample.landmarks[23].y + sample.landmarks[24].y) / 2;

        const angle = Math.atan2(Math.abs(shoulder - hip), Math.abs(shoulderY - hipY)) * (180 / Math.PI);
        leans.push(angle);
    });
    const avgLean = leans.reduce((sum, value) => sum + value, 0) / leans.length;

    let overstrideCount = 0;
    samples.forEach((sample) => {
        const hipX = (sample.landmarks[23].x + sample.landmarks[24].x) / 2;
        const lAnkleX = sample.landmarks[31].x;
        const rAnkleX = sample.landmarks[32].x;
        const hipY = (sample.landmarks[23].y + sample.landmarks[24].y) / 2;
        const ankleY = (sample.landmarks[31].y + sample.landmarks[32].y) / 2;
        const legLen = Math.abs(hipY - ankleY);

        if (Math.abs(lAnkleX - hipX) > 0.2 * legLen || Math.abs(rAnkleX - hipX) > 0.2 * legLen) {
            overstrideCount += 1;
        }
    });
    const overstrideFlag = (overstrideCount / samples.length) > 0.3;

    const strideLength = activity?.average_speed ? activity.average_speed / (avgCadence / 120) : undefined;

    return {
        metrics: {
            cadence: avgCadence,
            verticalOscillation: vertOsc,
            trunkLean: avgLean,
            overstrideFlag,
            strideLength,
        },
        series: cadences.map((cadence, index) => ({
            timestamp: index,
            cadence,
            verticalOscillation: oscillations[index * SAMPLE_FPS] || 0,
            trunkLean: leans[index * SAMPLE_FPS] || 0,
        })),
    };
}

export function findPeaks(data: number[]) {
    if (data.length < 3) return [];
    const peaks: number[] = [];
    for (let index = 5; index < data.length - 5; index += 1) {
        if (
            data[index] > data[index - 1] &&
            data[index] > data[index + 1] &&
            data[index] > data[index - 5] &&
            data[index] > data[index + 5]
        ) {
            peaks.push(index);
            index += 10;
        }
    }
    return peaks;
}

export function calculatePeakToPeak(data: number[]) {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((left, right) => left - right);
    const low = sorted[Math.floor(data.length * 0.05)];
    const high = sorted[Math.floor(data.length * 0.95)];
    return Math.abs(high - low);
}
