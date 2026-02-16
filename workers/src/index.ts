import { handleRouteGeneration } from './routeService';

/**
 * RunViz API - Cloudflare Workers Backend
 * 
 * Handles Strava OAuth and proxies API requests with token management
 */

export interface Env {
    TOKENS: KVNamespace;
    STRAVA_CLIENT_ID: string;
    STRAVA_CLIENT_SECRET: string;
    FRONTEND_URL: string;
    ORS_API_KEY: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
}

interface TokenData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    athleteId: number;
    athleteName: string;
    athleteProfile: string;
    scopes?: string;
}

// CORS headers for frontend
export function corsHeaders(origin: string): HeadersInit {
    const allowedOrigins = [
        'https://hwong103.github.io',
        'http://localhost:5173',
        'http://127.0.0.1:5173'
    ];

    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.hwong103.github.io');

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
    };
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

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(origin) });
        }

        try {
            // Route handling
            if (url.pathname === '/auth/strava') {
                return handleAuthStart(url, env);
            }

            if (url.pathname === '/auth/strava/scopes') {
                return await handleStravaScopes(request, env, origin);
            }

            if (url.pathname === '/auth/callback') {
                return await handleAuthCallback(request, env, origin);
            }

            if (url.pathname === '/auth/session') {
                return await handleSession(request, env, origin);
            }

            if (url.pathname === '/auth/logout') {
                return handleLogout(origin);
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
                return await handleRouteGeneration(request, env, origin);
            }

            if (cleanPath === '/api/geocoding/search') {
                return await handleSearchGeocoding(url, env, origin);
            }

            if (cleanPath === '/api/geocoding/reverse') {
                return await handleReverseGeocoding(url, env, origin);
            }

            // Support PUT /api/activities/:id for form analysis write-back
            if (request.method === 'PUT' && url.pathname.startsWith('/api/activities/')) {
                return await handleStravaActivityUpdate(request, env, origin);
            }

            if (url.pathname.startsWith('/api/')) {
                return await handleApiRequest(request, url, env, origin);
            }

            return new Response(`Not Found: ${url.pathname}`, { status: 404, headers: corsHeaders(origin) });
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(
                JSON.stringify({ error: 'Internal server error' }),
                {
                    status: 500,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
                }
            );
        }
    },
};

// Start OAuth flow
function handleAuthStart(url: URL, env: Env): Response {
    const redirectUri = url.searchParams.get('redirect_uri') || `${env.FRONTEND_URL}/callback`;

    const authUrl = new URL(STRAVA_AUTH_URL);
    authUrl.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read,activity:read_all,activity:write');
    authUrl.searchParams.set('state', generateSessionId().slice(0, 16));

    return Response.redirect(authUrl.toString(), 302);
}

// Handle OAuth callback
async function handleAuthCallback(request: Request, env: Env, origin: string): Promise<Response> {
    const body = await request.json() as { code: string };
    const code = body.code;

    if (!code) {
        return new Response(
            JSON.stringify({ error: 'Missing authorization code' }),
            { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
        }),
    });

    if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        return new Response(
            JSON.stringify({ error: 'Token exchange failed' }),
            { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        athlete: { id: number; firstname: string; lastname: string; profile: string };
    };

    // Create session and store tokens
    const sessionId = generateSessionId();
    const storedData: TokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athleteId: tokenData.athlete.id,
        athleteName: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
        athleteProfile: tokenData.athlete.profile,
        scopes: (tokenData as any).scope, // Strava returns scope in token response
    };

    await env.TOKENS.put(`session:${sessionId}`, JSON.stringify(storedData), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });

    return new Response(
        JSON.stringify({
            athlete: {
                id: tokenData.athlete.id,
                firstname: tokenData.athlete.firstname,
                lastname: tokenData.athlete.lastname,
                profile: tokenData.athlete.profile,
            },
        }),
        {
            headers: {
                ...corsHeaders(origin),
                'Content-Type': 'application/json',
                'Set-Cookie': `runviz_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=2592000`,
            },
        }
    );
}

