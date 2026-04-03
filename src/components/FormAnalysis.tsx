import { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft,
    Video,
    Play,
    Loader2,
    Check,
    X,
    Activity as ActivityIcon,
    FileVideo,
    Zap,
    TrendingUp,
} from 'lucide-react';
import { useActivities } from '../hooks/useActivities';
import { activities as activitiesApi, auth } from '../services/api';
import { saveFormAnalysis, listFormAnalyses } from '../services/cache';
import type { Activity, FormAnalysis, FormVideo } from '../types';
import { isRun } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';
import { format } from 'date-fns';
import { Badge } from './ui/Badge';
import { MetricCard } from './ui/MetricCard';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { cn } from '@/lib/utils';

// Pose Analysis Constants
const SAMPLE_FPS = 15;
const CADENCE_MIN = 120;
const CADENCE_MAX = 220;

const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];

interface PoseSample {
    time: number;
    landmarks: Array<{ x: number; y: number }>;
}

function HistoryRow({
    analysis,
    active,
    onClick,
}: {
    analysis: FormAnalysis;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full rounded-lg border p-3 text-left transition-all',
                active
                    ? 'border-primary/50 bg-primary/10 shadow-sm'
                    : 'border-border bg-card hover:bg-muted/50',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">
                        {format(new Date(analysis.createdAt), 'MMM d')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                        {analysis.metrics.cadence} SPM
                    </div>
                </div>
                <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                    active
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-border bg-muted text-muted-foreground',
                )}>
                    {analysis.commentary.confidence.toFixed(2)}
                </div>
            </div>
            <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                "{analysis.commentary.tips[0]}"
            </div>
        </button>
    );
}

function LabProgressRing({ progress }: { progress: number }) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="relative h-32 w-32">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
                <circle cx="64" cy="64" r={radius} stroke="hsl(var(--muted))" strokeWidth="8" fill="transparent" />
                <circle
                    cx="64"
                    cy="64"
                    r={radius}
                    stroke="url(#lab-progress-gradient)"
                    strokeWidth="8"
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-300"
                />
                <defs>
                    <linearGradient id="lab-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--chart-3))" />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-semibold tracking-tight text-foreground">{progress}%</div>
                <div className="mt-1 text-xs text-muted-foreground">Processing</div>
            </div>
        </div>
    );
}

