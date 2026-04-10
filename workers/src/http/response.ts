import type { Env } from '../env';
import { corsHeaders } from './cors';

export function jsonResponse(
    data: unknown,
    env: Env,
    origin: string,
    init: ResponseInit = {},
): Response {
    const headers = new Headers(init.headers);
    const cors = corsHeaders(origin, env);
    Object.entries(cors).forEach(([key, value]) => headers.set(key, String(value)));
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return new Response(JSON.stringify(data), {
        status: init.status,
        headers,
    });
}

export function errorResponse(
    error: string,
    status: number,
    env: Env,
    origin: string,
    details?: Record<string, unknown>,
): Response {
    return jsonResponse({ error, ...details }, env, origin, { status });
}

export function appendSetCookieHeaders(target: Headers, source?: Headers | null) {
    if (!source) return;

    const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getSetCookie === 'function') {
        for (const value of getSetCookie.call(source)) {
            target.append('Set-Cookie', value);
        }
        return;
    }

    const setCookie = source.get('set-cookie');
    if (setCookie) {
        target.append('Set-Cookie', setCookie);
    }
}

export function withAssetCachePolicy(response: Response, pathname: string): Response {
    const headers = new Headers(response.headers);
    const contentType = headers.get('content-type') ?? '';
    const isStaticAsset = pathname.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(pathname);
    const isHtml = contentType.includes('text/html');

    if (isHtml && !isStaticAsset) {
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    return new Response(response.body, {
        status: response.status,
        headers,
    });
}
