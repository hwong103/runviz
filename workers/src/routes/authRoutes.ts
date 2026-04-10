import type { RequestContext } from '../http/context';
import { withCors } from '../http/cors';
import { appendSetCookieHeaders, errorResponse, jsonResponse } from '../http/response';
import {
    completeGoogleAuth,
    getGoogleAccessToken,
    getGoogleSessionStatus,
    startGoogleAuth,
} from '../services/googleAuthService';
import {
    getBetterAuthSessionWithHeaders,
    resolveSession,
} from '../services/sessionService';
import {
    buildStravaAuthUrl,
    exchangeStravaAuthCode,
    getStravaScopes,
} from '../services/stravaService';

export async function handleAuthRoutes(context: RequestContext): Promise<Response | null> {
    const { request, url, env, origin, auth } = context;

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
        const authUrl = await buildStravaAuthUrl(request, url, env, auth);
        if (authUrl instanceof Response) {
            return authUrl;
        }

        return jsonResponse({ url: authUrl.toString() }, env, origin);
    }

    if (url.pathname === '/api/auth/strava') {
        const authUrl = await buildStravaAuthUrl(request, url, env, auth);
        if (authUrl instanceof Response) {
            return authUrl;
        }

        return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === '/api/auth/strava/scopes') {
        return getStravaScopes(request, env, auth, origin);
    }

    if (url.pathname.startsWith('/api/auth/')) {
        return withCors(await auth.handler(request), origin, env);
    }

    if (url.pathname === '/api/session') {
        const betterAuthResult = await getBetterAuthSessionWithHeaders(auth, request);
        const session = await resolveSession(request, env, auth, betterAuthResult.session);
        const headers = new Headers({
            'Content-Type': 'application/json',
        });

        appendSetCookieHeaders(headers, betterAuthResult.headers);

        return jsonResponse(session, env, origin, { headers });
    }

    if (url.pathname === '/api/logout') {
        return jsonResponse({ success: true }, env, origin, {
            headers: {
                'Set-Cookie': 'runviz_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0',
            },
        });
    }

    if (url.pathname === '/auth/callback') {
        const body = await request.json() as { code?: string; state?: string };
        if (!body.code) {
            return errorResponse('Missing authorization code', 400, env, origin);
        }

        return exchangeStravaAuthCode(body.code, body.state, env, origin);
    }

    if (url.pathname === '/auth/google') {
        return startGoogleAuth(request, env, origin, auth);
    }

    if (url.pathname === '/auth/google/callback') {
        return completeGoogleAuth(request, env, auth);
    }

    if (url.pathname === '/auth/google/session') {
        return getGoogleSessionStatus(request, env, origin, auth);
    }

    if (url.pathname === '/auth/google/token') {
        return getGoogleAccessToken(request, env, origin, auth);
    }

    return null;
}
