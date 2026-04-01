// Route generation handler for Cloudflare Workers
// Integrates with OpenRouteService for distance-based route generation

import { createAuth } from './auth';
import { Env, corsHeaders } from './index';
import { resolveStravaAccess } from './session';

interface RouteRequest {
    startLat: number;
    startLng: number;
    targetDistanceMeters: number;
}

interface OrsRouteResponse {
    error?: { message?: string };
    features?: Array<{
        properties: {
            summary: {
                distance: number;
                duration: number;
            };
            ascent?: number;
        };
        geometry: {
            coordinates: Array<[number, number, number?]>;
        };
    }>;
}

const MIN_DISTANCE_METERS = 1_000;
const MAX_DISTANCE_METERS = 100_000;

export async function handleRouteGeneration(
    request: Request,
    env: Env,
    origin: string,
    auth: ReturnType<typeof createAuth>
): Promise<Response> {
    const access = await resolveStravaAccess(request, env, auth);
    if (!access) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await request.json() as RouteRequest;
        const { startLat, startLng, targetDistanceMeters } = body;

        if (
            typeof startLat !== 'number' || typeof startLng !== 'number' || typeof targetDistanceMeters !== 'number' ||
            !Number.isFinite(startLat) || startLat < -90 || startLat > 90 ||
            !Number.isFinite(startLng) || startLng < -180 || startLng > 180 ||
            !Number.isFinite(targetDistanceMeters) ||
            targetDistanceMeters < MIN_DISTANCE_METERS || targetDistanceMeters > MAX_DISTANCE_METERS
        ) {
            return new Response(
                JSON.stringify({ error: 'Invalid parameters' }),
                { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
            );
        }

        // Generate 5 different routes using different seeds for round trips
        const seeds = Array.from({ length: 5 }, (_, i) => Math.floor(Math.random() * 100) + (i * 100));

        const routePromises: Array<Promise<OrsRouteResponse>> = seeds.map(seed =>
            fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
                method: 'POST',
                headers: {
                    'Authorization': env.ORS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    coordinates: [[startLng, startLat]],
                    options: {
                        avoid_features: ["ferries"],
                        round_trip: {
                            length: targetDistanceMeters, // ORS expects meters
                            points: 3,
                            seed: seed
                        }
                    },
                    elevation: true,
                    units: 'm'
                })
            }).then(res => res.json() as Promise<OrsRouteResponse>)
        );

        const results = await Promise.all(routePromises);

        // Process results into our GeneratedRoute format
        const routes = results.map((data, index) => {
            if (data.error || !data.features || data.features.length === 0) {
                console.error(`ORS Error for seed ${seeds[index]}:`, data.error);
                return null;
            }

            const feature = data.features[0];
            const properties = feature.properties;
            const geometry = feature.geometry;

            return {
                id: `route-${index}-${Date.now()}`,
                name: `Route ${index + 1} (${(properties.summary.distance / 1000).toFixed(1)}km)`,
                distance: properties.summary.distance,
                elevationGain: properties.ascent || 0,
                estimatedTime: properties.summary.duration,
                points: geometry.coordinates.map((coord: [number, number, number?]) => ({
                    lat: coord[1],
                    lng: coord[0],
                    elevation: coord[2]
                })),
                polyline: '' // We can compute this or just use the points on the frontend
            };
        }).filter(Boolean);

        if (routes.length === 0) {
            // Find the first error message to help debug
            const firstError =
                results.find((result) => result.error)?.error?.message ||
                'No routes could be generated for this location. Try a different distance or start point.';
            return new Response(
                JSON.stringify({ error: firstError }),
                { status: 422, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify(routes),
            { headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Route generation error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to generate routes' }),
            { status: 500, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }
}
