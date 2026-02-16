import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActivities } from '../hooks/useActivities';
import { activities as activitiesApi, google as googleApi } from '../services/api';
import { saveFormAnalysis, listFormAnalyses } from '../services/cache';
import type { Activity, FormAnalysis, FormVideo } from '../types';
import { isRun } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';
import { format } from 'date-fns';

// Pose Analysis Constants
const SAMPLE_FPS = 15;
const CADENCE_MIN = 120;
const CADENCE_MAX = 220;

export default function FormAnalysisPage() {
    const navigate = useNavigate();
    const { activities } = useActivities();

    // UI State
    const [loading, setLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [googleConnected, setGoogleConnected] = useState(false);
    const [sessions, setSessions] = useState<FormAnalysis[]>([]);

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

    // Initialize
    useEffect(() => {
        const init = async () => {
            try {
                // Load local history (this should always work)
                const history = await listFormAnalyses();
                setSessions(history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } catch (error) {
                console.warn('Failed to load form analysis history:', error);
            }

            try {
                // Check Google connection (may 404 if worker not yet deployed with these routes)
                const status = await googleApi.getSessionStatus();
                setGoogleConnected(status.connected);
            } catch (error) {
                console.warn('Google Photos status check unavailable (worker may need redeployment):', error);
                setGoogleConnected(false);
            }

            setLoading(false);
        };
        init();

        // Listen for Google Auth success
        const handleMessage = (event: MessageEvent) => {
            if (event.data === 'google_auth_success') {
                googleApi.getSessionStatus().then(status => setGoogleConnected(status.connected));
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
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

    const openPicker = async () => {
        try {
            const { accessToken } = await googleApi.getToken();

            const picker = new (window as any).google.picker.PickerBuilder()
                .addView(new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.VIDEO)
                    .setParent('root')
                    .setIncludeFolders(true)
                )
                .setOAuthToken(accessToken)
                .setCallback(async (data: any) => {
                    if (data.action === (window as any).google.picker.Action.PICKED) {
                        const item = data.docs[0];
                        // Fetch full details including baseUrl and width/height
                        // Note: Picker returns some fields, but we might need to re-fetch if we want creationTime
                        setSelectedVideo({
                            id: item.id,
                            filename: item.name,
                            mimeType: item.mimeType,
                            creationTime: item.creationTime || new Date().toISOString(),
                            durationSec: 0, // Will load from video element
                            width: item.width || 0,
                            height: item.height || 0,
                            mediaItemId: item.id,
                            baseUrl: item.url, // This might not be the raw video URL, may need more logic
                        });
                        setClipRange([0, 30]);
                        setCurrentAnalysis(null);
                    }
                })
                .build();
            picker.setVisible(true);
        } catch (error) {
            console.error('Failed to open picker:', error);
        }
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
            const samples: any[] = [];

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
        } catch (error: any) {
            console.error('Failed to write to Strava:', error);
            if (error.status === 403) {
                if (confirm('RunViz needs permission to write to your activities. Re-authenticate with write permission now?')) {
                    const callbackUrl = `${window.location.origin}${import.meta.env.BASE_URL}callback`;
                    window.location.href = `${import.meta.env.VITE_API_URL}/auth/strava?redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read,activity:read_all,activity:write`;
                }
            } else {
                alert('Failed to write to Strava. ' + (error.message || ''));
            }
        } finally {
            setIsWritingToStrava(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-white text-xl font-medium">Initializing Lab...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0c10] text-gray-200">
            <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
                <header className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-12">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleBack}
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 group"
                        >
                            <span className="text-2xl group-hover:-translate-x-1 transition-transform inline-block">←</span>
                        </button>
                        <div>
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black italic tracking-tighter">
                                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                                    FORM ANALYSIS LAB
                                </span>
                            </h1>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-gray-500 font-bold uppercase tracking-widest text-[9px]">
                                    ON-DEVICE POSE SENSING
                                </span>
                                <div className="h-1 w-1 bg-gray-500 rounded-full" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-cyan-500/80">Beta v1.0</span>
                            </div>
                        </div>
                    </div>

                    {!googleConnected ? (
                        <button
                            onClick={() => window.open(googleApi.getLoginUrl(), 'google_auth', 'width=600,height=600')}
                            className="bg-white text-black font-black py-4 px-8 rounded-2xl flex items-center gap-3 hover:bg-gray-200 transition-all uppercase tracking-widest text-[11px] shadow-2xl shadow-white/10"
                        >
                            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                            Connect Photos
                        </button>
                    ) : (
                        <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-emerald-500/5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Photos Connected
                        </div>
                    )}
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                    {/* Left Panel: Controls & Video Selection */}
                    <div className="lg:col-span-4 space-y-8">
                        {/* Video Selection */}
                        <section className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10 shadow-2xl overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                <span className="text-8xl">📽️</span>
                            </div>

                            <h2 className="text-lg font-black text-white mb-6 uppercase tracking-tight flex items-center gap-3">
                                <span className="text-cyan-400 text-xl font-normal">01</span> VIDEO SOURCE
                            </h2>

                            {!selectedVideo ? (
                                <button
                                    onClick={openPicker}
                                    disabled={!googleConnected}
                                    className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:grayscale text-black font-black py-6 rounded-[1.5rem] transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-cyan-500/20 uppercase tracking-widest text-xs flex flex-col items-center gap-2"
                                >
                                    <span className="text-2xl">➕</span>
                                    <span>Select from Photos</span>
                                </button>
                            ) : (
                                <div className="space-y-6">
                                    <div className="p-5 bg-black/40 rounded-2xl border border-white/5 relative group/item">
                                        <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1 truncate">{selectedVideo.filename}</div>
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            {format(new Date(selectedVideo.creationTime), 'MMM d, h:mm a')}
                                        </div>
                                        <button
                                            onClick={() => setSelectedVideo(null)}
                                            className="absolute -top-2 -right-2 w-8 h-8 bg-black border border-white/10 rounded-full flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all opacity-0 group-hover/item:opacity-100"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* Clip Range Picker */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Clip Region</label>
                                            <span className="text-[10px] font-black text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-md">
                                                {clipRange[1] - clipRange[0]}s Selected
                                            </span>
                                        </div>
                                        <div className="flex gap-4 items-center">
                                            <div className="flex-1 space-y-2">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max={Math.max(60, clipRange[1])}
                                                    value={clipRange[0]}
                                                    onChange={(e) => setClipRange([parseInt(e.target.value), Math.max(parseInt(e.target.value) + 1, clipRange[1])])}
                                                    className="w-full accent-cyan-500"
                                                />
                                                <input
                                                    type="range"
                                                    min={clipRange[0] + 1}
                                                    max={Math.max(60, clipRange[1] + 30)}
                                                    value={clipRange[1]}
                                                    onChange={(e) => setClipRange([clipRange[0], parseInt(e.target.value)])}
                                                    className="w-full accent-cyan-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Activity Linkage */}
                            <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Link to Activity</h2>
                                {activeActivity ? (
                                    <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 flex items-center gap-4">
                                        <div className="text-2xl">⚡</div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-black text-white truncate">{activeActivity.name}</div>
                                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                                                {format(parseActivityLocalDate(activeActivity.start_date_local), 'MMM d, yyyy')} • {(activeActivity.distance / 1000).toFixed(2)}km
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedActivityManual(null); setMatchingActivity(null); }}
                                            className="ml-auto text-gray-600 hover:text-red-400 transition-colors"
                                        >✕</button>
                                    </div>
                                ) : (
                                    <select
                                        onChange={(e) => setSelectedActivityManual(activities.find(a => a.id === parseInt(e.target.value)) || null)}
                                        className="w-full bg-black/40 text-gray-400 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl border border-white/5 outline-none focus:border-cyan-500/50 transition-all appearance-none"
                                    >
                                        <option value="">Manual Match (Optional)...</option>
                                        {activities.filter(isRun).slice(0, 20).map(a => (
                                            <option key={a.id} value={a.id}>
                                                {format(parseActivityLocalDate(a.start_date_local), 'MMM d')} - {a.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </section>

                        {/* Recent Analyses List */}
                        <section className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10 shadow-2xl">
                            <h2 className="text-lg font-black text-white mb-6 uppercase tracking-tight flex items-center gap-3">
                                <span>📋</span> HISTORY
                            </h2>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {sessions.length === 0 ? (
                                    <div className="text-center py-12 px-6 bg-black/20 rounded-3xl border border-dashed border-white/5">
                                        <div className="text-2xl mb-2 opacity-20">📊</div>
                                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                                            No sessions captured yet. Start your first analysis.
                                        </p>
                                    </div>
                                ) : (
                                    sessions.map(s => (
                                        <div
                                            key={s.id}
                                            onClick={() => setCurrentAnalysis(s)}
                                            className={`p-5 rounded-2xl transition-all cursor-pointer border ${currentAnalysis?.id === s.id ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-black/20 border-white/5 hover:border-white/10'}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">
                                                    {format(new Date(s.createdAt), 'MMM d')}
                                                </span>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                    {s.metrics.cadence} SPM
                                                </span>
                                            </div>
                                            <div className="text-[11px] font-bold text-gray-200 line-clamp-1 italic">
                                                "{s.commentary.tips[0]}"
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Right Panel: Analysis Canvas & Results */}
                    <div className="lg:col-span-8 space-y-8">
                        {!currentAnalysis ? (
                            <div className="bg-white/5 rounded-[3rem] border border-white/10 overflow-hidden min-h-[700px] flex flex-col items-center justify-center p-12 relative">
                                {/* Analysis Background Patterns */}
                                <div className="absolute inset-0 opacity-[0.02] pointer-events-none overflow-hidden">
                                    <div className="grid grid-cols-20 grid-rows-20 gap-px w-full h-full">
                                        {Array.from({ length: 400 }).map((_, i) => (
                                            <div key={i} className="bg-white border-t border-l border-transparent" />
                                        ))}
                                    </div>
                                </div>

                                {selectedVideo ? (
                                    <div className="w-full flex flex-col items-center gap-10 z-10">
                                        <div className="relative w-full aspect-video max-w-2xl bg-black rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/10">
                                            <video
                                                ref={videoRef}
                                                src={selectedVideo.baseUrl}
                                                className="w-full h-full object-contain"
                                                crossOrigin="anonymous"
                                                playsInline
                                            />
                                            {isAnalyzing && (
                                                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
                                                    <div className="relative w-32 h-32">
                                                        <svg className="w-full h-full -rotate-90">
                                                            <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/10" />
                                                            <circle
                                                                cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent"
                                                                className="text-cyan-500 transition-all duration-300"
                                                                strokeDasharray={2 * Math.PI * 60}
                                                                strokeDashoffset={2 * Math.PI * 60 * (1 - analysisProgress / 100)}
                                                            />
                                                        </svg>
                                                        <div className="absolute inset-0 flex items-center justify-center font-black text-2xl tracking-tighter italic">
                                                            {analysisProgress}%
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 animate-pulse">Running Pose Lab</div>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={runAnalysis}
                                            disabled={isAnalyzing}
                                            className="group bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-black py-5 px-16 rounded-full transition-all transform hover:scale-[1.05] active:scale-[0.95] shadow-2xl shadow-cyan-500/40 uppercase tracking-widest text-sm flex items-center gap-4"
                                        >
                                            <span className="text-xl">🚀</span>
                                            <span>BEGIN LAB SEQUENCE</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center z-10">
                                        <div className="w-32 h-32 bg-cyan-500/10 rounded-full flex items-center justify-center mb-8 mx-auto ring-1 ring-cyan-500/20 shadow-2xl">
                                            <span className="text-5xl animate-bounce">🧪</span>
                                        </div>
                                        <h3 className="text-3xl font-black text-white mb-6 italic tracking-tight uppercase">Ready for Discovery?</h3>
                                        <p className="text-gray-500 max-w-sm mx-auto mb-10 font-bold uppercase tracking-widest leading-relaxed text-[11px]">
                                            Select a treadmill side-profile video to begin the kinetic chain analysis.
                                        </p>
                                        <button
                                            onClick={openPicker}
                                            disabled={!googleConnected}
                                            className="border border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/5 px-10 py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] font-black text-gray-400 hover:text-cyan-400"
                                        >
                                            Launch Picker Widget
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Analysis Results View */
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Hero Results Card */}
                                <section className="bg-white/5 rounded-[3rem] p-10 sm:p-14 border border-white/10 shadow-2xl relative overflow-hidden">
                                    {/* Glass Geometric Accents */}
                                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
                                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-8 relative z-10">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">Lab Session Complete</span>
                                                <span className="text-gray-600 text-[9px] font-black uppercase tracking-[0.2em]">Confidence: {(currentAnalysis.commentary.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                            <h2 className="text-5xl font-black text-white italic tracking-tighter mb-2">SCORE ANALYSIS</h2>
                                            <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">
                                                Captured {format(new Date(currentAnalysis.createdAt), 'MMMM do, yyyy • h:mm a')}
                                            </p>
                                        </div>

                                        <div className="flex gap-4">
                                            {activeActivity && !currentAnalysis.lastWrittenAt && (
                                                <button
                                                    onClick={handleWriteToStrava}
                                                    disabled={isWritingToStrava}
                                                    className="bg-[#FC4C02] hover:bg-[#E34402] text-white font-black py-4 px-8 rounded-2xl transition-all shadow-xl shadow-[#FC4C02]/20 uppercase tracking-widest text-[11px] flex items-center gap-3 shrink-0"
                                                >
                                                    {isWritingToStrava ? 'Syncing...' : 'Write to Strava'}
                                                </button>
                                            )}
                                            {currentAnalysis.lastWrittenAt && (
                                                <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                                                    ✓ Written to Activity
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setCurrentAnalysis(null)}
                                                className="bg-white/5 hover:bg-white/10 text-white font-black p-4 rounded-2xl border border-white/10 transition-all flex items-center justify-center shrink-0"
                                            >
                                                <span>✕</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Metric Grid */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-16 relative z-10">
                                        <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 shadow-inner">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Cadence</div>
                                            <div className="flex items-baseline gap-2">
                                                <div className="text-4xl font-black text-white italic tracking-tighter">{currentAnalysis.metrics.cadence}</div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">spm</div>
                                            </div>
                                        </div>
                                        <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 shadow-inner">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Vertical Osc.</div>
                                            <div className="flex items-baseline gap-2">
                                                <div className="text-4xl font-black text-white italic tracking-tighter">{currentAnalysis.metrics.verticalOscillation.toFixed(1)}</div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">cm</div>
                                            </div>
                                        </div>
                                        <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 shadow-inner">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Trunk Lean</div>
                                            <div className="flex items-baseline gap-2">
                                                <div className="text-4xl font-black text-white italic tracking-tighter">{currentAnalysis.metrics.trunkLean.toFixed(1)}</div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">deg</div>
                                            </div>
                                        </div>
                                        <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 shadow-inner">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Overstride</div>
                                            <div className={`text-4xl font-black italic tracking-tighter ${currentAnalysis.metrics.overstrideFlag ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {currentAnalysis.metrics.overstrideFlag ? 'Detected' : 'Neutral'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stride Length (Solo highlight) */}
                                    {currentAnalysis.metrics.strideLength && (
                                        <div className="mt-8 p-8 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-[2rem] border border-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">Calculated Stride Length</div>
                                                <div className="text-sm font-medium text-gray-300">Based on activity speed ({(activeActivity?.average_speed! * 3.6).toFixed(1)} km/h)</div>
                                            </div>
                                            <div className="flex items-baseline gap-3">
                                                <div className="text-5xl font-black text-white italic tracking-tighter">{currentAnalysis.metrics.strideLength.toFixed(2)}</div>
                                                <div className="text-sm font-black text-gray-500 uppercase tracking-widest">meters</div>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                {/* Commentary and Coaching Card */}
                                <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="bg-white/5 rounded-[3rem] p-10 border border-white/10 shadow-2xl">
                                        <h3 className="text-xl font-black text-white mb-8 flex items-center gap-4 uppercase tracking-tighter">
                                            <span className="w-8 h-8 bg-cyan-400/20 rounded-full flex items-center justify-center text-cyan-400">⚡</span>
                                            COACH'S COMMENTARY
                                        </h3>
                                        <div className="space-y-6">
                                            <div className="p-8 bg-white/5 rounded-3xl border border-white/5 text-gray-200 font-medium leading-relaxed italic text-lg leading-loose quote">
                                                "{currentAnalysis.commentary.baselineComparison}"
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">PRIORITY TIPS</h4>
                                                {currentAnalysis.commentary.tips.map((tip, i) => (
                                                    <div key={i} className="flex gap-5 p-5 bg-black/20 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-all">
                                                        <div className="text-cyan-400 font-black text-xl italic opacity-50 font-mono">0{i + 1}</div>
                                                        <div className="text-sm font-bold text-gray-200 leading-relaxed group-hover:text-white">{tip}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Technical Chart/Details Space */}
                                    <div className="bg-white/5 rounded-[3rem] p-10 border border-white/10 shadow-2xl flex flex-col justify-between">
                                        <div>
                                            <h3 className="text-xl font-black text-white mb-8 flex items-center gap-4 uppercase tracking-tighter">
                                                <span className="w-8 h-8 bg-indigo-400/20 rounded-full flex items-center justify-center text-indigo-400">🧪</span>
                                                KINETIC TRACES
                                            </h3>
                                            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed mb-8">
                                                Stride-by-stride biomechanical variance tracked over {currentAnalysis.clipEndSec - currentAnalysis.clipStartSec} seconds.
                                            </p>
                                        </div>

                                        <div className="space-y-4 mb-4">
                                            {/* Minimal Data Visualization Concept */}
                                            <div className="h-40 flex items-end gap-1 px-4 border-l border-b border-white/5">
                                                {currentAnalysis.series.slice(0, 40).map((s, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex-1 bg-cyan-500/20 hover:bg-cyan-500 transition-all rounded-t-sm"
                                                        style={{ height: `${Math.min(100, (s.cadence / 220) * 100)}%` }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex justify-between text-[8px] font-black text-gray-600 uppercase tracking-widest px-2">
                                                <span>0s</span>
                                                <span>TEMPORAL SERIES (CADENCE VARIANCE)</span>
                                                <span>{currentAnalysis.clipEndSec - currentAnalysis.clipStartSec}s</span>
                                            </div>
                                        </div>

                                        <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Technical Summary</div>
                                            <div className="text-[11px] font-medium text-gray-400">
                                                Model: {currentAnalysis.modelVersion} <br />
                                                Sampling Rate: {SAMPLE_FPS} FPS • Resolution: {(canvasRef.current?.width || 1280)}x{(canvasRef.current?.height || 720)}
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

function processSamples(samples: any[], activity: Activity | null) {
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

function generateCommentary(metrics: any, baseline: any): FormAnalysis['commentary'] {
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
