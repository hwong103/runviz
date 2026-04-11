import { createAuth } from './auth';
import type { Env } from './env';
import { corsHeaders } from './http/cors';
import { withAssetCachePolicy, errorResponse } from './http/response';
import { handleWorkerRequest } from './http/router';

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
            const routeResponse = await handleWorkerRequest({ request, url, env, origin, auth });
            if (routeResponse) {
                return routeResponse;
            }

            const assetResponse = await env.ASSETS.fetch(request);
            return withAssetCachePolicy(assetResponse, url.pathname);
        } catch (error) {
            console.error('Worker error:', error);
            return errorResponse('Internal server error', 500, env, origin);
        }
    },
};