export default function FormAnalysisPage() {
    const { activities } = useActivities();

    // UI State
    const [loading, setLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [sessions, setSessions] = useState<FormAnalysis[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // Selection State
    const [selectedVideo, setSelectedVideo] = useState<FormVideo | null>(null);
    const [matchingActivity, setMatchingActivity] = useState<Activity | null>(null);
    const [selectedActivityManual, setSelectedActivityManual] = useState<Activity | null>(null);
    const [clipRange, setClipRange] = useState<[number, number]>([0, 30]);

    // Results State
    const [currentAnalysis, setCurrentAnalysis] = useState<FormAnalysis | null>(null);
    const [isWritingToStrava, setIsWritingToStrava] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize
    useEffect(() => {
        const init = async () => {
            try {
                const history = await listFormAnalyses();
                setSessions(history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } catch (error) {
                console.warn('Failed to load form analysis history:', error);
            }
            setLoading(false);
        };
        init();
    }, []);

    // Auto-match activity when video is selected
    useEffect(() => {
        if (!selectedVideo) {
            setMatchingActivity(null);
            return;
        }

        const videoTime = new Date(selectedVideo.creationTime).getTime();
        const tolerance = 60 * 60 * 1000; // 60 mins window

        const matches = activities
            .filter(isRun)
            .map(a => ({
                activity: a,
                diff: Math.abs(parseActivityLocalDate(a.start_date_local).getTime() - videoTime)
            }))
            .filter(m => m.diff < tolerance)
            .sort((a, b) => a.diff - b.diff);

        if (matches.length > 0) {
            setMatchingActivity(matches[0].activity);
        } else {
            setMatchingActivity(null);
        }
    }, [selectedVideo, activities]);

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

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const clearVideo = () => {
        if (selectedVideo?.baseUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(selectedVideo.baseUrl);
        }
        setSelectedVideo(null);
    };

    const runAnalysis = async () => {
        if (!selectedVideo || !videoRef.current) return;

        setIsAnalyzing(true);
        setAnalysisProgress(0);

        try {
            const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );
            const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numPoses: 1
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

            for (let t = clipRange[0]; t < clipRange[1]; t += sampleInterval) {
                video.currentTime = t;
                await new Promise((resolve) => (video.onseeked = resolve));

                const result = poseLandmarker.detectForVideo(video, Date.now() - startTime);
                if (result.landmarks && result.landmarks.length > 0) {
                    samples.push({
                        time: t - clipRange[0],
                        landmarks: result.landmarks[0]
                    });
                }

                setAnalysisProgress(Math.round(((t - clipRange[0]) / duration) * 100));
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
            setSessions(prev => [finalAnalysis, ...prev]);

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
            const existingDesc = latest.description || "";

            const marker = "--- RunViz Form Analysis ---";
            const summary = generateActivitySummary(currentAnalysis);

            let newDesc = "";
            if (existingDesc.includes(marker)) {
                const parts = existingDesc.split(marker);
                newDesc = parts[0].trim() + "\n\n" + summary;
            } else {
                newDesc = existingDesc.trim() + (existingDesc.trim() ? "\n\n" : "") + summary;
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
                alert('Failed to write to Strava. ' + message);
            }
        } finally {
            setIsWritingToStrava(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60svh] items-center justify-center">
                <Card className="w-full max-w-sm">
                    <CardContent className="flex flex-col items-center gap-4 py-8">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                        <div className="text-center">
                            <div className="text-sm font-medium text-foreground">Loading form lab</div>
                            <div className="mt-1 text-xs text-muted-foreground">Loading pose tools and saved analyses</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
                onChange={handleFileInputChange}
                className="hidden"
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left sidebar */}
                <div className="space-y-6 lg:col-span-4">
                    {/* Video Source Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Video source</CardTitle>
                            <CardDescription>Upload a clip to analyze your running form</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!selectedVideo ? (
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={cn(
                                        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center transition-all',
                                        isDragging
                                            ? 'border-primary/70 bg-primary/5'
                                            : 'border-border bg-muted/30 hover:border-primary/45 hover:bg-muted/50',
                                    )}
                                >
                                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/50">
                                        {isDragging ? (
                                            <ArrowLeft className="h-6 w-6 text-muted-foreground" />
                                        ) : (
                                            <Video className="h-6 w-6 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="text-sm font-medium text-foreground">
                                        {isDragging ? 'Drop video here' : 'Upload a running clip'}
                                    </div>
                                    <div className="mt-2 max-w-xs text-xs text-muted-foreground">
                                        Drag and drop or click to browse. MP4, MOV, WebM, AVI, MKV.
                                    </div>
                                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                        <Check className="h-3 w-3" />
                                        Video stays on your device
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Selected video info */}
                                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-foreground">{selectedVideo.filename}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {format(new Date(selectedVideo.creationTime), 'MMM d, h:mm a')}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={clearVideo}
                                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <div className="rounded-lg border border-border bg-card px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Duration</div>
                                                <div className="text-sm font-medium text-foreground">{selectedVideo.durationSec || 0}s</div>
                                            </div>
                                            <div className="rounded-lg border border-border bg-card px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Resolution</div>
                                                <div className="text-sm font-medium text-foreground">
                                                    {selectedVideo.width && selectedVideo.height ? `${selectedVideo.width}x${selectedVideo.height}` : 'Pending'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Clip Length */}
                                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <label className="text-xs font-medium text-muted-foreground">Clip length</label>
                                            <Badge tone="gold" size="sm">{clipRange[1] - clipRange[0]}s selected</Badge>
                                        </div>
                                        <div className="space-y-3">
                                            <input
                                                type="range"
                                                min="0"
                                                max={Math.max(60, clipRange[1])}
                                                value={clipRange[0]}
                                                onChange={(e) => setClipRange([parseInt(e.target.value), Math.max(parseInt(e.target.value) + 1, clipRange[1])])}
                                                className="range-slider w-full"
                                            />
                                            <input
                                                type="range"
                                                min={clipRange[0] + 1}
                                                max={Math.max(60, clipRange[1] + 30)}
                                                value={clipRange[1]}
                                                onChange={(e) => setClipRange([clipRange[0], parseInt(e.target.value)])}
                                                className="range-slider w-full"
                                            />
                                        </div>
                                    </div>

                                    {/* Match to a Run */}
                                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                                        <div className="text-xs font-medium text-muted-foreground">Match to a run</div>
                                        <div className="mt-3">
                                            {activeActivity ? (
                                                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
                                                        <ActivityIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-medium text-foreground">{activeActivity.name}</div>
                                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                                            {format(parseActivityLocalDate(activeActivity.start_date_local), 'MMM d, yyyy')} · {(activeActivity.distance / 1000).toFixed(2)} km
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => { setSelectedActivityManual(null); setMatchingActivity(null); }}
                                                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <select
                                                    onChange={(e) => setSelectedActivityManual(activities.find(a => a.id === parseInt(e.target.value)) || null)}
                                                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                                >
                                                    <option value="">Choose a run manually (optional)...</option>
                                                    {activities.filter(isRun).slice(0, 20).map(a => (
                                                        <option key={a.id} value={a.id}>
                                                            {format(parseActivityLocalDate(a.start_date_local), 'MMM d')} - {a.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Past Analyses Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Past analyses</CardTitle>
                            <CardDescription>Open a saved form review</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {sessions.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                                    <FileVideo className="mx-auto h-8 w-8 text-muted-foreground/40" />
                                    <p className="mx-auto mt-3 max-w-xs text-xs text-muted-foreground">
                                        No saved analyses yet. Run your first review to see it here.
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                                    {sessions.map(s => (
                                        <HistoryRow
                                            key={s.id}
                                            analysis={s}
                                            active={currentAnalysis?.id === s.id}
                                            onClick={() => setCurrentAnalysis(s)}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Main content area */}
                <div className="space-y-6 lg:col-span-8">
                    {!currentAnalysis ? (
                        <Card className="overflow-hidden">
                            <CardHeader>
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <CardTitle>Analysis</CardTitle>
                                        <CardDescription>Preview the clip and run the form check</CardDescription>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {isAnalyzing ? 'Analysis in progress' : selectedVideo ? 'Ready to analyze' : 'Waiting for video'}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {selectedVideo ? (
                                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                                        {/* Video player */}
                                        <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
                                            <div className="relative aspect-video">
                                                <video
                                                    ref={videoRef}
                                                    src={selectedVideo.baseUrl}
                                                    className="h-full w-full object-contain"
                                                    playsInline
                                                    controls
                                                    onLoadedMetadata={(e) => {
                                                        const vid = e.currentTarget;
                                                        const dur = Math.floor(vid.duration);
                                                        setClipRange([0, Math.min(30, dur)]);
                                                        setSelectedVideo(prev => prev ? { ...prev, durationSec: dur, width: vid.videoWidth, height: vid.videoHeight } : null);
                                                    }}
                                                />
                                                {isAnalyzing && (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-md">
                                                        <LabProgressRing progress={analysisProgress} />
                                                        <div className="text-center">
                                                            <div className="text-sm font-medium text-foreground">Analyzing running form</div>
                                                            <div className="mt-1 text-xs text-muted-foreground">Sampling at {SAMPLE_FPS} FPS</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Controls sidebar */}
                                        <div className="space-y-4">
                                            <div className="rounded-lg border border-border bg-muted/40 p-4">
                                                <div className="text-xs font-medium text-muted-foreground">Analysis controls</div>
                                                <Button
                                                    onClick={runAnalysis}
                                                    disabled={isAnalyzing}
                                                    className="mt-3 w-full"
                                                >
                                                    {isAnalyzing ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Analyzing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Zap className="h-4 w-4" />
                                                            Start analysis
                                                        </>
                                                    )}
                                                </Button>
                                                <div className="mt-3 grid grid-cols-2 gap-2">
                                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Clip</div>
                                                        <div className="text-sm font-medium text-foreground">{clipRange[1] - clipRange[0]}s</div>
                                                    </div>
                                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">History</div>
                                                        <div className="text-sm font-medium text-foreground">{sessions.length}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-lg border border-border bg-muted/40 p-4">
                                                <div className="text-xs font-medium text-muted-foreground">Matched run</div>
                                                {activeActivity ? (
                                                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                                                        <div className="text-sm font-medium text-foreground">{activeActivity.name}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {format(parseActivityLocalDate(activeActivity.start_date_local), 'MMM d, yyyy')} · {(activeActivity.distance / 1000).toFixed(2)} km
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                                        Choose a run manually, or wait for RunViz to match one after the video loads.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className={cn(
                                            'flex min-h-[400px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-all',
                                            isDragging
                                                ? 'border-primary/70 bg-primary/5'
                                                : 'border-border bg-muted/30 hover:border-primary/45 hover:bg-muted/50',
                                        )}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={handleFileDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted/50">
                                            {isDragging ? (
                                                <ArrowLeft className="h-8 w-8 text-muted-foreground" />
                                            ) : (
                                                <Play className="h-8 w-8 text-muted-foreground" />
                                            )}
                                        </div>
                                        <h3 className="text-xl font-semibold tracking-tight text-foreground">
                                            {isDragging ? 'Drop to start' : 'Ready to review a run'}
                                        </h3>
                                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                                            Drop a side-view running clip to start the analysis.
                                        </p>
                                        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            <Check className="h-3 w-3" />
                                            Video never leaves your device
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            {/* Results header */}
                            <Card>
                                <CardHeader>
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="max-w-3xl">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge tone="gold" size="sm">Lab session complete</Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    Confidence {(currentAnalysis.commentary.confidence * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <CardTitle className="mt-2 text-2xl">Session intelligence</CardTitle>
                                            <CardDescription className="mt-1">
                                                Captured {format(new Date(currentAnalysis.createdAt), 'MMMM do, yyyy • h:mm a')}
                                            </CardDescription>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {activeActivity && !currentAnalysis.lastWrittenAt && (
                                                <Button
                                                    onClick={handleWriteToStrava}
                                                    disabled={isWritingToStrava}
                                                    variant="default"
                                                >
                                                    {isWritingToStrava ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Syncing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TrendingUp className="h-4 w-4" />
                                                            Write to Strava
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                            {currentAnalysis.lastWrittenAt && (
                                                <Badge tone="emerald" size="sm">Written to activity</Badge>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setCurrentAnalysis(null)}
                                            >
                                                <ArrowLeft className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        <MetricCard label="Cadence" value={String(currentAnalysis.metrics.cadence)} unit="spm" />
                                        <MetricCard label="Vertical Osc." value={currentAnalysis.metrics.verticalOscillation.toFixed(1)} unit="cm" accentClassName="text-chart-1" />
                                        <MetricCard label="Trunk Lean" value={currentAnalysis.metrics.trunkLean.toFixed(1)} unit="deg" accentClassName="text-chart-1" />
                                        <MetricCard label="Overstride" value={currentAnalysis.metrics.overstrideFlag ? 'Detected' : 'Neutral'} accentClassName={currentAnalysis.metrics.overstrideFlag ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'} />
                                    </div>

                                    {currentAnalysis.metrics.strideLength && (
                                        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                                <div>
                                                    <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Calculated stride length</div>
                                                    <div className="mt-1 text-sm text-muted-foreground">
                                                        Based on activity speed ({((activeActivity?.average_speed ?? 0) * 3.6).toFixed(1)} km/h)
                                                    </div>
                                                </div>
                                                <div className="flex items-end gap-2">
                                                    <div className="text-3xl font-semibold tracking-tight text-foreground">{currentAnalysis.metrics.strideLength.toFixed(2)}</div>
                                                    <div className="pb-1 text-xs text-muted-foreground">meters</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Commentary and Kinetic Traces */}
                            <div className="grid gap-6 xl:grid-cols-2">
                                {/* Coach Commentary */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Coach commentary</CardTitle>
                                        <CardDescription>What the model sees, and what to fix next</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground italic">
                                            "{currentAnalysis.commentary.baselineComparison}"
                                        </div>

                                        <div className="space-y-2">
                                            {currentAnalysis.commentary.tips.map((tip, i) => (
                                                <div key={i} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:border-primary/30">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary">
                                                        {i + 1}
                                                    </div>
                                                    <div className="text-sm leading-relaxed text-muted-foreground">{tip}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Kinetic Traces */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Kinetic traces</CardTitle>
                                        <CardDescription>Variance tracked over {currentAnalysis.clipEndSec - currentAnalysis.clipStartSec} seconds</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="rounded-lg border border-border bg-muted/50 p-4">
                                            <div className="flex h-48 items-end gap-1.5">
                                                {currentAnalysis.series.slice(0, 40).map((s, i) => (
                                                    <div key={i} className="group flex-1 rounded-t-md bg-chart-1/20 transition-all hover:bg-chart-1" style={{ height: `${Math.min(100, (s.cadence / 220) * 100)}%` }}>
                                                        <div className="h-full w-full rounded-t-md bg-gradient-to-t from-chart-1/20 to-chart-3/10 opacity-70 transition-opacity group-hover:opacity-100" />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                                <span>0s</span>
                                                <span>Cadence variance</span>
                                                <span>{currentAnalysis.clipEndSec - currentAnalysis.clipStartSec}s</span>
                                            </div>
                                        </div>

                                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                                            <div className="text-xs font-medium text-muted-foreground">Technical summary</div>
                                            <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                                Model: {currentAnalysis.modelVersion} <br />
                                                Sampling Rate: {SAMPLE_FPS} FPS · Resolution: {(canvasRef.current?.width || 1280)}x{(canvasRef.current?.height || 720)}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Hidden canvas for offscreen frame processing */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}

// --- Analysis Engine Helpers ---

function processSamples(samples: PoseSample[], activity: Activity | null) {
    const cadences: number[] = [];
    const windowSize = 5 * SAMPLE_FPS;
    for (let i = 0; i < samples.length - windowSize; i += SAMPLE_FPS) {
        const slice = samples.slice(i, i + windowSize);
        const yCoords = slice.map(s => (s.landmarks[31].y + s.landmarks[32].y) / 2);
        const peaks = findPeaks(yCoords);
        const stepsInWindow = peaks.length;
        const spm = (stepsInWindow / 5) * 60;
        if (spm >= CADENCE_MIN && spm <= CADENCE_MAX) cadences.push(spm);
    }
    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : 0;

    const oscillations: number[] = [];
    samples.forEach(s => {
        const hipY = (s.landmarks[23].y + s.landmarks[24].y) / 2;
        const ankleY = (s.landmarks[27].y + s.landmarks[28].y) / 2;
        const legPixelLength = Math.max(0.1, Math.abs(hipY - ankleY));
        const pixelsPerCm = legPixelLength / 90;
        oscillations.push(hipY / pixelsPerCm);
    });
    const vertOsc = calculatePeakToPeak(oscillations);

    const leans: number[] = [];
    samples.forEach(s => {
        const shoulder = (s.landmarks[11].x + s.landmarks[12].x) / 2;
        const hip = (s.landmarks[23].x + s.landmarks[24].x) / 2;
        const shoulderY = (s.landmarks[11].y + s.landmarks[12].y) / 2;
        const hipY = (s.landmarks[23].y + s.landmarks[24].y) / 2;

        const angle = Math.atan2(Math.abs(shoulder - hip), Math.abs(shoulderY - hipY)) * (180 / Math.PI);
        leans.push(angle);
    });
    const avgLean = leans.reduce((a, b) => a + b, 0) / leans.length;

    let overstrideCount = 0;
    samples.forEach(s => {
        const hipX = (s.landmarks[23].x + s.landmarks[24].x) / 2;
        const lAnkleX = s.landmarks[31].x;
        const rAnkleX = s.landmarks[32].x;
        const hipY = (s.landmarks[23].y + s.landmarks[24].y) / 2;
        const ankleY = (s.landmarks[31].y + s.landmarks[32].y) / 2;
        const legLen = Math.abs(hipY - ankleY);

        if (Math.abs(lAnkleX - hipX) > 0.2 * legLen || Math.abs(rAnkleX - hipX) > 0.2 * legLen) {
            overstrideCount++;
        }
    });
    const overstrideFlag = (overstrideCount / samples.length) > 0.3;

    const strideLength = activity?.average_speed ? (activity.average_speed) / (avgCadence / 120) : undefined;

    return {
        metrics: {
            cadence: avgCadence,
            verticalOscillation: vertOsc,
            trunkLean: avgLean,
            overstrideFlag,
            strideLength
        },
        series: cadences.map((c, i) => ({
            timestamp: i,
            cadence: c,
            verticalOscillation: oscillations[i * SAMPLE_FPS] || 0,
            trunkLean: leans[i * SAMPLE_FPS] || 0
        }))
    };
}

function findPeaks(data: number[]) {
    if (data.length < 3) return [];
    const peaks = [];
    for (let i = 5; i < data.length - 5; i++) {
        if (data[i] > data[i - 1] && data[i] > data[i + 1] &&
            data[i] > data[i - 5] && data[i] > data[i + 5]) {
            peaks.push(i);
            i += 10;
        }
    }
    return peaks;
}

function calculatePeakToPeak(data: number[]) {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const low = sorted[Math.floor(data.length * 0.05)];
    const high = sorted[Math.floor(data.length * 0.95)];
    return Math.abs(high - low);
}

function historyBaselines(sessions: FormAnalysis[]) {
    if (sessions.length < 3) return null;
    const count = Math.min(10, sessions.length);
    const lastN = sessions.slice(0, count);

    return {
        cadence: lastN.reduce((a, b) => a + b.metrics.cadence, 0) / count,
        vertOsc: lastN.reduce((a, b) => a + b.metrics.verticalOscillation, 0) / count,
        trunkLean: lastN.reduce((a, b) => a + b.metrics.trunkLean, 0) / count,
    };
}

function generateCommentary(metrics: FormAnalysis['metrics'], baseline: ReturnType<typeof historyBaselines>): FormAnalysis['commentary'] {
    const tips = [];
    let comparison = "Looking solid! Your form shows good consistency.";

    if (metrics.overstrideFlag) {
        tips.push("Focus on landing with your feet under your hips rather than reaching forward.");
    }

    if (metrics.cadence < 165) {
        tips.push("Try increasing your step frequency (cadence) slightly to reduce ground impact.");
    }

    if (metrics.verticalOscillation > 10) {
        tips.push("You have significant vertical bounce. Focus on driving forward rather than upward.");
    }

    if (metrics.trunkLean > 8) {
        tips.push("You're leaning forward a bit much. Try to 'run tall' with a slight lean from the ankles.");
    }

    if (baseline) {
        const cadDiff = metrics.cadence - baseline.cadence;
        if (Math.abs(cadDiff) > 5) {
            comparison = `Your cadence is ${cadDiff > 0 ? 'higher' : 'lower'} than your recent average by ${Math.abs(cadDiff).toFixed(0)} spm.`;
        }
    }

    if (tips.length === 0) tips.push("Excellent efficiency — maintain this posture for your long runs.");
    if (tips.length === 1) tips.push("Check your shoulder tension; keep them relaxed and down.");

    return {
        tips: tips.slice(0, 2),
        baselineComparison: comparison,
        confidence: 0.85
    };
}

function generateActivitySummary(analysis: FormAnalysis) {
    const lines = [
        "--- RunViz Form Analysis ---",
        `Cadence: ${analysis.metrics.cadence} SPM`,
        `Vert Osc: ${analysis.metrics.verticalOscillation.toFixed(1)} cm`,
        `Trunk Lean: ${analysis.metrics.trunkLean.toFixed(1)}°`,
        `Overstride: ${analysis.metrics.overstrideFlag ? 'Detected' : 'Neutral'}`,
    ];

    if (analysis.metrics.strideLength) {
        lines.push(`Stride Length: ${analysis.metrics.strideLength.toFixed(2)} m`);
    }

    lines.push("");
    lines.push("Coaching Tips:");
    analysis.commentary.tips.forEach(tip => lines.push(`- ${tip}`));

    return lines.join("\n");
}
