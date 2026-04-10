import type { Auth } from '../auth';
import type { Env } from '../env';
import { corsHeaders } from '../http/cors';
import { errorResponse, jsonResponse } from '../http/response';
import { getBetterAuthSession, getSessionId } from './sessionService';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function resolveGoogleStorageKey(
    request: Request,
    auth: Auth,
): Promise<string | null> {
    const betterSession = await getBetterAuthSession(auth, request);
    if (betterSession?.user?.id) {
        return `user:${betterSession.user.id}`;
    }

    const sessionId = getSessionId(request);
    return sessionId ? `session:${sessionId}` : null;
}

export async function startGoogleAuth(
    request: Request,
    env: Env,
    origin: string,
    auth: Auth,
): Promise<Response> {
    const session = await getBetterAuthSession(auth, request);
    if (!session?.user?.id) {
        return errorResponse('Unauthorized', 401, env, origin);
    }

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return Response.redirect(authUrl.toString(), 302);
}

export async function completeGoogleAuth(
    request: Request,
    env: Env,
    auth: Auth,
): Promise<Response> {
    const storageKey = await resolveGoogleStorageKey(request, auth);
    if (!storageKey) return new Response('Unauthorized', { status: 401 });

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

    const data = await tokenResponse.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
    };
    const googleTokenData = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };

    await env.TOKENS.put(`google:${storageKey}`, JSON.stringify(googleTokenData), {
        expirationTtl: 60 * 60 * 24 * 30,
    });

    return new Response(
        `<html><body><script>window.opener.postMessage("google_auth_success", ${JSON.stringify(env.FRONTEND_URL)}); window.close();</script>Success! You can close this window.</body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
    );
}

export async function getGoogleSessionStatus(
    request: Request,
    env: Env,
    origin: string,
    auth: Auth,
): Promise<Response> {
    const storageKey = await resolveGoogleStorageKey(request, auth);
    if (!storageKey) {
        return jsonResponse({ connected: false }, env, origin);
    }

    const stored = await env.TOKENS.get(`google:${storageKey}`);
    return jsonResponse({ connected: !!stored }, env, origin);
}

export async function getGoogleAccessToken(
    request: Request,
    env: Env,
    origin: string,
    auth: Auth,
): Promise<Response> {
    const storageKey = await resolveGoogleStorageKey(request, auth);
    if (!storageKey) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin, env) });
    }

    const stored = await env.TOKENS.get(`google:${storageKey}`);
    if (!stored) {
        return new Response('Not connected', { status: 404, headers: corsHeaders(origin, env) });
    }

    let tokenData = JSON.parse(stored) as {
        accessToken: string;
        refreshToken?: string;
        expiresAt: number;
    };

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

        if (!refreshResponse.ok) {
            return new Response('Token refresh failed', { status: 401, headers: corsHeaders(origin, env) });
        }

        const data = await refreshResponse.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
        };
        tokenData = {
            ...tokenData,
            accessToken: data.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        };
        if (data.refresh_token) tokenData.refreshToken = data.refresh_token;

        await env.TOKENS.put(`google:${storageKey}`, JSON.stringify(tokenData), {
            expirationTtl: 60 * 60 * 24 * 30,
        });
    }

    return jsonResponse({ accessToken: tokenData.accessToken }, env, origin);
}
