import { handleRouteGeneration } from '../routeService';
import type { RequestContext } from '../http/context';
import { errorResponse, jsonResponse } from '../http/response';

export async function handleRoutePlannerRoutes(context: RequestContext): Promise<Response | null> {
    const { request, url, env, origin, auth } = context;
    const cleanPath = url.pathname.replace(/\/+$/, '');

    if (cleanPath === '/api/routes/generate') {
        return handleRouteGeneration(request, env, origin, auth);
    }

    if (cleanPath === '/api/geocoding/search') {
        const q = url.searchParams.get('q')?.trim();
        if (!q || q.length > 300) {
            return errorResponse('Invalid query', 400, env, origin);
        }

        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=au`;

        const response = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': `RunViz/1.0 (${env.FRONTEND_URL})`,
            },
        });

        return jsonResponse(await response.json(), env, origin);
    }

    if (cleanPath === '/api/geocoding/reverse') {
        const latStr = url.searchParams.get('lat');
        const lonStr = url.searchParams.get('lon');
        if (!latStr || !lonStr) {
            return errorResponse('Missing coordinates', 400, env, origin);
        }

        const lat = Number.parseFloat(latStr);
        const lon = Number.parseFloat(lonStr);
        if (
            !Number.isFinite(lat) || !Number.isFinite(lon) ||
            lat < -90 || lat > 90 ||
            lon < -180 || lon > 180
        ) {
            return errorResponse('Invalid coordinates', 400, env, origin);
        }

        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

        const response = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': `RunViz/1.0 (${env.FRONTEND_URL})`,
            },
        });

        return jsonResponse(await response.json(), env, origin);
    }

    return null;
}
