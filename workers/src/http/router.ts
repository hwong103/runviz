import type { RequestContext } from './context';
import { handleAuthRoutes } from '../routes/authRoutes';
import { handleInsightRoutes } from '../routes/insightRoutes';
import { handleMemoryRoutes } from '../routes/memoryRoutes';
import { handleRoutePlannerRoutes } from '../routes/routePlannerRoutes';
import { handleSetupRoutes } from '../routes/setupRoutes';
import { handleStravaRoutes } from '../routes/stravaRoutes';

const routeHandlers = [
    handleAuthRoutes,
    handleSetupRoutes,
    handleRoutePlannerRoutes,
    handleInsightRoutes,
    handleMemoryRoutes,
    handleStravaRoutes,
];

export async function handleWorkerRequest(context: RequestContext): Promise<Response | null> {
    for (const handler of routeHandlers) {
        const response = await handler(context);
        if (response) {
            return response;
        }
    }

    return null;
}