// Check session
async function handleSession(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);

    if (!sessionId) {
        return new Response(
            JSON.stringify({ authenticated: false }),
            { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const stored = await env.TOKENS.get(`session:${sessionId}`);
    if (!stored) {
        return new Response(
            JSON.stringify({ authenticated: false }),
            { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const tokenData = JSON.parse(stored) as TokenData;
    return new Response(
        JSON.stringify({
            authenticated: true,
            athlete: {
                id: tokenData.athleteId,
                firstname: tokenData.athleteName.split(' ')[0],
                lastname: tokenData.athleteName.split(' ').slice(1).join(' '),
                profile: tokenData.athleteProfile,
            },
        }),
        { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    );
}

// Logout
function handleLogout(origin: string): Response {
    return new Response(
        JSON.stringify({ success: true }),
        {
            headers: {
                ...corsHeaders(origin),
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
    origin: string
): Promise<Response> {
    const sessionId = getSessionId(request);

    if (!sessionId) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const stored = await env.TOKENS.get(`session:${sessionId}`);
    if (!stored) {
        return new Response(
            JSON.stringify({ error: 'Session expired' }),
            { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    let tokenData = JSON.parse(stored) as TokenData;

    // Refresh token if expired
    if (tokenData.expiresAt < Date.now() / 1000) {
        const refreshResponse = await fetch(STRAVA_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: env.STRAVA_CLIENT_ID,
                client_secret: env.STRAVA_CLIENT_SECRET,
                refresh_token: tokenData.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!refreshResponse.ok) {
            return new Response(
                JSON.stringify({ error: 'Token refresh failed' }),
                { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
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

        await env.TOKENS.put(`session:${sessionId}`, JSON.stringify(tokenData), {
            expirationTtl: 60 * 60 * 24 * 30,
        });
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
            { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    return new Response(JSON.stringify(data), {
        status: stravaResponse.status,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
}

// Nominatim Geocoding Proxy
async function handleSearchGeocoding(url: URL, env: Env, origin: string): Promise<Response> {
    const q = url.searchParams.get('q');
    if (!q) return new Response('Missing query', { status: 400 });

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=au`;

    const response = await fetch(nominatimUrl, {
        headers: {
            'User-Agent': 'RunViz/1.0 (https://hwong103.github.io/runviz)'
        }
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
}

async function handleReverseGeocoding(url: URL, env: Env, origin: string): Promise<Response> {
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    if (!lat || !lon) return new Response('Missing coordinates', { status: 400 });

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

    const response = await fetch(nominatimUrl, {
        headers: {
            'User-Agent': 'RunViz/1.0 (https://hwong103.github.io/runviz)'
        }
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
}

// --- New Form Analysis Handlers ---

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function handleStravaScopes(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response(JSON.stringify({ scopes: '' }), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

    const stored = await env.TOKENS.get(`session:${sessionId}`);
    if (!stored) return new Response(JSON.stringify({ scopes: '' }), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

    const tokenData = JSON.parse(stored) as TokenData;
    return new Response(JSON.stringify({ scopes: tokenData.scopes || '' }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
}

function handleGoogleAuthStart(env: Env): Response {
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly');
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
    if (!sessionId) return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

    const stored = await env.TOKENS.get(`google:${sessionId}`);
    return new Response(JSON.stringify({ connected: !!stored }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
}

async function handleGoogleToken(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin) });

    const stored = await env.TOKENS.get(`google:${sessionId}`);
    if (!stored) return new Response('Not connected', { status: 404, headers: corsHeaders(origin) });

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
            return new Response('Token refresh failed', { status: 401, headers: corsHeaders(origin) });
        }
    }

    return new Response(JSON.stringify({ accessToken: tokenData.accessToken }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
}

async function handleStravaActivityUpdate(request: Request, env: Env, origin: string): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin) });

    const stored = await env.TOKENS.get(`session:${sessionId}`);
    if (!stored) return new Response('Session expired', { status: 401, headers: corsHeaders(origin) });

    const tokenData = JSON.parse(stored) as TokenData;

    // Check if activity:write scope is present
    if (!tokenData.scopes?.includes('activity:write')) {
        return new Response(JSON.stringify({ error: 'Missing activity:write scope' }), {
            status: 403,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(request.url);
    const activityId = url.pathname.split('/').pop();
    if (!activityId) return new Response('Missing activity ID', { status: 400, headers: corsHeaders(origin) });

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
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
}
