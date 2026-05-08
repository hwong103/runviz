import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';

import L from 'leaflet';
import { useMap } from 'react-leaflet';

import type { ResolvedTheme } from '@/hooks/useTheme';

import type { HeatmapColorTheme, HeatmapRoute } from './heatmapUtils';

interface HeatmapCanvasLayerProps {
    routes: HeatmapRoute[];
    colorTheme: HeatmapColorTheme;
    resolvedTheme: ResolvedTheme;
    opacity: number;
    intensity: number;
}

interface StrokePalette {
    glow: string;
    mid: string;
    hot: string;
}

interface ProjectedSegment {
    from: L.Point;
    to: L.Point;
    density: number;
}

interface SegmentCache {
    routes: HeatmapRoute[];
    zoom: number;
    centerKey: string;
    sizeKey: string;
    segments: ProjectedSegment[];
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

function getPalette(colorTheme: HeatmapColorTheme, resolvedTheme: ResolvedTheme): StrokePalette {
    const mode = resolvedTheme === 'light' ? 'light' : 'dark';
    const themeColor = colorTheme === 'mono'
        ? readCssColor('--foreground', FALLBACK_COLORS.mono[mode])
        : readCssColor(colorTheme === 'blue' ? '--rv-blue' : '--rv-orange', FALLBACK_COLORS[colorTheme][mode]);
    const fallback = FALLBACK_COLORS[colorTheme][mode];

    if (colorTheme === 'blue') {
        return resolvedTheme === 'light'
            ? { glow: withAlpha(themeColor, 0.11, fallback), mid: withAlpha(themeColor, 0.23, fallback), hot: withAlpha(themeColor, 0.44, fallback) }
            : { glow: withAlpha(themeColor, 0.13, fallback), mid: withAlpha(themeColor, 0.26, fallback), hot: withAlpha(themeColor, 0.54, fallback) };
    }

    if (colorTheme === 'mono') {
        return resolvedTheme === 'light'
            ? { glow: withAlpha(themeColor, 0.08, fallback), mid: withAlpha(themeColor, 0.16, fallback), hot: withAlpha(themeColor, 0.34, fallback) }
            : { glow: withAlpha(themeColor, 0.08, fallback), mid: withAlpha(themeColor, 0.18, fallback), hot: withAlpha(themeColor, 0.42, fallback) };
    }

    return resolvedTheme === 'light'
        ? { glow: withAlpha(themeColor, 0.10, fallback), mid: withAlpha(themeColor, 0.22, fallback), hot: withAlpha(themeColor, 0.46, fallback) }
        : { glow: withAlpha(themeColor, 0.12, fallback), mid: withAlpha(themeColor, 0.26, fallback), hot: withAlpha(themeColor, 0.55, fallback) };
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

function buildProjectedSegments(map: L.Map, routes: HeatmapRoute[]): ProjectedSegment[] {
    const segments: Array<ProjectedSegment & { key: string }> = [];
    const counts = new Map<string, number>();

    routes.forEach((route) => {
        if (route.points.length < 2) return;

        const projected = route.points.map(([lat, lng]) => map.latLngToContainerPoint([lat, lng]));
        for (let index = 1; index < projected.length; index++) {
            const from = projected[index - 1];
            const to = projected[index];
            const key = segmentDensityKey(from, to);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            segments.push({ from, to, key, density: 1 });
        }
    });

    return segments.map((segment) => ({
        from: segment.from,
        to: segment.to,
        density: counts.get(segment.key) ?? 1,
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

function drawRoutes(
    canvas: HTMLCanvasElement,
    map: L.Map,
    segments: ProjectedSegment[],
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

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const maxDensity = Math.max(1, ...segments.map((segment) => segment.density));

    segments.forEach((segment) => {
        const densityRatio = segment.density / maxDensity;
        const heatBoost = 0.7 + densityRatio * 1.45;
        const alpha = opacity * intensity * heatBoost;
        [
            { width: 8 + intensity * 4 + densityRatio * 6, color: palette.glow, alpha: alpha * 0.36 },
            { width: 3.5 + intensity * 1.6 + densityRatio * 3.6, color: palette.mid, alpha: alpha * 0.62 },
            { width: 1.1 + densityRatio * 2.2, color: palette.hot, alpha },
        ].forEach((stroke) => {
            ctx.beginPath();
            ctx.moveTo(segment.from.x, segment.from.y);
            ctx.lineTo(segment.to.x, segment.to.y);
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
                drawRoutes(canvas, map, segments, palette, opacity, intensity);
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
    }, [intensity, map, opacity, palette, routes]);

    return null;
}
