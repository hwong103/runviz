import type { RequestContext } from '../http/context';
import { errorResponse, jsonResponse } from '../http/response';
import {
    clearMaxHrPreference,
    getMaxHrPreference,
    getStravaKeyStatus,
    saveMaxHrPreference,
    saveStravaKeys,
} from '../services/credentialService';
import { getAuthenticatedUserId } from '../services/sessionService';

export async function handleSetupRoutes(context: RequestContext): Promise<Response | null> {
    const { request, url, env, origin, auth } = context;

    if (url.pathname === '/setup/strava-key' && request.method === 'POST') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        const body = await request.json() as { clientId?: string; clientSecret?: string };
        if (!body.clientId || !body.clientSecret) {
            return errorResponse('Missing fields', 400, env, origin);
        }

        if (!/^\d+$/.test(body.clientId)) {
            return errorResponse('Invalid Client ID', 400, env, origin);
        }

        await saveStravaKeys(env, userId, body.clientId, body.clientSecret);
        return jsonResponse({ ok: true }, env, origin);
    }

    if (url.pathname === '/setup/strava-key' && request.method === 'GET') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return jsonResponse({ configured: false }, env, origin, { status: 401 });
        }

        return jsonResponse(await getStravaKeyStatus(env, userId), env, origin);
    }

    if (url.pathname === '/setup/max-hr' && request.method === 'GET') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        return jsonResponse(await getMaxHrPreference(env, userId), env, origin);
    }

    if (url.pathname === '/setup/max-hr' && request.method === 'POST') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        const body = await request.json() as { maxHR?: number };
        const maxHR = Number(body.maxHR);
        if (!Number.isFinite(maxHR) || maxHR < 140 || maxHR > 220) {
            return errorResponse('Max heart rate must be between 140 and 220.', 400, env, origin);
        }

        await saveMaxHrPreference(env, userId, maxHR);
        return jsonResponse({ ok: true, maxHR: Math.round(maxHR) }, env, origin);
    }

    if (url.pathname === '/setup/max-hr' && request.method === 'DELETE') {
        const userId = await getAuthenticatedUserId(auth, request);
        if (!userId) {
            return errorResponse('Unauthorized', 401, env, origin);
        }

        await clearMaxHrPreference(env, userId);
        return jsonResponse({ ok: true }, env, origin);
    }

    return null;
}
