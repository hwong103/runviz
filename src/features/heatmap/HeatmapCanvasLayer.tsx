import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';

import L from 'leaflet';
import { useMap } from 'react-leaflet';

import type { ResolvedTheme } from '@/hooks/useTheme';

import type { HeatmapColorTheme, HeatmapMode, HeatmapPoint, HeatmapRoute } from './heatmapUtils';

interface HeatmapCanvasLayerProps {
    routes: HeatmapRoute[];
    colorTheme: HeatmapColorTheme;
    mode: HeatmapMode;
    resolvedTheme: ResolvedTheme;
    opacity: number;
    intensity: number;
}

interface StrokePalette {
    base: string;
    glow: string;
    mid: string;
    hot: string;
}

interface ProjectedSegment {
    from: L.Point;
    to: L.Point;
    density: number;
    speed: number | null;
    heartRate: number | null;
    grade: number | null;
}

interface SegmentStroke {
    width: number;
    color: string;
    alpha: number;
    composite?: GlobalCompositeOperation;
}

interface SegmentCache {
    routes: HeatmapRoute[];
    zoom: number;
    centerKey: string;
    sizeKey: string;
    segments: ProjectedSegment[];
}

interface ValueRange {
    min: number;
    max: number;
}

const DENSITY_CELL_SIZE_PX = 18;
const FALLBACK_COLORS = {
    ember: {
        light: '#c05c1a',
        dark: '#df8759',
    },
    blue: {
        light: '#2855d8',
        dark: '#7c9cff',
    },
    mono: {
        light: '#18181b',
        dark: '#f4f4f5',
    },
};

const METRIC_COLORS = {
    pace: ['#06143f', '#154fd7', '#3c91ff', '#cfe1ff'],
    heartRate: ['#4c0710', '#b91c1c', '#fb7185', '#ffe4e6'],
    gradient: ['#18181b', '#71717a', '#f4f4f5'],
    descent: '#22c55e',
    climb: '#d946ef',
};

function readCssColor(variableName: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;

    const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return value || fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;

    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
    };
}

