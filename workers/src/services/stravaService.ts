import type { Auth } from '../auth';
import type { Env } from '../env';
import { errorResponse, jsonResponse } from '../http/response';
import {
    buildAthleteSummary,
    getBetterAuthSession,
    resolveStoredStravaKeys,
    resolveStravaAccess,
    type StravaAccessContext,
    type TokenData,
} from './sessionService';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_URL = 'https://www.strava.com/api/v3';

function generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildStravaAuthUrl(
    request: Request,
    url: URL,
    env: Env,
    auth: Auth,
): Promise<URL | Response> {
    const redirectUri = url.searchParams.get('redirect_uri') || `${env.FRONTEND_URL}/callback`;
    const scope = url.searchParams.get('scope') || 'read,activity:read_all,activity:write';
    const state = generateSessionId().slice(0, 16);
    const origin = request.headers.get('Origin') || env.FRONTEND_URL;
    const betterSession = await getBetterAuthSession(auth, request);
    if (!betterSession?.user?.id) {
        return errorResponse('Sign in before connecting Strava.', 401, env, origin);
    }

    const storedKeys = await resolveStoredStravaKeys(env, betterSession.user.id);
    if (!storedKeys) {
        return errorResponse('Save your Strava Client ID and Client Secret before connecting.', 400, env, origin);
    }

    const stateContext: { mode: string; userId?: string } = { mode: 'link', userId: betterSession.user.id };

    await env.TOKENS.put(`strava-oauth:${state}`, JSON.stringify(stateContext), {
        expirationTtl: 60 * 10,
    });

    const authUrl = new URL(STRAVA_AUTH_URL);
    authUrl.searchParams.set('client_id', storedKeys.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    return authUrl;
}

export async function exchangeStravaAuthCode(
    code: string,
    state: string | undefined,
    env: Env,
    origin: string,
): Promise<Response> {
    const stateContext = state
        ? await env.TOKENS
            .get(`strava-oauth:${state}`)
            .then((value) => value ? JSON.parse(value) as { mode?: string; userId?: string } : null)
        : null;

    const storedKeys = stateContext?.userId ? await resolveStoredStravaKeys(env, stateContext.userId) : null;
    if (!stateContext?.userId || !storedKeys) {
        return errorResponse('Strava app credentials are not configured for this account.', 400, env, origin);
    }

    const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: storedKeys.clientId,
            client_secret: storedKeys.clientSecret,
            code,
            grant_type: 'authorization_code',
        }),
    });

    if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        return errorResponse('Token exchange failed', 400, env, origin);
    }

    const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        scope?: string;
        athlete: { id: number; firstname: string; lastname: string; profile: string };
    };

    const storedData: TokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athleteId: tokenData.athlete.id,
        athleteName: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
        athleteProfile: tokenData.athlete.profile,
        scopes: tokenData.scope,
    };

    const athlete = buildAthleteSummary(storedData);

    await env.TOKENS.put(`strava:${stateContext.userId}`, JSON.stringify(storedData), {
        expirationTtl: 60 * 60 * 24 * 30,
    });
    if (state) {
        await env.TOKENS.delete(`strava-oauth:${state}`);
    }

    return jsonResponse({ linked: true, athlete }, env, origin);
}

async function refreshStravaAccessToken(
    env: Env,
    access: StravaAccessContext,
    origin: string,
): Promise<TokenData | Response> {
    const keys = access.userId ? await resolveStoredStravaKeys(env, access.userId) : null;
    if (!keys) {
        return errorResponse('Strava app credentials are missing for this account.', 401, env, origin);
    }

    const refreshResponse = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: keys.clientId,
            client_secret: keys.clientSecret,
            refresh_token: access.tokenData.refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    if (!refreshResponse.ok) {
        return errorResponse('Token refresh failed', 401, env, origin);
    }

    const refreshData = await refreshResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
    };

    const tokenData: TokenData = {
        ...access.tokenData,
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token,
        expiresAt: refreshData.expires_at,
    };

    const storageKey = access.source === 'better-auth' && access.userId
        ? `strava:${access.userId}`
        : access.sessionId
            ? `session:${access.sessionId}`
            : null;
    if (storageKey) {
        await env.TOKENS.put(storageKey, JSON.stringify(tokenData), {
            expirationTtl: 60 * 60 * 24 * 30,
        });
    }

    return tokenData;
}

async function resolveValidStravaAccess(
    request: Request,
    env: Env,
    auth: Auth,
    origin: string,
): Promise<{ access: StravaAccessContext } | { response: Response }> {
    const access = await resolveStravaAccess(request, env, auth);
    if (!access) {
        return { response: errorResponse('Unauthorized', 401, env, origin) };
    }

    if (access.tokenData.expiresAt >= Date.now() / 1000) {
        return { access };
    }

    const refreshed = await refreshStravaAccessToken(env, access, origin);
    if (refreshed instanceof Response) {
        return { response: refreshed };
    }

    return {
        access: {
            ...access,
            tokenData: refreshed,
            athlete: buildAthleteSummary(refreshed),
        },
    };
}

export async function getStravaScopes(
    request: Request,
    env: Env,
    auth: Auth,
    origin: string,
): Promise<Response> {
    const access = await resolveStravaAccess(request, env, auth);
    const tokenData = access?.tokenData;
    return jsonResponse({ scopes: tokenData?.scopes || '' }, env, origin);
}

export async function proxyStravaApiRequest(
    request: Request,
    url: URL,
    env: Env,
    origin: string,
    auth: Auth,
): Promise<Response> {
    const accessResult = await resolveValidStravaAccess(request, env, auth, origin);
    if ('response' in accessResult) {
        return accessResult.response;
    }

    const { tokenData } = accessResult.access;
    const stravaPath = url.pathname.replace('/api', '').replace(/\/$/, '');
    const stravaUrl = new URL(`${STRAVA_API_URL}${stravaPath}`);
    url.searchParams.forEach((value, key) => stravaUrl.searchParams.set(key, value));

    const stravaResponse = await fetch(stravaUrl.toString(), {
        headers: {
            Authorization: `Bearer ${tokenData.accessToken}`,
        },
    });

    const data = await stravaResponse.json();

    if (stravaPath === '/athlete/activities' || stravaPath === '/activities') {
        const activities = Array.isArray(data) ? data : [];
        const perPage = Number.parseInt(url.searchParams.get('per_page') || '30', 10);
        return jsonResponse({
            activities,
            hasMore: activities.length === perPage,
            error: !Array.isArray(data) ? data : undefined,
        }, env, origin);
    }

    return jsonResponse(data, env, origin, { status: stravaResponse.status });
}

export async function updateStravaActivity(
    request: Request,
    env: Env,
    origin: string,
    auth: Auth,
): Promise<Response> {
    const accessResult = await resolveValidStravaAccess(request, env, auth, origin);
    if ('response' in accessResult) {
        return accessResult.response;
    }

    const { tokenData } = accessResult.access;
    if (!tokenData.scopes?.includes('activity:write')) {
        return errorResponse('Missing activity:write scope', 403, env, origin);
    }

    const url = new URL(request.url);
    const activityId = url.pathname.split('/').pop();
    if (!activityId || !/^\d+$/.test(activityId)) {
        return errorResponse('Invalid activity ID', 400, env, origin);
    }

    const body = await request.json() as { description: string };

    const stravaResponse = await fetch(`${STRAVA_API_URL}/activities/${activityId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${tokenData.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: body.description }),
    });

    const data = await stravaResponse.json();
    return jsonResponse(data, env, origin, { status: stravaResponse.status });
}
