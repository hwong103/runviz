import { handleRouteGeneration } from './routeService';
import { createAuth } from './auth';
import { encrypt } from './crypto';
import {
    buildAthleteSummary,
    resolveSession,
    resolveStravaAccess,
    resolveStoredStravaKeys,
    type TokenData,
} from './session';

/**
 * RunViz API - Cloudflare Workers Backend
 * 
 * Handles Strava OAuth and proxies API requests with token management
 */

export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    TOKENS: KVNamespace;
    BETTER_AUTH_SECRET: string;
    RESEND_API_KEY: string;
    FRONTEND_URL: string;
    FRONTEND_PREVIEW_HOST?: string;
    ADDITIONAL_FRONTEND_URLS?: string;
    ORS_API_KEY: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
}

function getConfiguredOrigins(env: Env): string[] {
    const configured = [env.FRONTEND_URL, env.ADDITIONAL_FRONTEND_URLS]
        .flatMap((value) => value ? value.split(',') : [])
        .map((value) => value.trim())
        .filter(Boolean);

    return [
        ...configured,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ];
}

function isAllowedOrigin(origin: string, env: Env): boolean {
    if (!origin) return false;

    const allowedOrigins = getConfiguredOrigins(env);
    if (allowedOrigins.includes(origin)) {
        return true;
    }

    if (!env.FRONTEND_PREVIEW_HOST) {
        return false;
    }

    try {
        const hostname = new URL(origin).hostname;
        return hostname === env.FRONTEND_PREVIEW_HOST || hostname.endsWith(`.${env.FRONTEND_PREVIEW_HOST}`);
    } catch {
        return false;
    }
}

// CORS headers for frontend
export function corsHeaders(origin: string, env: Env): HeadersInit {
    const fallbackOrigin = env.FRONTEND_URL || 'http://localhost:5173';
    const allowedOrigin = isAllowedOrigin(origin, env) ? origin : fallbackOrigin;

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin',
    };
}

function withCors(response: Response, origin: string, env: Env): Response {
    const headers = new Headers(response.headers);
    const cors = corsHeaders(origin, env);
    Object.entries(cors).forEach(([key, value]) => headers.set(key, String(value)));
    return new Response(response.body, {
        status: response.status,
        headers,
    });
}

// Get session ID from cookie
export function getSessionId(request: Request): string | null {
    const cookie = request.headers.get('Cookie');
    if (!cookie) return null;
    const match = cookie.match(/runviz_session=([^;]+)/);
    return match ? match[1] : null;
}

// Generate session ID
function generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Strava OAuth endpoints
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_URL = 'https://www.strava.com/api/v3';

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || env.FRONTEND_URL;
        const auth = createAuth(env, url.origin);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(origin, env) });
        }

        try {
            if (url.pathname === '/auth/strava') {
                const target = new URL('/api/auth/strava', url.origin);
                target.search = url.search;
                return Response.redirect(target.toString(), 302);
            }

            if (url.pathname === '/auth/strava/scopes') {
                const target = new URL('/api/auth/strava/scopes', url.origin);
                target.search = url.search;
                return Response.redirect(target.toString(), 302);
            }

            if (url.pathname === '/api/auth/strava-url') {
                return await handleAuthStartUrl(request, url, env, origin, auth);
            }

            if (url.pathname === '/api/auth/strava') {
                return await handleAuthStart(request, url, env, auth);
            }

            if (url.pathname === '/api/auth/strava/scopes') {
                return await handleStravaScopes(request, env, origin);
            }

            if (url.pathname.startsWith('/api/auth/')) {
                return withCors(await auth.handler(request), origin, env);
            }

            if (url.pathname === '/api/session') {
                return await handleHybridSession(request, env, origin, auth);
            }

            if (url.pathname === '/api/logout') {
                return handleLegacyLogout(origin, env);
            }

            if (url.pathname === '/setup/strava-key' && request.method === 'POST') {
                return await handleSaveStravaKey(request, env, origin, auth);
            }

            if (url.pathname === '/setup/strava-key' && request.method === 'GET') {
                return await handleGetStravaKeyStatus(env, origin, auth, request);
            }

            if (url.pathname === '/auth/callback') {
                return await handleAuthCallback(request, env, origin);
            }

            // Google OAuth endpoints
            if (url.pathname === '/auth/google') {
                return handleGoogleAuthStart(env);
            }

            if (url.pathname === '/auth/google/callback') {
                return await handleGoogleAuthCallback(request, env, origin);
            }

            if (url.pathname === '/auth/google/session') {
                return await handleGoogleSession(request, env, origin);
            }

            if (url.pathname === '/auth/google/token') {
                return await handleGoogleToken(request, env, origin);
            }

            // Protected API routes
            const cleanPath = url.pathname.replace(/\/+$/, '');

            if (cleanPath === '/api/routes/generate') {
                return await handleRouteGeneration(request, env, origin, auth);
            }

            if (cleanPath === '/api/geocoding/search') {
                return await handleSearchGeocoding(url, env, origin);
            }

            if (cleanPath === '/api/geocoding/reverse') {
                return await handleReverseGeocoding(url, env, origin);
            }

            // Support PUT /api/activities/:id for form analysis write-back
            if (request.method === 'PUT' && url.pathname.startsWith('/api/activities/')) {
                return await handleStravaActivityUpdate(request, env, origin, auth);
            }

            if (url.pathname.startsWith('/api/')) {
                return await handleApiRequest(request, url, env, origin, auth);
            }

            return env.ASSETS.fetch(request);
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(
                JSON.stringify({ error: 'Internal server error' }),
                {
                    status: 500,
                    headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
                }
            );
        }
    },
};

