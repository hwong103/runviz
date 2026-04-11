import type { GeneratedRoute, RouteGenerationRequest } from '@/types/route';

import { fetchApi } from './http';

export const routes = {
    async generate(request: RouteGenerationRequest): Promise<GeneratedRoute[]> {
        return fetchApi('/api/routes/generate', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    },
};
