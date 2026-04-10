import { useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';

import { useActivities } from '@/hooks/useActivities';
import { activities as activitiesApi } from '@/services/api/activitiesApi';
import { auth } from '@/services/api/authApi';
import { listFormAnalyses, saveFormAnalysis } from '@/services/cache';
import type { Activity } from '@/types/activity';
import { isRun } from '@/types/activity';
import type { FormAnalysis, FormVideo } from '@/types/formAnalysis';
import { parseActivityLocalDate } from '@/utils/activityDate';

import { generateActivitySummary, generateCommentary } from './commentary';
import { historyBaselines } from './history';
import { processSamples, SAMPLE_FPS, type PoseSample } from './poseProcessing';

const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];

export function useFormAnalysisWorkflow() {
    const { activities } = useActivities();

    const [loading, setLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [sessions, setSessions] = useState<FormAnalysis[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const [selectedVideo, setSelectedVideo] = useState<FormVideo | null>(null);
    const [matchingActivity, setMatchingActivity] = useState<Activity | null>(null);
    const [selectedActivityManual, setSelectedActivityManual] = useState<Activity | null>(null);
    const [clipRange, setClipRange] = useState<[number, number]>([0, 30]);

    const [currentAnalysis, setCurrentAnalysis] = useState<FormAnalysis | null>(null);
    const [isWritingToStrava, setIsWritingToStrava] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const history = await listFormAnalyses();
                setSessions(history.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()));
            } catch (error) {
                console.warn('Failed to load form analysis history:', error);
            }
            setLoading(false);
        };

        void init();
    }, []);

    useEffect(() => {
        if (!selectedVideo) {
            setMatchingActivity(null);
            return;
        }

        const videoTime = new Date(selectedVideo.creationTime).getTime();
        const tolerance = 60 * 60 * 1000;

        const matches = activities
            .filter(isRun)
            .map((activity) => ({
                activity,
                diff: Math.abs(parseActivityLocalDate(activity.start_date_local).getTime() - videoTime),
            }))
            .filter((match) => match.diff < tolerance)
            .sort((left, right) => left.diff - right.diff);

        if (matches.length > 0) {
            setMatchingActivity(matches[0].activity);
        } else {
            setMatchingActivity(null);
        }
    }, [activities, selectedVideo]);

    const activeActivity = selectedActivityManual || matchingActivity;

    const handleFileSelect = (file: File) => {
        if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
            alert('Please select a video file (MP4, MOV, WebM, AVI, or MKV).');
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        const creationTime = file.lastModified
            ? new Date(file.lastModified).toISOString()
            : new Date().toISOString();

        setSelectedVideo({
            id: crypto.randomUUID(),
            filename: file.name,
            mimeType: file.type,
            creationTime,
            durationSec: 0,
            width: 0,
            height: 0,
            mediaItemId: '',
            baseUrl: objectUrl,
        });
        setClipRange([0, 30]);
        setCurrentAnalysis(null);
    };

    const clearVideo = () => {
        if (selectedVideo?.baseUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(selectedVideo.baseUrl);
        }
        setSelectedVideo(null);
    };

    const clearActiveActivity = () => {
        setSelectedActivityManual(null);
        setMatchingActivity(null);
    };

    const runAnalysis = async () => {
        if (!selectedVideo || !videoRef.current) return;

        setIsAnalyzing(true);
        setAnalysisProgress(0);

        try {
            const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );
            const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
            });

            const video = videoRef.current;
            video.currentTime = clipRange[0];
            await new Promise((resolve) => {
                video.onseeked = resolve;
            });

            const duration = clipRange[1] - clipRange[0];
            const sampleInterval = 1 / SAMPLE_FPS;
            const samples: PoseSample[] = [];
            const startTime = Date.now();

            for (let time = clipRange[0]; time < clipRange[1]; time += sampleInterval) {
                video.currentTime = time;
                await new Promise((resolve) => {
                    video.onseeked = resolve;
                });

                const result = poseLandmarker.detectForVideo(video, Date.now() - startTime);
                if (result.landmarks && result.landmarks.length > 0) {
                    samples.push({
                        time: time - clipRange[0],
                        landmarks: result.landmarks[0],
                    });
                }

                setAnalysisProgress(Math.round(((time - clipRange[0]) / duration) * 100));
            }

            const analysis = processSamples(samples, activeActivity);

            const finalAnalysis: FormAnalysis = {
                id: crypto.randomUUID(),
                activityId: activeActivity?.id,
                videoId: selectedVideo.id,
                clipStartSec: clipRange[0],
                clipEndSec: clipRange[1],
                createdAt: new Date().toISOString(),
                analysisVersion: '1.0',
                modelVersion: 'mp_pose_lite_v1',
                metrics: analysis.metrics,
                series: analysis.series,
                commentary: generateCommentary(analysis.metrics, historyBaselines(sessions)),
            };

            await saveFormAnalysis(finalAnalysis);
            setCurrentAnalysis(finalAnalysis);
            setSessions((previous) => [finalAnalysis, ...previous]);
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('Analysis failed. Please try a shorter clip or different video.');
        } finally {
            setIsAnalyzing(false);
            setAnalysisProgress(0);
        }
    };

    const handleWriteToStrava = async () => {
        if (!currentAnalysis || !activeActivity) return;

        setIsWritingToStrava(true);
        try {
            const latest = await activitiesApi.get(activeActivity.id);
            const existingDesc = latest.description || '';

            const marker = '--- RunViz Form Analysis ---';
            const summary = generateActivitySummary(currentAnalysis);

            let newDesc = '';
            if (existingDesc.includes(marker)) {
                const parts = existingDesc.split(marker);
                newDesc = `${parts[0].trim()}\n\n${summary}`;
            } else {
                newDesc = `${existingDesc.trim()}${existingDesc.trim() ? '\n\n' : ''}${summary}`;
            }

            await activitiesApi.update(activeActivity.id, { description: newDesc.trim() });

            const updatedAnalysis = { ...currentAnalysis, lastWrittenAt: new Date().toISOString() };
            await saveFormAnalysis(updatedAnalysis);
            setCurrentAnalysis(updatedAnalysis);

            alert('Successfully synced with Strava!');
        } catch (error: unknown) {
            console.error('Failed to write to Strava:', error);
            if (typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 403) {
                if (confirm('RunViz needs permission to write to your activities. Re-authenticate with write permission now?')) {
                    const { url } = await auth.getStravaLoginUrl('link', 'read,activity:read_all,activity:write');
                    window.location.href = url;
                }
            } else {
                const message = error instanceof Error ? error.message : '';
                alert(`Failed to write to Strava. ${message}`);
            }
        } finally {
            setIsWritingToStrava(false);
        }
    };

    const selectHistoryAnalysis = (analysis: FormAnalysis) => {
        setCurrentAnalysis(analysis);
    };

    const updateSelectedVideoMetadata = (durationSec: number, width: number, height: number) => {
        setClipRange([0, Math.min(30, durationSec)]);
        setSelectedVideo((previous) => previous ? { ...previous, durationSec, width, height } : null);
    };

    return {
        ACCEPTED_VIDEO_TYPES,
        SAMPLE_FPS,
        activeActivity,
        activities,
        analysisProgress,
        canvasRef,
        clearVideo,
        clearActiveActivity,
        clipRange,
        currentAnalysis,
        fileInputRef,
        formatClipDate: (value: string) => format(new Date(value), 'MMM d, h:mm a'),
        handleFileSelect,
        handleWriteToStrava,
        isAnalyzing,
        isDragging,
        isWritingToStrava,
        loading,
        matchingActivity,
        runAnalysis,
        selectHistoryAnalysis,
        selectedActivityManual,
        selectedVideo,
        sessions,
        setClipRange,
        setCurrentAnalysis,
        setIsDragging,
        setSelectedActivityManual,
        setSelectedVideo,
        updateSelectedVideoMetadata,
        videoRef,
    };
}
