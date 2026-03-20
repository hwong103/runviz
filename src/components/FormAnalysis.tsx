import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActivities } from '../hooks/useActivities';
import { activities as activitiesApi, auth } from '../services/api';
import { saveFormAnalysis, listFormAnalyses } from '../services/cache';
import type { Activity, FormAnalysis, FormVideo } from '../types';
import { isRun } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';
import { format } from 'date-fns';
import { Badge } from './ui/Badge';
import { MetricCard } from './ui/MetricCard';

// Pose Analysis Constants
const SAMPLE_FPS = 15;
const CADENCE_MIN = 120;
const CADENCE_MAX = 220;

const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];

interface PoseSample {
    time: number;
    landmarks: Array<{ x: number; y: number }>;
}

function SectionLabel({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.35em] text-sky-400">
                    <span className="text-sky-300">{index}</span>
                    <span>{title}</span>
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{subtitle}</p>
            </div>
        </div>
    );
}

function StatPill({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'cyan' | 'yellow' | 'emerald' | 'orange' | 'rose' }) {
    const toneMap: Record<string, 'neutral' | 'sky' | 'gold' | 'emerald' | 'orange' | 'rose'> = {
        neutral: 'neutral',
        cyan: 'sky',
        yellow: 'gold',
        emerald: 'emerald',
        orange: 'orange',
        rose: 'rose',
    };

    return (
        <Badge tone={toneMap[tone]} size="md" className="flex-col items-start gap-1 rounded-[1.2rem] px-4 py-3 tracking-[0.34em] normal-case">
            <span className="text-[8px] opacity-70">{label}</span>
            <span className="text-lg font-black italic tracking-tighter normal-case">{value}</span>
        </Badge>
    );
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
            className={`w-full rounded-[1.4rem] border p-4 text-left transition-all duration-200 ${
                active
                    ? 'border-sky-400/45 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.12)]'
                    : 'border-white/8 bg-black/20 hover:border-white/12 hover:bg-white/[0.05]'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.34em] text-sky-400">
                        {format(new Date(analysis.createdAt), 'MMM d')}
                    </div>
                    <div className="mt-2 text-sm font-black text-white">
                        {analysis.metrics.cadence} SPM
                    </div>
                </div>
                <div className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">
                    {analysis.commentary.confidence.toFixed(2)}
                </div>
            </div>
            <div className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-300">
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
                <circle cx="64" cy="64" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="transparent" />
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
                        <stop offset="0%" stopColor="#FFF917" />
                        <stop offset="100%" stopColor="#0093D6" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-black italic tracking-tighter text-white">{progress}%</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.34em] text-slate-500">Processing</div>
            </div>
        </div>
    );
}

export default function FormAnalysisPage() {
    const navigate = useNavigate();
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

    const handleBack = () => navigate('/');

    const handleFileSelect = (file: File) => {
        if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
            alert('Please select a video file (MP4, MOV, WebM, AVI, or MKV).');
            return;
        }

        const objectUrl = URL.createObjectURL(file);

        // Try to extract creation date from file metadata
        const creationTime = file.lastModified
            ? new Date(file.lastModified).toISOString()
            : new Date().toISOString();

        setSelectedVideo({
            id: crypto.randomUUID(),
            filename: file.name,
            mimeType: file.type,
            creationTime,
            durationSec: 0, // will be read from video element
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
            // 1. Lazy-load MediaPipe
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

            // 2. Frame-by-frame analysis loop
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

            // 3. Process metrics
            const analysis = processSamples(samples, activeActivity);

            // 4. Save results
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
            // Fetch latest description to avoid overwriting user notes
            const latest = await activitiesApi.get(activeActivity.id);
            const existingDesc = latest.description || "";

            const marker = "--- RunViz Form Analysis ---";
            const summary = generateActivitySummary(currentAnalysis);

            let newDesc = "";
            if (existingDesc.includes(marker)) {
                // Replace existing block
                const parts = existingDesc.split(marker);
                newDesc = parts[0].trim() + "\n\n" + summary;
            } else {
                // Append new block
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
            <div className="rv-form-analysis min-h-screen bg-[#041723] text-[#F6F2F1] flex items-center justify-center">
                <div className="flex flex-col items-center gap-5 rounded-[2rem] border border-white/10 bg-white/[0.04] px-8 py-10 shadow-2xl backdrop-blur-xl">
                    <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#0093D6]/30 border-t-[#FFF917]" />
                    <div className="text-xl font-black italic tracking-tighter text-white">Loading form lab</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.34em] text-slate-500">Loading pose tools and saved analyses</div>
                </div>
            </div>
        );
    }

    return (
        <div className="rv-form-analysis min-h-screen bg-[#0a0f17] text-[#f5efe3]">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
                onChange={handleFileInputChange}
                className="hidden"
            />

            <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <header className="rv-shell-card mb-6 grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-center lg:px-7">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleBack}
                            className="group flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d9b36a]/12 bg-white/[0.04] transition-all hover:border-[#d9b36a]/35 hover:bg-[#d9b36a]/10"
                        >
                            <span className="inline-block text-xl transition-transform group-hover:-translate-x-0.5">←</span>
                        </button>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#d9b36a]">Form Lab</div>
                            <h1 className="mt-2 font-['Instrument_Serif'] text-4xl sm:text-5xl lg:text-6xl italic tracking-tight text-white">
                                Review your running form
                            </h1>
                            <div className="mt-2 text-[9px] font-black uppercase tracking-[0.34em] text-slate-500">
                                Video analysis that runs on your device
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                        <Badge tone="blue" size="md">
                            100% On-device
                        </Badge>
                        <Badge tone="gold" size="md">
                            Analysis history saved locally
                        </Badge>
                    </div>
                </header>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
                    <div className="space-y-6 lg:col-span-4">
                        <section className="rv-shell-card p-6">
                            <SectionLabel index="01" title="Video Source" subtitle="Upload a clip to analyze" />

                            {!selectedVideo ? (
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[1.8rem] border-2 border-dashed px-6 py-12 text-center transition-all ${
                                        isDragging
                                            ? 'border-[#d9b36a]/70 bg-[#d9b36a]/8 shadow-[0_0_0_1px_rgba(217,179,106,0.12)]'
                                            : 'border-white/10 bg-black/15 hover:border-[#4a7aff]/45 hover:bg-[#4a7aff]/8'
                                    }`}
                                >
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-3xl">
                                        {isDragging ? '↓' : '▣'}
                                    </div>
                                    <div className="font-['Instrument_Serif'] text-2xl italic tracking-tight text-white">
                                        {isDragging ? 'Drop video here' : 'Upload a running clip'}
                                    </div>
                                    <div className="mt-3 max-w-sm text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                        Drag and drop or click to browse. Supported files: MP4, MOV, WebM, AVI, MKV.
                                    </div>
                                    <div className="mt-4 text-[9px] font-black uppercase tracking-[0.32em] text-emerald-300">
                                        Video stays on your device
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-5 space-y-5">
                                    <div className="rv-subtle-card p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-black text-white">{selectedVideo.filename}</div>
                                                <div className="mt-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                                    {format(new Date(selectedVideo.creationTime), 'MMM d, h:mm a')}
                                                </div>
                                            </div>
                                            <button
                                                onClick={clearVideo}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-200"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <StatPill label="Duration" value={`${selectedVideo.durationSec || 0}s`} tone="cyan" />
                                            <StatPill label="Resolution" value={selectedVideo.width && selectedVideo.height ? `${selectedVideo.width}x${selectedVideo.height}` : 'Pending'} />
                                        </div>
                                    </div>

                                    <div className="rv-subtle-card p-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <label className="rv-quiet-label">Clip Length</label>
                                            <Badge tone="gold">
                                                {clipRange[1] - clipRange[0]}s selected
                                            </Badge>
                                        </div>
                                        <div className="mt-5 space-y-4">
                                            <input
                                                type="range"
                                                min="0"
                                                max={Math.max(60, clipRange[1])}
                                                value={clipRange[0]}
                                                onChange={(e) => setClipRange([parseInt(e.target.value), Math.max(parseInt(e.target.value) + 1, clipRange[1])])}
                                                className="w-full accent-[#4a7aff]"
                                            />
                                            <input
                                                type="range"
                                                min={clipRange[0] + 1}
                                                max={Math.max(60, clipRange[1] + 30)}
                                                value={clipRange[1]}
                                                onChange={(e) => setClipRange([clipRange[0], parseInt(e.target.value)])}
                                                className="w-full accent-[#4a7aff]"
                                            />
                                        </div>
                                    </div>

                                    <div className="rv-subtle-card p-5">
                                        <div className="rv-quiet-label">Match to a Run</div>
                                        <div className="mt-4">
                                            {activeActivity ? (
                                                <div className="flex items-center gap-4 rounded-[1.3rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-lg text-emerald-200">⌁</div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-black text-white">{activeActivity.name}</div>
                                                        <div className="mt-1 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                                            {format(parseActivityLocalDate(activeActivity.start_date_local), 'MMM d, yyyy')} · {(activeActivity.distance / 1000).toFixed(2)} km
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSelectedActivityManual(null); setMatchingActivity(null); }}
                                                        className="text-slate-500 transition-colors hover:text-rose-300"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ) : (
                                                <select
                                                    onChange={(e) => setSelectedActivityManual(activities.find(a => a.id === parseInt(e.target.value)) || null)}
                                                    className="rv-field w-full p-4 text-[10px] font-black uppercase tracking-[0.24em] text-slate-300"
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
                                </div>
                            )}
                        </section>

                        <section className="rv-shell-card p-6">
                            <SectionLabel index="02" title="Past Analyses" subtitle="Open a saved form review" />
                            <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-2">
                                {sessions.length === 0 ? (
                                    <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-black/15 px-5 py-12 text-center">
                                        <div className="text-3xl opacity-20">▢</div>
                                        <p className="mx-auto mt-4 max-w-xs text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                            No saved analyses yet. Run your first review to see it here.
                                        </p>
                                    </div>
                                ) : (
                                    sessions.map(s => (
                                        <HistoryRow
                                            key={s.id}
                                            analysis={s}
                                            active={currentAnalysis?.id === s.id}
                                            onClick={() => setCurrentAnalysis(s)}
                                        />
                                    ))
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6 lg:col-span-8">
                        {!currentAnalysis ? (
                            <section className="rv-shell-card relative overflow-hidden rounded-[2.6rem] p-6 sm:p-8">
                                <div className="relative z-10">
                                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                                        <SectionLabel
                                            index="03"
                                            title="Analysis"
                                            subtitle="Preview the clip and run the form check"
                                        />
                                        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                            {isAnalyzing ? 'Analysis in progress' : selectedVideo ? 'Ready to analyze' : 'Waiting for video'}
                                        </div>
                                    </div>

                                    {selectedVideo ? (
                                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                                            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/30">
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
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#041723]/85 backdrop-blur-md">
                                                            <LabProgressRing progress={analysisProgress} />
                                                            <div className="text-center">
                                                                <div className="text-[10px] font-black uppercase tracking-[0.34em] text-[#d9b36a]">
                                                                    Analyzing running form
                                                                </div>
                                                                <div className="mt-2 text-[9px] font-black uppercase tracking-[0.32em] text-slate-500">
                                                                    Sampling at {SAMPLE_FPS} FPS
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="rv-subtle-card p-5">
                                                    <div className="rv-quiet-label">Analysis Controls</div>
                                                    <button
                                                        onClick={runAnalysis}
                                                        disabled={isAnalyzing}
                                                        className="rv-button-primary mt-5 inline-flex w-full items-center justify-center gap-3 border-[#d9b36a]/30 bg-[#d9b36a] px-6 py-4 text-[#121925] shadow-[0_18px_40px_rgba(217,179,106,0.22)] hover:bg-[#e6c489] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <span className="text-lg">↗</span>
                                                        {isAnalyzing ? 'Analyzing' : 'Start analysis'}
                                                    </button>
                                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                        <StatPill label="Clip" value={`${clipRange[1] - clipRange[0]}s`} tone="yellow" />
                                                        <StatPill label="History" value={`${sessions.length}`} tone="neutral" />
                                                    </div>
                                                </div>

                                                <div className="rv-subtle-card p-5">
                                                    <div className="rv-quiet-label">Matched Run</div>
                                                    {activeActivity ? (
                                                        <div className="mt-4 rounded-[1.4rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                                                            <div className="text-sm font-black text-white">{activeActivity.name}</div>
                                                            <div className="mt-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                                                {format(parseActivityLocalDate(activeActivity.start_date_local), 'MMM d, yyyy')} · {(activeActivity.distance / 1000).toFixed(2)} km
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-4 rounded-[1.4rem] border border-dashed border-white/10 bg-black/15 p-4 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                                            Choose a run manually, or wait for RunViz to match one after the video loads.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`flex min-h-[480px] cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-16 text-center transition-all ${
                                                isDragging
                                                    ? 'border-[#FFF917]/70 bg-[#FFF917]/8'
                                                    : 'border-white/10 bg-black/15 hover:border-[#4a7aff]/45 hover:bg-[#4a7aff]/8'
                                            }`}
                                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                            onDragLeave={() => setIsDragging(false)}
                                            onDrop={handleFileDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-4xl text-white">
                                                {isDragging ? '↓' : '⌬'}
                                            </div>
                                            <h3 className="font-['Instrument_Serif'] text-4xl italic tracking-tight text-white sm:text-5xl">
                                                {isDragging ? 'Drop to start' : 'Ready to review a run'}
                                            </h3>
                                            <p className="mt-4 max-w-lg text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                                                Drop a side-view running clip to start the analysis.
                                            </p>
                                            <p className="mt-4 text-[9px] font-black uppercase tracking-[0.34em] text-emerald-300">
                                                Video never leaves your device
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        ) : (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <section className="relative overflow-hidden rounded-[2.6rem] border border-[#FFF917]/35 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:p-10">
                                    <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#FFF917]/10 blur-3xl" />
                                    <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-[#0093D6]/12 blur-3xl" />

                                    <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="max-w-3xl">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <Badge tone="gold">
                                                    Lab session complete
                                                </Badge>
                                                <span className="text-[9px] font-black uppercase tracking-[0.34em] text-slate-500">
                                                    Confidence {(currentAnalysis.commentary.confidence * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <h2 className="mt-4 text-4xl font-black italic tracking-tighter text-white sm:text-5xl lg:text-6xl">
                                                Session intelligence
                                            </h2>
                                            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.34em] text-slate-500">
                                                Captured {format(new Date(currentAnalysis.createdAt), 'MMMM do, yyyy • h:mm a')}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-3">
                                            {activeActivity && !currentAnalysis.lastWrittenAt && (
                                                <button
                                                    onClick={handleWriteToStrava}
                                                    disabled={isWritingToStrava}
                                                    className="rv-badge rv-badge-strava rv-badge-md transition-all hover:-translate-y-[1px] hover:bg-[#ff5b14] disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {isWritingToStrava ? 'Syncing' : 'Write to Strava'}
                                                </button>
                                            )}
                                            {currentAnalysis.lastWrittenAt && (
                                                <div className="rv-badge rv-badge-emerald rv-badge-md">
                                                    Written to activity
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setCurrentAnalysis(null)}
                                                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition-colors hover:border-white/20 hover:bg-white/10"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative z-10 mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        <MetricCard label="Cadence" value={String(currentAnalysis.metrics.cadence)} unit="spm" />
                                        <MetricCard label="Vertical Osc." value={currentAnalysis.metrics.verticalOscillation.toFixed(1)} unit="cm" accentClassName="text-sky-300" />
                                        <MetricCard label="Trunk Lean" value={currentAnalysis.metrics.trunkLean.toFixed(1)} unit="deg" accentClassName="text-sky-300" />
                                        <MetricCard label="Overstride" value={currentAnalysis.metrics.overstrideFlag ? 'Detected' : 'Neutral'} accentClassName={currentAnalysis.metrics.overstrideFlag ? 'text-rose-300' : 'text-emerald-300'} />
                                    </div>

                                    {currentAnalysis.metrics.strideLength && (
                                        <div className="relative z-10 mt-4 rounded-[1.8rem] border border-[#FFF917]/25 bg-[#FFF917]/10 p-5">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                                <div>
                                                    <div className="text-[9px] font-black uppercase tracking-[0.34em] text-yellow-200">
                                                        Calculated stride length
                                                    </div>
                                                        <div className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                                                        Based on activity speed ({((activeActivity?.average_speed ?? 0) * 3.6).toFixed(1)} km/h)
                                                        </div>
                                                </div>
                                                <div className="flex items-end gap-3">
                                                    <div className="text-5xl font-black italic tracking-tighter text-white">{currentAnalysis.metrics.strideLength.toFixed(2)}</div>
                                                    <div className="pb-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">meters</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                                    <div className="rounded-[2.6rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                                        <SectionLabel index="04" title="Coach Commentary" subtitle="What the model sees, and what to fix next" />
                                        <div className="mt-6 space-y-4">
                                            <div className="rounded-[1.7rem] border border-white/10 bg-black/20 p-6 text-lg italic leading-relaxed text-slate-200">
                                                "{currentAnalysis.commentary.baselineComparison}"
                                            </div>

                                            <div className="space-y-3">
                                                {currentAnalysis.commentary.tips.map((tip, i) => (
                                                    <div key={i} className="flex gap-4 rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4 transition-colors hover:border-[#0093D6]/30">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#0093D6]/20 bg-[#0093D6]/10 text-sm font-black italic text-sky-300">
                                                            0{i + 1}
                                                        </div>
                                                        <div className="text-sm leading-relaxed text-slate-200">{tip}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-[2.6rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                                        <SectionLabel index="05" title="Kinetic Traces" subtitle={`Variance tracked over ${currentAnalysis.clipEndSec - currentAnalysis.clipStartSec} seconds`} />

                                        <div className="mt-6 rounded-[1.7rem] border border-white/10 bg-black/20 p-4">
                                            <div className="flex h-56 items-end gap-1.5">
                                                {currentAnalysis.series.slice(0, 40).map((s, i) => (
                                                    <div key={i} className="group flex-1 rounded-t-md bg-[#0093D6]/20 transition-all hover:bg-[#0093D6]" style={{ height: `${Math.min(100, (s.cadence / 220) * 100)}%` }}>
                                                        <div className="h-full w-full rounded-t-md bg-gradient-to-t from-[#0093D6]/20 to-[#FFF917]/10 opacity-70 transition-opacity group-hover:opacity-100" />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex justify-between text-[8px] font-black uppercase tracking-[0.34em] text-slate-600">
                                                <span>0s</span>
                                                <span>Cadence variance</span>
                                                <span>{currentAnalysis.clipEndSec - currentAnalysis.clipStartSec}s</span>
                                            </div>
                                        </div>

                                        <div className="mt-4 rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
                                            <div className="text-[9px] font-black uppercase tracking-[0.34em] text-slate-500">Technical summary</div>
                                            <div className="mt-3 text-[11px] leading-relaxed text-slate-400">
                                                Model: {currentAnalysis.modelVersion} <br />
                                                Sampling Rate: {SAMPLE_FPS} FPS · Resolution: {(canvasRef.current?.width || 1280)}x{(canvasRef.current?.height || 720)}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hidden canvas for offscreen frame processing */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}

// --- Analysis Engine Helpers ---

function processSamples(samples: PoseSample[], activity: Activity | null) {
    // 1. Calculate Cadence (Steps per minute)
    // Detect peaks in foot movement or just count cycles
    // Simplified: Find periodicity in left/right ankle Y coordinates
    const cadences: number[] = [];
    const windowSize = 5 * SAMPLE_FPS; // 5s sliding window
    for (let i = 0; i < samples.length - windowSize; i += SAMPLE_FPS) {
        const slice = samples.slice(i, i + windowSize);
        const yCoords = slice.map(s => (s.landmarks[31].y + s.landmarks[32].y) / 2); // avg ankle y
        const peaks = findPeaks(yCoords);
        const stepsInWindow = peaks.length;
        const spm = (stepsInWindow / 5) * 60;
        if (spm >= CADENCE_MIN && spm <= CADENCE_MAX) cadences.push(spm);
    }
    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : 0;

    // 2. Vertical Oscillation (Hip displacement)
    // Map landmark difference to cm based on leg length (approx 90cm)
    const oscillations: number[] = [];
    samples.forEach(s => {
        const hipY = (s.landmarks[23].y + s.landmarks[24].y) / 2;
        const ankleY = (s.landmarks[27].y + s.landmarks[28].y) / 2;
        const legPixelLength = Math.max(0.1, Math.abs(hipY - ankleY));
        const pixelsPerCm = legPixelLength / 90;
        oscillations.push(hipY / pixelsPerCm);
    });
    const vertOsc = calculatePeakToPeak(oscillations);

    // 3. Trunk Lean
    const leans: number[] = [];
    samples.forEach(s => {
        const shoulder = (s.landmarks[11].x + s.landmarks[12].x) / 2;
        const hip = (s.landmarks[23].x + s.landmarks[24].x) / 2;
        const shoulderY = (s.landmarks[11].y + s.landmarks[12].y) / 2;
        const hipY = (s.landmarks[23].y + s.landmarks[24].y) / 2;

        // Use visible side if one side is significantly more confident? 
        // For side profile, we look at the angle between shoulder-hip line and vertical
        const angle = Math.atan2(Math.abs(shoulder - hip), Math.abs(shoulderY - hipY)) * (180 / Math.PI);
        leans.push(angle);
    });
    const avgLean = leans.reduce((a, b) => a + b, 0) / leans.length;

    // 4. Overstride Detection
    let overstrideCount = 0;
    samples.forEach(s => {
        const hipX = (s.landmarks[23].x + s.landmarks[24].x) / 2;
        const lAnkleX = s.landmarks[31].x;
        const rAnkleX = s.landmarks[32].x;
        const hipY = (s.landmarks[23].y + s.landmarks[24].y) / 2;
        const ankleY = (s.landmarks[31].y + s.landmarks[32].y) / 2;
        const legLen = Math.abs(hipY - ankleY);

        // If ankle is ahead of hip by more than 20% of leg length at strike
        // (Simplified strike detection: ankle at max forward X)
        if (Math.abs(lAnkleX - hipX) > 0.2 * legLen || Math.abs(rAnkleX - hipX) > 0.2 * legLen) {
            overstrideCount++;
        }
    });
    const overstrideFlag = (overstrideCount / samples.length) > 0.3;

    // Stride Length
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
        // Look for local maxima (foot strike at bottom of frame)
        if (data[i] > data[i - 1] && data[i] > data[i + 1] &&
            data[i] > data[i - 5] && data[i] > data[i + 5]) {
            peaks.push(i);
            i += 10; // Simple debouncing for ~0.6s at 15 FPS
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
