import { useEffect, useMemo, useRef } from 'react';

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

const DENSITY_CELL_SIZE_PX = 18;

function getPalette(colorTheme: HeatmapColorTheme, resolvedTheme: ResolvedTheme): StrokePalette {
    if (colorTheme === 'blue') {
        return resolvedTheme === 'light'
            ? { glow: 'rgba(28, 95, 217, 0.12)', mid: 'rgba(26, 115, 232, 0.22)', hot: 'rgba(10, 82, 170, 0.42)' }
            : { glow: 'rgba(94, 167, 255, 0.13)', mid: 'rgba(93, 187, 255, 0.25)', hot: 'rgba(198, 232, 255, 0.52)' };
    }

    if (colorTheme === 'mono') {
        return resolvedTheme === 'light'
            ? { glow: 'rgba(24, 24, 27, 0.08)', mid: 'rgba(24, 24, 27, 0.16)', hot: 'rgba(24, 24, 27, 0.34)' }
            : { glow: 'rgba(244, 244, 245, 0.08)', mid: 'rgba(244, 244, 245, 0.18)', hot: 'rgba(255, 255, 255, 0.42)' };
    }

    return resolvedTheme === 'light'
        ? { glow: 'rgba(211, 81, 27, 0.10)', mid: 'rgba(223, 92, 34, 0.22)', hot: 'rgba(184, 72, 23, 0.46)' }
        : { glow: 'rgba(255, 111, 55, 0.12)', mid: 'rgba(255, 141, 67, 0.26)', hot: 'rgba(255, 221, 155, 0.55)' };
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

function drawRoutes(
    canvas: HTMLCanvasElement,
    map: L.Map,
    routes: HeatmapRoute[],
    palette: StrokePalette,
    opacity: number,
    intensity: number
) {
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.x * dpr));
    canvas.height = Math.max(1, Math.floor(size.y * dpr));
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const segments = buildProjectedSegments(map, routes);
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
                drawRoutes(canvas, map, routes, palette, opacity, intensity);
            });
        };

        scheduleDraw();
        map.on('move zoom resize viewreset', scheduleDraw);

        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            map.off('move zoom resize viewreset', scheduleDraw);
        };
    }, [intensity, map, opacity, palette, routes]);

    return null;
}
