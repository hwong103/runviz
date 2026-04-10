import type { Env } from '../env';

export function getConfiguredOrigins(env: Env): string[] {
    const configured = [env.FRONTEND_URL, env.ADDITIONAL_FRONTEND_URLS]
        .flatMap((value) => value ? value.split(',') : [])
        .map((value) => value.trim())
        .filter(Boolean);

    const localOrigins = env.ENVIRONMENT !== 'production'
        ? ['http://localhost:5173', 'http://127.0.0.1:5173']
        : [];

    return [
        ...configured,
        ...localOrigins,
    ];
}

export function isAllowedOrigin(origin: string, env: Env): boolean {
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

export function corsHeaders(origin: string, env: Env): HeadersInit {
    const fallbackOrigin = env.FRONTEND_URL || 'http://localhost:5173';
    const allowedOrigin = isAllowedOrigin(origin, env) ? origin : fallbackOrigin;

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
    };
}

export function withCors(response: Response, origin: string, env: Env): Response {
    const headers = new Headers(response.headers);
    const cors = corsHeaders(origin, env);
    Object.entries(cors).forEach(([key, value]) => headers.set(key, String(value)));
    return new Response(response.body, {
        status: response.status,
        headers,
    });
}
