import type { ChangeEvent, DragEvent } from 'react';
import { format } from 'date-fns';
import {
    Activity as ActivityIcon,
    ArrowLeft,
    Check,
    FileVideo,
    Loader2,
    Play,
    TrendingUp,
    Video,
    X,
    Zap,
} from 'lucide-react';

import { parseActivityLocalDate } from '@/utils/activityDate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/MetricCard';
import { cn } from '@/lib/utils';

import { SAMPLE_FPS } from '@/features/form-analysis/poseProcessing';
import { useFormAnalysisWorkflow } from '@/features/form-analysis/useFormAnalysisWorkflow';
import { isRun } from '@/types/activity';
import type { FormAnalysis } from '@/types/formAnalysis';

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
                <div
                    className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                        active
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-border bg-muted text-muted-foreground',
                    )}
                >
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
    const {
        ACCEPTED_VIDEO_TYPES,
        SAMPLE_FPS: workflowSampleFps,
        activeActivity,
        activities,
        analysisProgress,
        canvasRef,
        clearVideo,
        clearActiveActivity,
        clipRange,
        currentAnalysis,
        fileInputRef,
        formatClipDate,
        handleFileSelect,
        handleWriteToStrava,
        isAnalyzing,
        isDragging,
        isWritingToStrava,
        loading,
        runAnalysis,
        selectHistoryAnalysis,
        selectedVideo,
        sessions,
        setClipRange,
        setCurrentAnalysis,
        setIsDragging,
        setSelectedActivityManual,
        updateSelectedVideoMetadata,
        videoRef,
    } = useFormAnalysisWorkflow();

    const handleFileDrop = (event: DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleFileSelect(file);
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
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_VIDEO_TYPES.join(',')}
                onChange={handleFileInputChange}
                className="hidden"
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Video source</CardTitle>
                            <CardDescription>Upload a clip to analyze your running form</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!selectedVideo ? (
                                <div
                                    onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
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
                                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-foreground">{selectedVideo.filename}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {formatClipDate(selectedVideo.creationTime)}
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
                                                onChange={(event) => setClipRange([parseInt(event.target.value, 10), Math.max(parseInt(event.target.value, 10) + 1, clipRange[1])])}
                                                className="range-slider w-full"
                                            />
                                            <input
                                                type="range"
                                                min={clipRange[0] + 1}
                                                max={Math.max(60, clipRange[1] + 30)}
                                                value={clipRange[1]}
                                                onChange={(event) => setClipRange([clipRange[0], parseInt(event.target.value, 10)])}
                                                className="range-slider w-full"
                                            />
                                        </div>
                                    </div>

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
                                                        onClick={clearActiveActivity}
                                                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <select
                                                    onChange={(event) => setSelectedActivityManual(activities.find((activity) => activity.id === parseInt(event.target.value, 10)) || null)}
                                                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                                >
                                                    <option value="">Choose a run manually (optional)...</option>
                                                    {activities.filter(isRun).slice(0, 20).map((activity) => (
                                                        <option key={activity.id} value={activity.id}>
                                                            {format(parseActivityLocalDate(activity.start_date_local), 'MMM d')} - {activity.name}
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
                                <div className="custom-scrollbar max-h-[430px] space-y-2 overflow-y-auto pr-1">
                                    {sessions.map((analysis) => (
                                        <HistoryRow
                                            key={analysis.id}
                                            analysis={analysis}
                                            active={currentAnalysis?.id === analysis.id}
                                            onClick={() => selectHistoryAnalysis(analysis)}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

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
                                        <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
                                            <div className="relative aspect-video">
                                                <video
                                                    ref={videoRef}
                                                    src={selectedVideo.baseUrl}
                                                    className="h-full w-full object-contain"
                                                    playsInline
                                                    controls
                                                    onLoadedMetadata={(event) => {
                                                        const video = event.currentTarget;
                                                        updateSelectedVideoMetadata(
                                                            Math.floor(video.duration),
                                                            video.videoWidth,
                                                            video.videoHeight,
                                                        );
                                                    }}
                                                />
                                                {isAnalyzing ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-md">
                                                        <LabProgressRing progress={analysisProgress} />
                                                        <div className="text-center">
                                                            <div className="text-sm font-medium text-foreground">Analyzing running form</div>
                                                            <div className="mt-1 text-xs text-muted-foreground">Sampling at {workflowSampleFps} FPS</div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

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
                                        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
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
                                            {activeActivity && !currentAnalysis.lastWrittenAt ? (
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
                                            ) : null}
                                            {currentAnalysis.lastWrittenAt ? (
                                                <Badge tone="emerald" size="sm">Written to activity</Badge>
                                            ) : null}
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

                                    {currentAnalysis.metrics.strideLength ? (
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
                                    ) : null}
                                </CardContent>
                            </Card>

                            <div className="grid gap-6 xl:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Coach commentary</CardTitle>
                                        <CardDescription>What the model sees, and what to fix next</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm italic leading-relaxed text-muted-foreground">
                                            "{currentAnalysis.commentary.baselineComparison}"
                                        </div>

                                        <div className="space-y-2">
                                            {currentAnalysis.commentary.tips.map((tip, index) => (
                                                <div key={index} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:border-primary/30">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary">
                                                        {index + 1}
                                                    </div>
                                                    <div className="text-sm leading-relaxed text-muted-foreground">{tip}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Kinetic traces</CardTitle>
                                        <CardDescription>Variance tracked over {currentAnalysis.clipEndSec - currentAnalysis.clipStartSec} seconds</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="rounded-lg border border-border bg-muted/50 p-4">
                                            <div className="flex h-48 items-end gap-1.5">
                                                {currentAnalysis.series.slice(0, 40).map((seriesPoint, index) => (
                                                    <div key={index} className="group flex-1 rounded-t-md bg-chart-1/20 transition-all hover:bg-chart-1" style={{ height: `${Math.min(100, (seriesPoint.cadence / 220) * 100)}%` }}>
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
                                                Sampling Rate: {SAMPLE_FPS} FPS · Resolution: {(selectedVideo?.width || 1280)}x{(selectedVideo?.height || 720)}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
