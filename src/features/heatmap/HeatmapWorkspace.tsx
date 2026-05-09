import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Activity, Crosshair, Expand, Flame, Loader2, RotateCcw, Shield, SlidersHorizontal } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
const SETTINGS_STORAGE_KEY = 'runviz_heatmap_settings_v1';
const PRIVACY_OPTIONS = [
    { value: '0', label: 'Off' },
    { value: '100', label: '100 m' },
    { value: '200', label: '200 m' },
    { value: '400', label: '400 m' },
    { value: '800', label: '800 m' },
];
const COLOR_THEMES: HeatmapColorTheme[] = ['ember', 'blue', 'mono'];
type HeatmapActivityScope = 'all' | 'period';

interface PersistedHeatmapSettings {
    colorTheme: HeatmapColorTheme;
    opacity: number;
    intensity: number;
    privacyRadius: number;
    activityScope: HeatmapActivityScope;
}

const DEFAULT_HEATMAP_SETTINGS: PersistedHeatmapSettings = {
    colorTheme: 'ember',
    opacity: 0.74,
    intensity: 1,
    privacyRadius: 200,
    activityScope: 'all',
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value))
        : fallback;
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

function readPersistedHeatmapSettings(): PersistedHeatmapSettings {
    if (typeof window === 'undefined') return DEFAULT_HEATMAP_SETTINGS;

    try {
        const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!stored) {
            return {
                ...DEFAULT_HEATMAP_SETTINGS,
                privacyRadius: readPersistedPrivacyRadius(),
            };
        }

        const parsed = JSON.parse(stored) as Partial<PersistedHeatmapSettings>;
        return {
            colorTheme: parsed.colorTheme && COLOR_THEMES.includes(parsed.colorTheme)
                ? parsed.colorTheme
                : DEFAULT_HEATMAP_SETTINGS.colorTheme,
            opacity: clampNumber(parsed.opacity, DEFAULT_HEATMAP_SETTINGS.opacity, 0.25, 1),
            intensity: clampNumber(parsed.intensity, DEFAULT_HEATMAP_SETTINGS.intensity, 0.5, 2),
            privacyRadius: [0, 100, 200, 400, 800].includes(Number(parsed.privacyRadius))
                ? Number(parsed.privacyRadius)
                : readPersistedPrivacyRadius(),
            activityScope: parsed.activityScope === 'period'
                ? 'period'
                : DEFAULT_HEATMAP_SETTINGS.activityScope,
        };
    } catch {
        return {
            ...DEFAULT_HEATMAP_SETTINGS,
            privacyRadius: readPersistedPrivacyRadius(),
        };
    }
}

