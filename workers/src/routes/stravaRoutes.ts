import type { RequestContext } from '../http/context';
import {
    proxyStravaApiRequest,
    updateStravaActivity,
} from '../services/stravaService';

export async function handleStravaRoutes(context: RequestContext): Promise<Response | null> {
    const { request, url, env, origin, auth } = context;

    if (request.method === 'PUT' && url.pathname.startsWith('/api/activities/')) {
        return updateStravaActivity(request, env, origin, auth);
    }

    if (url.pathname.startsWith('/api/')) {
        return proxyStravaApiRequest(request, url, env, origin, auth);
    }

    return null;
}
