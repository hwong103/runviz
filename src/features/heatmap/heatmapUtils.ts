import type { Activity, ActivityStreams, LatLng } from '@/types/activity';
import { parseActivityLocalDate } from '@/utils/activityDate';

export type HeatmapColorTheme = 'ember' | 'blue' | 'mono';
export type HeatmapMode = 'frequency' | 'frequency-log' | 'pace' | 'heart-rate' | 'gradient-absolute' | 'gradient-change';

export interface HeatmapPoint {
    lat: number;
    lng: number;
    speed: number | null;
    heartRate: number | null;
    grade: number | null;
}

export interface HeatmapRoute {
    activity: Activity;
    points: HeatmapPoint[];
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
const MAIN_CLUSTER_CELL_DEGREES = 0.18;
const MAIN_CLUSTER_RADIUS_METERS = 45000;

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

function numberAt(values: number[] | undefined, index: number): number | null {
    const value = values?.[index];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pointLatLng(point: HeatmapPoint): LatLng {
    return [point.lat, point.lng];
}

function normalizeGrade(value: number | null): number | null {
    if (value === null) return null;
    return Math.abs(value) > 1 ? value / 100 : value;
}

function fallbackGrade(points: LatLng[], streams: ActivityStreams, index: number): number | null {
    const altitude = streams.altitude?.data;
    const previousAltitude = numberAt(altitude, index - 1);
    const nextAltitude = numberAt(altitude, index);
    if (previousAltitude === null || nextAltitude === null || index <= 0) return null;

    const distance = haversineMeters(points[index - 1], points[index]);
    if (distance < 1) return null;
    return (nextAltitude - previousAltitude) / distance;
}

export function extractHeatmapPoints(streams: ActivityStreams): HeatmapPoint[] {
    const rawPoints = streams.latlng?.data;
    if (!Array.isArray(rawPoints)) return [];

    return rawPoints.flatMap((point, index) => {
        if (!isValidLatLng(point)) return [];
        const streamGrade = normalizeGrade(numberAt(streams.grade_smooth?.data, index));
        return [{
            lat: point[0],
            lng: point[1],
            speed: numberAt(streams.velocity_smooth?.data, index),
            heartRate: numberAt(streams.heartrate?.data, index),
            grade: streamGrade ?? fallbackGrade(rawPoints, streams, index),
        }];
    });
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

export function trimPrivateEndpoints(points: HeatmapPoint[], radiusMeters: number): HeatmapPoint[] {
    if (radiusMeters <= 0 || points.length < 3) return points;

    const start = pointLatLng(points[0]);
    const end = pointLatLng(points[points.length - 1]);

    return points.filter((point) =>
        haversineMeters(start, pointLatLng(point)) > radiusMeters &&
        haversineMeters(end, pointLatLng(point)) > radiusMeters
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

export function simplifyRoute(points: HeatmapPoint[], toleranceMeters: number): HeatmapPoint[] {
    if (points.length <= 2 || toleranceMeters <= 0) return points;

    let maxDistance = 0;
    let splitIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let index = 1; index < points.length - 1; index++) {
        const distance = perpendicularDistanceMeters(pointLatLng(points[index]), pointLatLng(first), pointLatLng(last));
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
    const rawPoints = extractHeatmapPoints(streams);
    if (rawPoints.length < 2) return null;

    const privateTrimmed = trimPrivateEndpoints(rawPoints, privacyRadiusMeters);
    if (privateTrimmed.length < 2) return null;

    const simplified = simplifyRoute(privateTrimmed, 8);
    return {
        activity,
        points: simplified,
        originalPoints: rawPoints.length,
        distanceMeters: routeDistanceMeters(privateTrimmed.map(pointLatLng)),
    };
}

export function calculateHeatmapBounds(routes: HeatmapRoute[]): HeatmapBounds | null {
    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;

    routes.forEach((route) => {
        route.points.forEach((point) => {
            north = Math.max(north, point.lat);
            south = Math.min(south, point.lat);
            east = Math.max(east, point.lng);
            west = Math.min(west, point.lng);
        });
    });

    if (!Number.isFinite(north) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(west)) {
        return null;
    }

    return { north, south, east, west };
}

function expandBounds(bounds: HeatmapBounds, paddingRatio: number): HeatmapBounds {
    const latPadding = Math.max(0.01, (bounds.north - bounds.south) * paddingRatio);
    const lngPadding = Math.max(0.01, (bounds.east - bounds.west) * paddingRatio);

    return {
        north: Math.min(90, bounds.north + latPadding),
        south: Math.max(-90, bounds.south - latPadding),
        east: Math.min(180, bounds.east + lngPadding),
        west: Math.max(-180, bounds.west - lngPadding),
    };
}

function routeCentroid(route: HeatmapRoute): LatLng | null {
    if (route.points.length === 0) return null;

    const sums = route.points.reduce(
        (total, point) => ({
            lat: total.lat + point.lat,
            lng: total.lng + point.lng,
        }),
        { lat: 0, lng: 0 }
    );

    return [
        sums.lat / route.points.length,
        sums.lng / route.points.length,
    ];
}

export function selectMainClusterRoutes(routes: HeatmapRoute[]): HeatmapRoute[] {
    if (routes.length === 0) return [];

    const clusters = new Map<string, { count: number; latSum: number; lngSum: number }>();

    routes.forEach((route) => {
        const centroid = routeCentroid(route);
        if (!centroid) return;

        const key = [
            Math.round(centroid[0] / MAIN_CLUSTER_CELL_DEGREES),
            Math.round(centroid[1] / MAIN_CLUSTER_CELL_DEGREES),
        ].join(':');
        const cluster = clusters.get(key) ?? { count: 0, latSum: 0, lngSum: 0 };
        cluster.count += 1;
        cluster.latSum += centroid[0];
        cluster.lngSum += centroid[1];
        clusters.set(key, cluster);
    });

    const mainCluster = Array.from(clusters.values()).sort((left, right) => right.count - left.count)[0];
    if (!mainCluster) return routes;

    const center: LatLng = [
        mainCluster.latSum / mainCluster.count,
        mainCluster.lngSum / mainCluster.count,
    ];

    const clusterRoutes = routes.filter((route) => {
        const centroid = routeCentroid(route);
        return centroid ? haversineMeters(centroid, center) <= MAIN_CLUSTER_RADIUS_METERS : false;
    });

    return clusterRoutes.length > 0 ? clusterRoutes : routes;
}

export function calculateMainClusterBounds(routes: HeatmapRoute[]): HeatmapBounds | null {
    if (routes.length === 0) return null;

    const clusterBounds = calculateHeatmapBounds(selectMainClusterRoutes(routes));
    const fallbackBounds = calculateHeatmapBounds(routes);
    const bounds = clusterBounds ?? fallbackBounds;

    return bounds ? expandBounds(bounds, 0.18) : null;
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
    shoeId: string
): Activity[] {
    const visibleIds = new Set(visibleActivities.map((activity) => activity.id));

    return activities.filter((activity) => {
        if (!visibleIds.has(activity.id)) return false;
        if (shoeId !== 'all' && activity.gear_id !== shoeId) return false;
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
