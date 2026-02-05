// Route generation handler for Cloudflare Workers
// Integrates with OpenRouteService for distance-based route generation

import { Env, corsHeaders, getSessionId } from './index';

interface RouteRequest {
    startLat: number;
    startLng: number;
    targetDistanceMeters: number;
}

export async function handleRouteGeneration(
    request: Request,
    env: Env,
    origin: string
): Promise<Response> {
    const sessionId = getSessionId(request);

    if (!sessionId) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await request.json() as RouteRequest;
        const { startLat, startLng, targetDistanceMeters } = body;

        if (!startLat || !startLng || !targetDistanceMeters) {
            return new Response(
                JSON.stringify({ error: 'Missing required parameters' }),
                { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // Generate 5 different routes using different seeds for round trips
        const seeds = Array.from({ length: 5 }, (_, i) => Math.floor(Math.random() * 100) + (i * 100));

        const routePromises = seeds.map(seed =>
            fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
                method: 'POST',
                headers: {
                    'Authorization': env.ORS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    coordinates: [[startLng, startLat]],
                    options: {
                        round_trip: {
                            length: targetDistanceMeters, // ORS expects meters
                            points: 3,
                            seed: seed
                        }
                    },
                    elevation: true,
                    units: 'm'
                })
            }).then(res => res.json())
        );

        const results = await Promise.all(routePromises);

        // Process results into our GeneratedRoute format
        const routes = results.map((data: any, index) => {
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

        return new Response(
            JSON.stringify(routes),
            { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Route generation error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to generate routes' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
}