function withAlpha(color: string, alpha: number, fallback: string): string {
    const rgb = hexToRgb(color) ?? hexToRgb(fallback);
    if (!rgb) return fallback;

    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixColor(left: string, right: string, amount: number): string {
    const leftRgb = hexToRgb(left);
    const rightRgb = hexToRgb(right);
    if (!leftRgb || !rightRgb) return right;

    const t = Math.max(0, Math.min(1, amount));
    const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
    return `rgb(${channel(leftRgb.r, rightRgb.r)}, ${channel(leftRgb.g, rightRgb.g)}, ${channel(leftRgb.b, rightRgb.b)})`;
}

function rampColor(colors: string[], value: number): string {
    const t = Math.max(0, Math.min(1, value));
    if (colors.length === 0) return '#ffffff';
    if (colors.length === 1) return colors[0];

    const scaled = t * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    return mixColor(colors[index], colors[index + 1], scaled - index);
}

function getPalette(colorTheme: HeatmapColorTheme, resolvedTheme: ResolvedTheme): StrokePalette {
    const mode = resolvedTheme === 'light' ? 'light' : 'dark';
    const themeColor = colorTheme === 'mono'
        ? readCssColor('--foreground', FALLBACK_COLORS.mono[mode])
        : readCssColor(colorTheme === 'blue' ? '--rv-blue' : '--rv-orange', FALLBACK_COLORS[colorTheme][mode]);
    const fallback = FALLBACK_COLORS[colorTheme][mode];

    if (colorTheme === 'blue') {
        return resolvedTheme === 'light'
            ? { base: themeColor, glow: withAlpha(themeColor, 0.11, fallback), mid: withAlpha(themeColor, 0.23, fallback), hot: withAlpha(themeColor, 0.44, fallback) }
            : { base: themeColor, glow: withAlpha(themeColor, 0.13, fallback), mid: withAlpha(themeColor, 0.26, fallback), hot: withAlpha(themeColor, 0.54, fallback) };
    }

    if (colorTheme === 'mono') {
        return resolvedTheme === 'light'
            ? { base: themeColor, glow: withAlpha(themeColor, 0.08, fallback), mid: withAlpha(themeColor, 0.16, fallback), hot: withAlpha(themeColor, 0.34, fallback) }
            : { base: themeColor, glow: withAlpha(themeColor, 0.08, fallback), mid: withAlpha(themeColor, 0.18, fallback), hot: withAlpha(themeColor, 0.42, fallback) };
    }

    return resolvedTheme === 'light'
        ? { base: themeColor, glow: withAlpha(themeColor, 0.10, fallback), mid: withAlpha(themeColor, 0.22, fallback), hot: withAlpha(themeColor, 0.46, fallback) }
        : { base: themeColor, glow: withAlpha(themeColor, 0.12, fallback), mid: withAlpha(themeColor, 0.26, fallback), hot: withAlpha(themeColor, 0.55, fallback) };
}

function segmentDensityKey(from: L.Point, to: L.Point): string {
    const midpointX = (from.x + to.x) / 2;
    const midpointY = (from.y + to.y) / 2;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const normalizedAngle = angle < 0 ? angle + Math.PI : angle;
    const directionBucket = Math.round(normalizedAngle / (Math.PI / 8));

    return [
        Math.round(midpointX / DENSITY_CELL_SIZE_PX),
        Math.round(midpointY / DENSITY_CELL_SIZE_PX),
        directionBucket,
    ].join(':');
}

function averageNullable(left: number | null, right: number | null): number | null {
    if (left !== null && right !== null) return (left + right) / 2;
    return left ?? right;
}

function projectPoint(map: L.Map, point: HeatmapPoint): L.Point {
    return map.latLngToContainerPoint([point.lat, point.lng]);
}

function buildProjectedSegments(map: L.Map, routes: HeatmapRoute[]): ProjectedSegment[] {
    const segments: Array<ProjectedSegment & { key: string }> = [];
    const counts = new Map<string, number>();

    routes.forEach((route) => {
        if (route.points.length < 2) return;

        const projected = route.points.map((point) => projectPoint(map, point));
        for (let index = 1; index < projected.length; index++) {
            const from = projected[index - 1];
            const to = projected[index];
            const previousPoint = route.points[index - 1];
            const point = route.points[index];
            const key = segmentDensityKey(from, to);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            segments.push({
                from,
                to,
                key,
                density: 1,
                speed: averageNullable(previousPoint.speed, point.speed),
                heartRate: averageNullable(previousPoint.heartRate, point.heartRate),
                grade: averageNullable(previousPoint.grade, point.grade),
            });
        }
    });

    return segments.map((segment) => ({
        from: segment.from,
        to: segment.to,
        density: counts.get(segment.key) ?? 1,
        speed: segment.speed,
        heartRate: segment.heartRate,
        grade: segment.grade,
    }));
}

function getProjectedSegments(map: L.Map, routes: HeatmapRoute[], cache: MutableRefObject<SegmentCache | null>): ProjectedSegment[] {
    const zoom = map.getZoom();
    const center = map.getCenter();
    const size = map.getSize();
    const centerKey = `${center.lat.toFixed(5)}:${center.lng.toFixed(5)}`;
    const sizeKey = `${size.x}:${size.y}`;
    const cached = cache.current;

    if (
        cached &&
        cached.routes === routes &&
        cached.zoom === zoom &&
        cached.centerKey === centerKey &&
        cached.sizeKey === sizeKey
    ) {
        return cached.segments;
    }

    const segments = buildProjectedSegments(map, routes);
    cache.current = { routes, zoom, centerKey, sizeKey, segments };
    return segments;
}

function ensureCanvasSize(canvas: HTMLCanvasElement, size: L.Point, dpr: number) {
    const width = Math.max(1, Math.floor(size.x * dpr));
    const height = Math.max(1, Math.floor(size.y * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (canvas.style.width !== `${size.x}px`) canvas.style.width = `${size.x}px`;
    if (canvas.style.height !== `${size.y}px`) canvas.style.height = `${size.y}px`;
}

function percentile(values: number[], percentage: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = (sorted.length - 1) * percentage;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function rangeFor(values: number[]): ValueRange | null {
    const cleanValues = values.filter((value) => Number.isFinite(value));
    if (cleanValues.length === 0) return null;

    const min = percentile(cleanValues, 0.05);
    const max = percentile(cleanValues, 0.95);
    if (max <= min) return {
        min: Math.min(...cleanValues),
        max: Math.max(...cleanValues),
    };

    return { min, max };
}

function normalize(value: number, range: ValueRange | null): number {
    if (!range || range.max <= range.min) return 0.5;
    return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}

function getSegmentMetric(segment: ProjectedSegment, mode: HeatmapMode): number | null {
    if (mode === 'pace') return segment.speed;
    if (mode === 'heart-rate') return segment.heartRate;
    if (mode === 'gradient-absolute') return segment.grade === null ? null : Math.abs(segment.grade);
    if (mode === 'gradient-change') return segment.grade;
    return null;
}

function getMetricRange(segments: ProjectedSegment[], mode: HeatmapMode): ValueRange | null {
    const values = segments.flatMap((segment) => {
        const value = getSegmentMetric(segment, mode);
        return value === null ? [] : [value];
    });

    if (mode === 'gradient-change') {
        const absoluteMax = percentile(values.map(Math.abs), 0.95);
        return absoluteMax > 0 ? { min: -absoluteMax, max: absoluteMax } : null;
    }

    return rangeFor(values);
}

function colorForSegment(
    segment: ProjectedSegment,
    mode: HeatmapMode,
    range: ValueRange | null,
    palette: StrokePalette,
    densityRatio: number
): string {
    if (mode === 'frequency') {
        if (densityRatio > 0.72) return palette.hot;
        if (densityRatio > 0.34) return palette.mid;
        return palette.glow;
    }

    const value = getSegmentMetric(segment, mode);
    if (value === null) return withAlpha('#a1a1aa', 0.26, '#a1a1aa');

    if (mode === 'gradient-change') {
        const normalized = normalize(value, range);
        return normalized >= 0.5
            ? mixColor('#242124', METRIC_COLORS.climb, (normalized - 0.5) * 2)
            : mixColor(METRIC_COLORS.descent, '#242124', normalized * 2);
    }

    const normalized = normalize(value, range);
    if (mode === 'pace') return rampColor(METRIC_COLORS.pace, normalized);
    if (mode === 'heart-rate') return rampColor(METRIC_COLORS.heartRate, normalized);
    return rampColor(METRIC_COLORS.gradient, normalized);
}

function buildSegmentStrokes(
    mode: HeatmapMode,
    strokeColor: string,
    palette: StrokePalette,
    densityRatio: number,
    opacity: number,
    intensity: number
): SegmentStroke[] {
    if (mode === 'frequency') {
        const visualDensity = 0.24 + densityRatio * 0.76;
        const lowColor = mixColor(palette.base, '#f59e0b', 0.3);
        const midColor = mixColor(palette.base, '#fbbf24', 0.58);
        const hotColor = mixColor(palette.base, '#fff1a8', 0.82);
        const glowAlpha = Math.min(0.34, opacity * (0.16 + visualDensity * 0.10));
        const midAlpha = Math.min(0.68, opacity * (0.32 + visualDensity * 0.24));
        const coreAlpha = Math.min(0.92, opacity * (0.48 + visualDensity * 0.34));
        return [
            { width: 5.2 + intensity * 1.3 + visualDensity * 1.3, color: lowColor, alpha: glowAlpha },
            { width: 2.5 + intensity * 0.75 + visualDensity * 1.1, color: midColor, alpha: midAlpha },
            { width: 1 + visualDensity * 1.05, color: hotColor, alpha: coreAlpha, composite: 'screen' },
        ];
    }

    const alpha = Math.min(0.92, opacity * intensity * (0.62 + densityRatio * 1.05));
    return [
        { width: 6.5 + intensity * 2.6 + densityRatio * 3.8, color: strokeColor, alpha: alpha * 0.20 },
        { width: 3 + intensity * 1.1 + densityRatio * 2.2, color: strokeColor, alpha: alpha * 0.48 },
        { width: 1 + densityRatio * 1.7, color: strokeColor, alpha },
    ];
}

function drawRoutes(
    canvas: HTMLCanvasElement,
    map: L.Map,
    segments: ProjectedSegment[],
    mode: HeatmapMode,
    palette: StrokePalette,
    opacity: number,
    intensity: number
) {
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    ensureCanvasSize(canvas, size, dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    if (segments.length === 0) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const maxDensity = Math.max(1, ...segments.map((segment) => segment.density));
    const metricRange = getMetricRange(segments, mode);

    segments.forEach((segment) => {
        const densityRatio = mode === 'frequency'
            ? Math.log1p(segment.density) / Math.log1p(maxDensity)
            : segment.density / maxDensity;
        const strokeColor = colorForSegment(segment, mode, metricRange, palette, densityRatio);
        buildSegmentStrokes(mode, strokeColor, palette, densityRatio, opacity, intensity).forEach((stroke) => {
            ctx.beginPath();
            ctx.moveTo(segment.from.x, segment.from.y);
            ctx.lineTo(segment.to.x, segment.to.y);
            ctx.globalCompositeOperation = stroke.composite ?? 'source-over';
            ctx.globalAlpha = Math.min(1, stroke.alpha);
            ctx.lineWidth = stroke.width;
            ctx.strokeStyle = stroke.color;
            ctx.stroke();
        });
    });

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
}

export function HeatmapCanvasLayer({
    routes,
    colorTheme,
    mode,
    resolvedTheme,
    opacity,
    intensity,
}: HeatmapCanvasLayerProps) {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const resizeTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const segmentCacheRef = useRef<SegmentCache | null>(null);
    const palette = useMemo(
        () => getPalette(colorTheme, resolvedTheme),
        [colorTheme, resolvedTheme]
    );

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'runviz-heatmap-canvas') as HTMLCanvasElement;
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '420';
        map.getContainer().appendChild(canvas);
        canvasRef.current = canvas;

        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }
            if (resizeTimeoutRef.current !== null) {
                window.clearTimeout(resizeTimeoutRef.current);
            }
            canvas.remove();
            canvasRef.current = null;
        };
    }, [map]);

    useEffect(() => {
        const scheduleDraw = () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }

            frameRef.current = requestAnimationFrame(() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const segments = getProjectedSegments(map, routes, segmentCacheRef);
                drawRoutes(canvas, map, segments, mode, palette, opacity, intensity);
            });
        };

        const scheduleResizeDraw = () => {
            scheduleDraw();

            if (resizeTimeoutRef.current !== null) {
                window.clearTimeout(resizeTimeoutRef.current);
            }

            resizeTimeoutRef.current = window.setTimeout(scheduleDraw, 120);
        };

        scheduleDraw();
        map.on('moveend zoomend viewreset', scheduleDraw);
        map.on('resize', scheduleResizeDraw);

        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            if (resizeTimeoutRef.current !== null) {
                window.clearTimeout(resizeTimeoutRef.current);
                resizeTimeoutRef.current = null;
            }
            map.off('moveend zoomend viewreset', scheduleDraw);
            map.off('resize', scheduleResizeDraw);
        };
    }, [intensity, map, mode, opacity, palette, routes]);

    return null;
}
