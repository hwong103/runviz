import { useEffect, useMemo, useRef, useState } from 'react';

import { Activity, Crosshair, Expand, Flame, Loader2, RotateCcw, Shield, SlidersHorizontal } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { Activity as RunActivity } from '@/types/activity';
import type { Gear } from '@/types/gear';

import { HeatmapCanvasLayer } from './HeatmapCanvasLayer';
import {
    buildHeatmapRoute,
    calculateHeatmapBounds,
    calculateMainClusterBounds,
    estimateCoveredAreaKm2,
    filterActivitiesForHeatmap,
    type HeatmapBounds,
    type HeatmapColorTheme,
} from './heatmapUtils';
import { useHeatmapStreams } from './useHeatmapStreams';

interface HeatmapWorkspaceProps {
    runActivities: RunActivity[];
    filteredActivities: RunActivity[];
    allShoes: Gear[];
}

const PRIVACY_STORAGE_KEY = 'runviz_heatmap_privacy_radius_v1';
const PRIVACY_OPTIONS = [
    { value: '0', label: 'Off' },
    { value: '100', label: '100 m' },
    { value: '200', label: '200 m' },
    { value: '400', label: '400 m' },
    { value: '800', label: '800 m' },
];

function formatDistanceKm(meters: number) {
    return `${(meters / 1000).toFixed(meters >= 100000 ? 0 : 1)} km`;
}

function formatArea(areaKm2: number) {
    if (areaKm2 >= 1000) return `${areaKm2.toFixed(0)} km²`;
    if (areaKm2 >= 100) return `${areaKm2.toFixed(1)} km²`;
    return `${areaKm2.toFixed(2)} km²`;
}

function readPersistedPrivacyRadius() {
    if (typeof window === 'undefined') return 200;

    try {
        const stored = window.localStorage.getItem(PRIVACY_STORAGE_KEY);
        if (stored === null) return 200;
        const value = Number(stored);
        return [0, 100, 200, 400, 800].includes(value) ? value : 200;
    } catch {
        return 200;
    }
}

function FitHeatmapBounds({
    bounds,
    requestId,
}: {
    bounds: HeatmapBounds | null;
    requestId: number;
}) {
    const map = useMap();
    const didInitialFit = useRef(false);

    useEffect(() => {
        if (!bounds) return;
        if (didInitialFit.current && requestId === 0) return;

        didInitialFit.current = true;
        map.fitBounds(
            L.latLngBounds(
                [bounds.south, bounds.west],
                [bounds.north, bounds.east]
            ),
            { padding: [34, 34], maxZoom: 14 }
        );
    }, [bounds, map, requestId]);

    return null;
}

function StatTile({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail?: string;
}) {
    return (
        <div className="rounded-lg border border-border/70 bg-background/72 px-3 py-2 backdrop-blur-sm">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {label}
            </div>
            <div className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</div>
            {detail ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>
            ) : null}
        </div>
    );
}

