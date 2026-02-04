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
}

interface TokenData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    athleteId: number;
    athleteName: string;
    athleteProfile: string;
}

// CORS headers for frontend
function corsHeaders(origin: string): HeadersInit {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
    };
}

// Get session ID from cookie
function getSessionId(request: Request): string | null {
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
                return handleAuthStart(url, env, origin);
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

            // Protected API routes
            if (url.pathname.startsWith('/api/')) {
                return await handleApiRequest(request, url, env, origin);
            }

            return new Response('Not Found', { status: 404 });
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
function handleAuthStart(url: URL, env: Env, origin: string): Response {
    const redirectUri = url.searchParams.get('redirect_uri') || `${env.FRONTEND_URL}/callback`;

    const authUrl = new URL(STRAVA_AUTH_URL);
    authUrl.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read,activity:read_all');
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
