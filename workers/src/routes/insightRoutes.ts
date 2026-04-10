import { handleInsightRequest } from '../domain/insights/service';
import type { RequestContext } from '../http/context';

export async function handleInsightRoutes(context: RequestContext): Promise<Response | null> {
    const { request, url, env, origin, auth } = context;

    if (url.pathname === '/api/insights' || url.pathname.startsWith('/api/insights/')) {
        return handleInsightRequest(request, env, origin, auth);
    }

    return null;
}
