import type { Activity, ActivityStreams, LatLng } from '@/types/activity';
import { parseActivityLocalDate } from '@/utils/activityDate';

export type HeatmapColorTheme = 'ember' | 'blue' | 'mono';
export type HeatmapDateScope = 'current' | 'all';

export interface HeatmapRoute {
    activity: Activity;
    points: LatLng[];
    originalPoints: number;
    distanceMeters: number;
}

export interface HeatmapBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

const EARTH_RADIUS_METERS = 6371000;

export function isValidLatLng(point: unknown): point is LatLng {
    if (!Array.isArray(point) || point.length !== 2) return false;
    const [lat, lng] = point;
    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;
}

export function extractLatLngPoints(streams?: ActivityStreams | null): LatLng[] {
    const points = streams?.latlng?.data;
    if (!Array.isArray(points)) return [];
    return points.filter(isValidLatLng);
}

export function haversineMeters(a: LatLng, b: LatLng): number {
    const toRadians = Math.PI / 180;
    const lat1 = a[0] * toRadians;
    const lat2 = b[0] * toRadians;
    const deltaLat = (b[0] - a[0]) * toRadians;
    const deltaLng = (b[1] - a[1]) * toRadians;

    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);
    const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

    return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function routeDistanceMeters(points: LatLng[]): number {
    let distance = 0;
    for (let index = 1; index < points.length; index++) {
        distance += haversineMeters(points[index - 1], points[index]);
    }
    return distance;
}

export function trimPrivateEndpoints(points: LatLng[], radiusMeters: number): LatLng[] {
    if (radiusMeters <= 0 || points.length < 3) return points;

    const start = points[0];
    const end = points[points.length - 1];

    return points.filter((point) =>
        haversineMeters(start, point) > radiusMeters &&
        haversineMeters(end, point) > radiusMeters
    );
}

function perpendicularDistanceMeters(point: LatLng, start: LatLng, end: LatLng): number {
    const segmentLength = haversineMeters(start, end);
    if (segmentLength === 0) return haversineMeters(point, start);

    const latScale = 111320;
    const lngScale = Math.cos(((start[0] + end[0]) / 2) * Math.PI / 180) * 111320;
    const px = point[1] * lngScale;
    const py = point[0] * latScale;
    const ax = start[1] * lngScale;
    const ay = start[0] * latScale;
    const bx = end[1] * lngScale;
    const by = end[0] * latScale;
    const dx = bx - ax;
    const dy = by - ay;

    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function simplifyRoute(points: LatLng[], toleranceMeters: number): LatLng[] {
    if (points.length <= 2 || toleranceMeters <= 0) return points;

    let maxDistance = 0;
    let splitIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let index = 1; index < points.length - 1; index++) {
        const distance = perpendicularDistanceMeters(points[index], first, last);
        if (distance > maxDistance) {
            maxDistance = distance;
            splitIndex = index;
        }
    }

    if (maxDistance <= toleranceMeters) {
        return [first, last];
    }

    const left = simplifyRoute(points.slice(0, splitIndex + 1), toleranceMeters);
    const right = simplifyRoute(points.slice(splitIndex), toleranceMeters);
    return [...left.slice(0, -1), ...right];
}

export function buildHeatmapRoute(
    activity: Activity,
    streams: ActivityStreams,
    privacyRadiusMeters: number
): HeatmapRoute | null {
    const rawPoints = extractLatLngPoints(streams);
    if (rawPoints.length < 2) return null;

    const privateTrimmed = trimPrivateEndpoints(rawPoints, privacyRadiusMeters);
    if (privateTrimmed.length < 2) return null;

    const simplified = simplifyRoute(privateTrimmed, 8);
    return {
        activity,
        points: simplified,
        originalPoints: rawPoints.length,
        distanceMeters: routeDistanceMeters(privateTrimmed),
    };
}

export function calculateHeatmapBounds(routes: HeatmapRoute[]): HeatmapBounds | null {
    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;

    routes.forEach((route) => {
        route.points.forEach(([lat, lng]) => {
            north = Math.max(north, lat);
            south = Math.min(south, lat);
            east = Math.max(east, lng);
            west = Math.min(west, lng);
        });
    });

    if (!Number.isFinite(north) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(west)) {
        return null;
    }

    return { north, south, east, west };
}

export function estimateCoveredAreaKm2(bounds: HeatmapBounds | null): number {
    if (!bounds) return 0;

    const latKm = Math.abs(bounds.north - bounds.south) * 111.32;
    const midLat = ((bounds.north + bounds.south) / 2) * Math.PI / 180;
    const lngKm = Math.abs(bounds.east - bounds.west) * 111.32 * Math.cos(midLat);

    return Math.max(0, latKm * lngKm);
}

export function filterActivitiesForHeatmap(
    activities: Activity[],
    visibleActivities: Activity[],
    dateScope: HeatmapDateScope,
    shoeId: string,
    sportType: string
): Activity[] {
    const visibleIds = new Set(visibleActivities.map((activity) => activity.id));

    return activities.filter((activity) => {
        if (dateScope === 'current' && !visibleIds.has(activity.id)) return false;
        if (shoeId !== 'all' && activity.gear_id !== shoeId) return false;
        if (sportType !== 'all' && activity.sport_type !== sportType && activity.type !== sportType) return false;
        return true;
    });
}

export function sortActivitiesOldestFirst(activities: Activity[]): Activity[] {
    return [...activities].sort(
        (left, right) =>
            parseActivityLocalDate(left.start_date_local).getTime() -
            parseActivityLocalDate(right.start_date_local).getTime()
    );
}

export function heatmapRouteKey(route: HeatmapRoute): string {
    return `${route.activity.id}:${route.points.length}:${route.points[0]?.join(',')}:${route.points.at(-1)?.join(',')}`;
}
