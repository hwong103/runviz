export interface FormVideo {
    id: string;
    filename: string;
    mimeType: string;
    creationTime: string;
    durationSec: number;
    width: number;
    height: number;
    mediaItemId: string;
    baseUrl: string;
}

export interface FormAnalysis {
    id: string;
    activityId?: number;
    videoId: string;
    clipStartSec: number;
    clipEndSec: number;
    createdAt: string;
    analysisVersion: string;
    modelVersion: string;
    metrics: {
        cadence: number;
        strideLength?: number;
        verticalOscillation: number;
        trunkLean: number;
        overstrideFlag: boolean;
    };
    series: {
        timestamp: number;
        cadence: number;
        verticalOscillation: number;
        trunkLean: number;
    }[];
    commentary: {
        tips: string[];
        baselineComparison: string;
        confidence: number;
    };
    lastWrittenAt?: string;
}