function rangeFillStyle(value: number, min: number, max: number): CSSProperties {
    const fill = ((value - min) / (max - min)) * 100;
    return {
        '--slider-fill': `${Math.max(0, Math.min(100, fill))}%`,
        '--rv-blue': 'var(--rv-orange)',
    } as CSSProperties;
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

export function HeatmapWorkspace({
    runActivities,
    filteredActivities,
    allShoes,
}: HeatmapWorkspaceProps) {
    const { resolved } = useTheme();
    const [shoeFilter, setShoeFilter] = useState('all');
    const [settings, setSettings] = useState(readPersistedHeatmapSettings);
    const [fitRequestId, setFitRequestId] = useState(0);
    const [fitAllRequestId, setFitAllRequestId] = useState(0);
    const { colorTheme, opacity, intensity, privacyRadius, activityScope } = settings;
    const {
        streamsByActivityId,
        status,
    } = useHeatmapStreams(runActivities);

    useEffect(() => {
        try {
            window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
            window.localStorage.setItem(PRIVACY_STORAGE_KEY, String(settings.privacyRadius));
        } catch {
            // Ignore storage failures; selected heatmap settings still apply for this session.
        }
    }, [settings]);

    const visibleActivities = useMemo(
        () => filterActivitiesForHeatmap(
            runActivities,
            activityScope === 'period' ? filteredActivities : runActivities,
            shoeFilter
        ),
        [activityScope, filteredActivities, runActivities, shoeFilter]
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
    const backfillPosition = status.fetchingActivityId && status.backfillTotalThisSession > 0
        ? Math.min(status.backfillProcessedThisSession + 1, status.backfillTotalThisSession)
        : 0;
    const headerStatusText = status.backfillPaused
        ? (status.backfillError ?? 'GPS backfill paused')
        : status.loadingCache
            ? 'Loading cached GPS streams'
            : status.backfillActive && status.fetchingActivityId
            ? `Fetching GPS stream ${backfillPosition} of ${status.backfillTotalThisSession}`
            : `${routes.length.toLocaleString()} rendered ${routes.length === 1 ? 'run' : 'runs'}`;
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
        setSettings(DEFAULT_HEATMAP_SETTINGS);
    };

    const setColorTheme = (value: HeatmapColorTheme) => {
        setSettings((previous) => ({ ...previous, colorTheme: value }));
    };

    const setOpacity = (value: number) => {
        setSettings((previous) => ({ ...previous, opacity: value }));
    };

    const setIntensity = (value: number) => {
        setSettings((previous) => ({ ...previous, intensity: value }));
    };

    const setPrivacyRadius = (value: number) => {
        setSettings((previous) => ({ ...previous, privacyRadius: value }));
    };

    const setActivityScope = (value: HeatmapActivityScope) => {
        setSettings((previous) => ({ ...previous, activityScope: value }));
    };

    return (
        <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/72 p-3 shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Flame className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Personal heatmap</p>
                        <p className={cn(
                            'mt-1 truncate text-xs',
                            status.backfillPaused ? 'text-orange-500 dark:text-orange-300' : 'text-muted-foreground'
                        )}>
                            {headerStatusText}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={shoeFilter} onValueChange={setShoeFilter}>
                        <SelectTrigger className="h-11 min-w-[130px] bg-background/70 md:h-9">
                            <SelectValue aria-label="Shoe filter" />
                        </SelectTrigger>
                        <SelectContent className="z-[750]">
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
                        className="size-11 bg-background/70 md:size-9"
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
                        className="size-11 bg-background/70 md:size-9"
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
                        className="size-11 bg-background/70 md:size-9"
                        onClick={resetFilters}
                        aria-label="Reset heatmap filters"
                    >
                        <RotateCcw className="size-4" />
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-11 bg-background/70 md:size-9"
                                aria-label="Heatmap settings"
                                title="Heatmap settings"
                            >
                                <SlidersHorizontal className="size-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="z-[700] w-[min(22rem,calc(100vw-2rem))] p-4">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal className="size-4 text-muted-foreground" />
                                <p className="text-sm font-semibold text-foreground">Settings</p>
                            </div>

                            <div className="mt-4 space-y-5">
                                <label className="grid gap-2 text-sm">
                                    <span className="text-xs font-medium text-muted-foreground">Activities</span>
                                    <Select value={activityScope} onValueChange={(value) => setActivityScope(value as HeatmapActivityScope)}>
                                        <SelectTrigger className="w-full bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="z-[750]">
                                            <SelectItem value="all">All activities</SelectItem>
                                            <SelectItem value="period">Current time filter</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </label>

                                <label className="grid gap-2 text-sm">
                                    <span className="text-xs font-medium text-muted-foreground">Colour</span>
                                    <Select value={colorTheme} onValueChange={(value) => setColorTheme(value as HeatmapColorTheme)}>
                                        <SelectTrigger className="w-full bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="z-[750]">
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
                                        style={rangeFillStyle(opacity, 0.25, 1)}
                                        className="range-slider h-11 w-full"
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
                                        style={rangeFillStyle(intensity, 0.5, 2)}
                                        className="range-slider h-11 w-full"
                                    />
                                </label>

                                <div className="space-y-3 border-t border-border pt-4">
                                    <div className="flex items-center gap-2">
                                        <Shield className="size-4 text-muted-foreground" />
                                        <p className="text-sm font-semibold text-foreground">Privacy trim</p>
                                    </div>
                                    <Select value={String(privacyRadius)} onValueChange={(value) => setPrivacyRadius(Number(value))}>
                                        <SelectTrigger className="w-full bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="z-[750]">
                                            {PRIVACY_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className={cn(
                                        'text-xs leading-5',
                                        privacyRadius > 0 ? 'text-muted-foreground' : 'text-orange-500 dark:text-orange-300'
                                    )}>
                                        {privacyRadius > 0
                                            ? `Start and finish points within ${privacyRadius} m are hidden before drawing. Cached GPS data is unchanged.`
                                            : 'Routes are drawn exactly as Strava returns them for this browser session.'}
                                    </p>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="grid gap-4">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="relative h-[68svh] min-h-[460px] xl:h-[calc(100svh-13rem)] xl:min-h-[620px]">
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

                    {status.backfillError ? (
                        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-600 dark:text-orange-300">
                            {status.backfillError}
                        </div>
                    ) : null}
            </div>
        </section>
    );
}