// Start OAuth flow
async function handleAuthStart(request: Request, url: URL, env: Env, auth: ReturnType<typeof createAuth>): Promise<Response> {
    const authUrl = await buildStravaAuthUrl(request, url, env, auth);
    if (authUrl instanceof Response) {
        return authUrl;
    }

    return Response.redirect(authUrl.toString(), 302);
}

async function handleAuthStartUrl(
    request: Request,
    url: URL,
    env: Env,
    origin: string,
    auth: ReturnType<typeof createAuth>
): Promise<Response> {
    const authUrl = await buildStravaAuthUrl(request, url, env, auth);
    if (authUrl instanceof Response) {
        return authUrl;
    }

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
}

async function buildStravaAuthUrl(
    request: Request,
    url: URL,
    env: Env,
    auth: ReturnType<typeof createAuth>
): Promise<URL | Response> {
    const redirectUri = url.searchParams.get('redirect_uri') || `${env.FRONTEND_URL}/callback`;
    const scope = url.searchParams.get('scope') || 'read,activity:read_all,activity:write';
    const state = generateSessionId().slice(0, 16);
    const origin = request.headers.get('Origin') || env.FRONTEND_URL;
    const betterSession = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!betterSession?.user?.id) {
        return new Response(
            JSON.stringify({ error: 'Sign in before connecting Strava.' }),
            { status: 401, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }

    const storedKeys = await resolveStoredStravaKeys(env, betterSession.user.id);
    if (!storedKeys) {
        return new Response(
            JSON.stringify({ error: 'Save your Strava Client ID and Client Secret before connecting.' }),
            { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
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

// Handle OAuth callback
async function handleAuthCallback(request: Request, env: Env, origin: string): Promise<Response> {
    const body = await request.json() as { code: string; state?: string };
    const code = body.code;
    const state = body.state;
    const stateContext = state
        ? await env.TOKENS.get(`strava-oauth:${state}`).then((value) => value ? JSON.parse(value) as { mode?: string; userId?: string } : null)
        : null;

    if (!code) {
        return new Response(
            JSON.stringify({ error: 'Missing authorization code' }),
            { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }

    // Exchange code for tokens
    const storedKeys = stateContext?.userId ? await resolveStoredStravaKeys(env, stateContext.userId) : null;
    if (!stateContext?.userId || !storedKeys) {
        return new Response(
            JSON.stringify({ error: 'Strava app credentials are not configured for this account.' }),
            { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }
    const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: storedKeys.clientId,
            client_secret: storedKeys.clientSecret,
            code: code,
            grant_type: 'authorization_code',
        }),
    });

    if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        return new Response(
            JSON.stringify({ error: 'Token exchange failed' }),
            { status: 400, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }

    const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        athlete: { id: number; firstname: string; lastname: string; profile: string };
    };

    const storedData: TokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athleteId: tokenData.athlete.id,
        athleteName: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
        athleteProfile: tokenData.athlete.profile,
        scopes: (tokenData as any).scope, // Strava returns scope in token response
    };

    const athlete = buildAthleteSummary(storedData);

    await env.TOKENS.put(`strava:${stateContext.userId}`, JSON.stringify(storedData), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
    if (state) {
        await env.TOKENS.delete(`strava-oauth:${state}`);
    }

    return new Response(
        JSON.stringify({
            linked: true,
            athlete,
        }),
        {
            headers: {
                ...corsHeaders(origin, env),
                'Content-Type': 'application/json',
            },
        }
    );
}

// Check session
async function handleHybridSession(request: Request, env: Env, origin: string, auth: ReturnType<typeof createAuth>): Promise<Response> {
    const session = await resolveSession(request, env, auth);
    return new Response(
        JSON.stringify(session),
        { headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
    );
}

async function handleSaveStravaKey(request: Request, env: Env, origin: string, auth: ReturnType<typeof createAuth>): Promise<Response> {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }

    const body = await request.json() as { clientId?: string; clientSecret?: string };
    if (!body.clientId || !body.clientSecret) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
            status: 400,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }

    if (!/^\d+$/.test(body.clientId)) {
        return new Response(JSON.stringify({ error: 'Invalid Client ID' }), {
            status: 400,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }

    const encryptedSecret = await encrypt(body.clientSecret, env.BETTER_AUTH_SECRET);
    await env.DB.prepare(
        `INSERT INTO strava_keys (user_id, client_id, client_secret_enc, created_at, updated_at)
         VALUES (?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(user_id) DO UPDATE SET
           client_id = excluded.client_id,
           client_secret_enc = excluded.client_secret_enc,
           updated_at = unixepoch()`
    ).bind(session.user.id, body.clientId, encryptedSecret).run();

    return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
}

async function handleGetStravaKeyStatus(env: Env, origin: string, auth: ReturnType<typeof createAuth>, request: Request): Promise<Response> {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session?.user?.id) {
        return new Response(JSON.stringify({ configured: false }), {
            status: 401,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
        });
    }

    const row = await env.DB.prepare(
        'SELECT client_id, updated_at FROM strava_keys WHERE user_id = ?'
    ).bind(session.user.id).first<{ client_id: string; updated_at: number }>();

    return new Response(JSON.stringify({
        configured: !!row,
        clientId: row?.client_id ?? null,
        updatedAt: row?.updated_at ?? null,
    }), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
}

// Logout
function handleLegacyLogout(origin: string, env: Env): Response {
    return new Response(
        JSON.stringify({ success: true }),
        {
            headers: {
                ...corsHeaders(origin, env),
                'Content-Type': 'application/json',
                'Set-Cookie': 'runviz_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0',
            },
        }
    );
}

// Handle protected API requests
async function handleApiRequest(
    request: Request,
    url: URL,
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
    let tokenData = access.tokenData;

    // Refresh token if expired
    if (tokenData.expiresAt < Date.now() / 1000) {
        const keys = access.userId ? await resolveStoredStravaKeys(env, access.userId) : null;
        if (!keys) {
            return new Response(
                JSON.stringify({ error: 'Strava app credentials are missing for this account.' }),
                { status: 401, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
            );
        }
        const refreshResponse = await fetch(STRAVA_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: keys.clientId,
                client_secret: keys.clientSecret,
                refresh_token: tokenData.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!refreshResponse.ok) {
            return new Response(
                JSON.stringify({ error: 'Token refresh failed' }),
                { status: 401, headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
            );
        }

        const refreshData = await refreshResponse.json() as {
            access_token: string;
            refresh_token: string;
            expires_at: number;
        };

        tokenData = {
            ...tokenData,
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
    }

    // Proxy request to Strava API
    const stravaPath = url.pathname.replace('/api', '').replace(/\/$/, '');
    const stravaUrl = new URL(`${STRAVA_API_URL}${stravaPath}`);
    url.searchParams.forEach((value, key) => stravaUrl.searchParams.set(key, value));

    const stravaResponse = await fetch(stravaUrl.toString(), {
        headers: {
            Authorization: `Bearer ${tokenData.accessToken}`,
        },
    });

    const data = await stravaResponse.json();

    // Handle activities list specially to add hasMore flag
    // We check for both /athlete/activities and the old /activities path to be safe
    if (stravaPath === '/athlete/activities' || stravaPath === '/activities') {
        const activities = Array.isArray(data) ? data : [];
        const perPage = parseInt(url.searchParams.get('per_page') || '30');
        return new Response(
            JSON.stringify({
                activities,
                hasMore: activities.length === perPage,
                error: !Array.isArray(data) ? data : undefined
            }),
            { headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } }
        );
    }

    return new Response(JSON.stringify(data), {
        status: stravaResponse.status,
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
}

// Nominatim Geocoding Proxy
async function handleSearchGeocoding(url: URL, env: Env, origin: string): Promise<Response> {
    const q = url.searchParams.get('q');
    if (!q) return new Response('Missing query', { status: 400 });

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=au`;

    const response = await fetch(nominatimUrl, {
        headers: {
            'User-Agent': `RunViz/1.0 (${env.FRONTEND_URL})`
        }
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' }
    });
}

async function handleReverseGeocoding(url: URL, env: Env, origin: string): Promise<Response> {
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    if (!lat || !lon) return new Response('Missing coordinates', { status: 400 });

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

    const response = await fetch(nominatimUrl, {
        headers: {
            'User-Agent': `RunViz/1.0 (${env.FRONTEND_URL})`
        }
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' }
    });
}

// --- New Form Analysis Handlers ---

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function handleStravaScopes(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response(JSON.stringify({ scopes: '' }), { headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } });

    const stored = await env.TOKENS.get(`session:${sessionId}`);
    if (!stored) return new Response(JSON.stringify({ scopes: '' }), { headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } });

    const tokenData = JSON.parse(stored) as TokenData;
    return new Response(JSON.stringify({ scopes: tokenData.scopes || '' }), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' }
    });
}

function handleGoogleAuthStart(env: Env): Response {
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return Response.redirect(authUrl.toString(), 302);
}

async function handleGoogleAuthCallback(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response('Unauthorized', { status: 401 });

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing code', { status: 400 });

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: env.GOOGLE_REDIRECT_URI,
        }),
    });

    if (!tokenResponse.ok) {
        return new Response('Token exchange failed', { status: 400 });
    }

    const data = await tokenResponse.json() as any;
    const googleTokenData = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };

    await env.TOKENS.put(`google:${sessionId}`, JSON.stringify(googleTokenData), {
        expirationTtl: 60 * 60 * 24 * 30,
    });

    return new Response(
        '<html><body><script>window.opener.postMessage("google_auth_success", "*"); window.close();</script>Success! You can close this window.</body></html>',
        { headers: { 'Content-Type': 'text/html' } }
    );
}

async function handleGoogleSession(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' } });

    const stored = await env.TOKENS.get(`google:${sessionId}`);
    return new Response(JSON.stringify({ connected: !!stored }), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' }
    });
}

async function handleGoogleToken(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin, env) });

    const stored = await env.TOKENS.get(`google:${sessionId}`);
    if (!stored) return new Response('Not connected', { status: 404, headers: corsHeaders(origin, env) });

    let tokenData = JSON.parse(stored);

    if (tokenData.expiresAt < Math.floor(Date.now() / 1000) + 60) {
        const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                refresh_token: tokenData.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (refreshResponse.ok) {
            const data = await refreshResponse.json() as any;
            tokenData = {
                ...tokenData,
                accessToken: data.access_token,
                expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
            };
            if (data.refresh_token) tokenData.refreshToken = data.refresh_token;

            await env.TOKENS.put(`google:${sessionId}`, JSON.stringify(tokenData), {
                expirationTtl: 60 * 60 * 24 * 30,
            });
        } else {
            return new Response('Token refresh failed', { status: 401, headers: corsHeaders(origin, env) });
        }
    }

    return new Response(JSON.stringify({ accessToken: tokenData.accessToken }), {
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' }
    });
}

async function handleStravaActivityUpdate(request: Request, env: Env, origin: string, auth: ReturnType<typeof createAuth>): Promise<Response> {
    const access = await resolveStravaAccess(request, env, auth);
    if (!access) return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin, env) });

    const tokenData = access.tokenData;

    // Check if activity:write scope is present
    if (!tokenData.scopes?.includes('activity:write')) {
        return new Response(JSON.stringify({ error: 'Missing activity:write scope' }), {
            status: 403,
            headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(request.url);
    const activityId = url.pathname.split('/').pop();
    if (!activityId) return new Response('Missing activity ID', { status: 400, headers: corsHeaders(origin, env) });

    const body = await request.json() as { description: string };

    // Strava API PUT /activities/{id}
    const stravaResponse = await fetch(`${STRAVA_API_URL}/activities/${activityId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: body.description }),
    });

    const data = await stravaResponse.json();
    return new Response(JSON.stringify(data), {
        status: stravaResponse.status,
        headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
}