export function HeatmapWorkspace({
    runActivities,
    filteredActivities,
    allShoes,
}: HeatmapWorkspaceProps) {
    const { resolved } = useTheme();
    const [shoeFilter, setShoeFilter] = useState('all');
    const [colorTheme, setColorTheme] = useState<HeatmapColorTheme>('ember');
    const [opacity, setOpacity] = useState(0.74);
    const [intensity, setIntensity] = useState(1);
    const [privacyRadius, setPrivacyRadius] = useState(readPersistedPrivacyRadius);
    const [fitRequestId, setFitRequestId] = useState(0);
    const [fitAllRequestId, setFitAllRequestId] = useState(0);
    const {
        streamsByActivityId,
        status,
    } = useHeatmapStreams(runActivities);

    useEffect(() => {
        try {
            window.localStorage.setItem(PRIVACY_STORAGE_KEY, String(privacyRadius));
        } catch {
            // Ignore storage failures; the selected privacy radius still applies for this session.
        }
    }, [privacyRadius]);

    const visibleActivities = useMemo(
        () => filterActivitiesForHeatmap(
            runActivities,
            filteredActivities,
            shoeFilter
        ),
        [filteredActivities, runActivities, shoeFilter]
    );

    const routes = useMemo(
        () => visibleActivities.flatMap((activity) => {
            const streams = streamsByActivityId.get(activity.id);
            if (!streams) return [];
            const route = buildHeatmapRoute(activity, streams, privacyRadius);
            return route ? [route] : [];
        }),
        [privacyRadius, streamsByActivityId, visibleActivities]
    );

    const bounds = useMemo(() => calculateHeatmapBounds(routes), [routes]);
    const mainClusterBounds = useMemo(() => calculateMainClusterBounds(routes), [routes]);
    const visibleDistanceMeters = useMemo(
        () => routes.reduce((sum, route) => sum + route.distanceMeters, 0),
        [routes]
    );
    const originalPointCount = useMemo(
        () => routes.reduce((sum, route) => sum + route.originalPoints, 0),
        [routes]
    );
    const coveredAreaKm2 = useMemo(() => estimateCoveredAreaKm2(bounds), [bounds]);
    const cachedPercent = status.totalRuns > 0
        ? Math.round(((status.cachedRuns + status.skippedRuns) / status.totalRuns) * 100)
        : 0;
    const backfillPosition = status.fetchingActivityId && status.backfillTotalThisSession > 0
        ? Math.min(status.backfillProcessedThisSession + 1, status.backfillTotalThisSession)
        : 0;
    const shoeOptions = useMemo(() => {
        const usedShoeIds = new Set(runActivities.map((activity) => activity.gear_id).filter(Boolean));
        return allShoes
            .filter((shoe) => usedShoeIds.has(shoe.id))
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [allShoes, runActivities]);
    const tileUrl = resolved === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const emptyMessage = runActivities.length === 0
        ? 'Sync Strava runs to build the heatmap.'
        : status.cachedRuns === 0 && status.pendingRuns > 0
            ? 'Fetching GPS streams for your runs.'
            : visibleActivities.length === 0
                ? 'No runs match these filters.'
                : routes.length === 0
                    ? 'No GPS traces remain after filters and privacy trimming.'
                    : null;

    const resetFilters = () => {
        setShoeFilter('all');
        setColorTheme('ember');
        setOpacity(0.74);
        setIntensity(1);
        setPrivacyRadius(200);
    };

    return (
        <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/72 p-3 shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Flame className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">Personal heatmap</p>
                            <Badge tone={status.backfillPaused ? 'orange' : status.backfillActive ? 'blue' : 'emerald'} size="sm">
                                {status.backfillPaused ? 'Paused' : status.backfillActive ? 'Backfilling' : 'Ready'}
                            </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                            {status.backfillActive && status.fetchingActivityId
                                ? `Fetching GPS stream ${backfillPosition} of ${status.backfillTotalThisSession}`
                                : `${cachedPercent}% stream cache complete`}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={shoeFilter} onValueChange={setShoeFilter}>
                        <SelectTrigger className="h-9 min-w-[130px] bg-background/70">
                            <SelectValue aria-label="Shoe filter" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All shoes</SelectItem>
                            {shoeOptions.map((shoe) => (
                                <SelectItem key={shoe.id} value={shoe.id}>{shoe.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 bg-background/70"
                        onClick={() => setFitRequestId((value) => value + 1)}
                        disabled={!mainClusterBounds}
                        aria-label="Focus main running area"
                        title="Focus main running area"
                    >
                        <Crosshair className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 bg-background/70"
                        onClick={() => setFitAllRequestId((value) => value + 1)}
                        disabled={!bounds}
                        aria-label="Fit all visible runs"
                        title="Fit all visible runs"
                    >
                        <Expand className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 bg-background/70"
                        onClick={resetFilters}
                        aria-label="Reset heatmap filters"
                    >
                        <RotateCcw className="size-4" />
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatTile label="Rendered runs" value={routes.length.toLocaleString()} detail={`${visibleActivities.length.toLocaleString()} match filters`} />
                <StatTile label="GPS distance" value={formatDistanceKm(visibleDistanceMeters)} detail={`${originalPointCount.toLocaleString()} source points`} />
                <StatTile label="Covered area" value={formatArea(coveredAreaKm2)} detail="Approximate bounding area" />
                <StatTile label="Stream cache" value={`${cachedPercent}%`} detail={`${status.cachedRuns} cached / ${status.skippedRuns} skipped / ${status.pendingRuns} pending`} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="relative h-[58svh] min-h-[420px] xl:h-[calc(100svh-23rem)] xl:min-h-[560px]">
                        <MapContainer
                            center={[-33.8688, 151.2093]}
                            zoom={11}
                            style={{ height: '100%', width: '100%' }}
                            className="z-0"
                        >
                            <TileLayer
                                url={tileUrl}
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            />
                            <HeatmapCanvasLayer
                                routes={routes}
                                colorTheme={colorTheme}
                                resolvedTheme={resolved}
                                opacity={opacity}
                                intensity={intensity}
                            />
                            <FitHeatmapBounds bounds={mainClusterBounds} requestId={fitRequestId} />
                            <FitHeatmapBounds bounds={bounds} requestId={fitAllRequestId} />
                        </MapContainer>

                        {emptyMessage ? (
                            <div className="absolute inset-x-4 top-4 z-[500] mx-auto max-w-md rounded-xl border border-border bg-card/92 p-4 text-center shadow-lg backdrop-blur-md">
                                <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                    {status.loadingCache || status.fetchingActivityId ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Activity className="size-4" />
                                    )}
                                </div>
                                <p className="mt-3 text-sm font-semibold text-foreground">{emptyMessage}</p>
                                {status.backfillError ? (
                                    <p className="mt-1 text-xs text-orange-500 dark:text-orange-300">{status.backfillError}</p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                <aside className="space-y-3">
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal className="size-4 text-muted-foreground" />
                            <p className="text-sm font-semibold text-foreground">Layer controls</p>
                        </div>

                        <div className="mt-4 space-y-4">
                            <label className="grid gap-2 text-sm">
                                <span className="text-xs font-medium text-muted-foreground">Colour</span>
                                <Select value={colorTheme} onValueChange={(value) => setColorTheme(value as HeatmapColorTheme)}>
                                    <SelectTrigger className="w-full bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ember">Ember</SelectItem>
                                        <SelectItem value="blue">Blue</SelectItem>
                                        <SelectItem value="mono">Mono</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>

                            <label className="grid gap-2 text-sm">
                                <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                    Opacity
                                    <span className="tabular-nums">{Math.round(opacity * 100)}%</span>
                                </span>
                                <input
                                    type="range"
                                    min={0.25}
                                    max={1}
                                    step={0.05}
                                    value={opacity}
                                    onChange={(event) => setOpacity(Number(event.target.value))}
                                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--rv-orange)]"
                                />
                            </label>

                            <label className="grid gap-2 text-sm">
                                <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                    Intensity
                                    <span className="tabular-nums">{intensity.toFixed(1)}x</span>
                                </span>
                                <input
                                    type="range"
                                    min={0.5}
                                    max={2}
                                    step={0.1}
                                    value={intensity}
                                    onChange={(event) => setIntensity(Number(event.target.value))}
                                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--rv-orange)]"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Shield className="size-4 text-muted-foreground" />
                            <p className="text-sm font-semibold text-foreground">Privacy trim</p>
                        </div>
                        <div className="mt-4">
                            <Select value={String(privacyRadius)} onValueChange={(value) => setPrivacyRadius(Number(value))}>
                                <SelectTrigger className="w-full bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PRIVACY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className={cn(
                            'mt-3 text-xs leading-5',
                            privacyRadius > 0 ? 'text-muted-foreground' : 'text-orange-500 dark:text-orange-300'
                        )}>
                            {privacyRadius > 0
                                ? `Start and finish points within ${privacyRadius} m are hidden before drawing. Cached GPS data is unchanged.`
                                : 'Routes are drawn exactly as Strava returns them for this browser session.'}
                        </p>
                    </div>

                    {status.backfillError ? (
                        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-600 dark:text-orange-300">
                            {status.backfillError}
                        </div>
                    ) : null}
                </aside>
            </div>
        </section>
    );
}
