import type { FormVideo } from '@/types/formAnalysis';

export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];

const DEFAULT_CLIP_DURATION_SEC = 30;

export function isAcceptedVideoType(file: File): boolean {
    return ACCEPTED_VIDEO_TYPES.includes(file.type);
}

export function createVideoSession(file: File): FormVideo {
    return {
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type,
        creationTime: file.lastModified
            ? new Date(file.lastModified).toISOString()
            : new Date().toISOString(),
        durationSec: 0,
        width: 0,
        height: 0,
        mediaItemId: '',
        baseUrl: URL.createObjectURL(file),
    };
}

export function revokeVideoSession(video: FormVideo | null) {
    if (video?.baseUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(video.baseUrl);
    }
}

export function buildClipRange(durationSec = DEFAULT_CLIP_DURATION_SEC): [number, number] {
    return [0, Math.min(DEFAULT_CLIP_DURATION_SEC, durationSec)];
}

export function updateVideoSessionMetadata(
    video: FormVideo,
    durationSec: number,
    width: number,
    height: number
): FormVideo {
    return {
        ...video,
        durationSec,
        width,
        height,
    };
}

export async function seekVideo(video: HTMLVideoElement, time: number) {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
        return;
    }

    await new Promise<void>((resolve) => {
        const handleSeeked = () => {
            video.removeEventListener('seeked', handleSeeked);
            resolve();
        };

        video.addEventListener('seeked', handleSeeked);
        video.currentTime = time;
    });
}
