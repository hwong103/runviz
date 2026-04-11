import type { Gear } from '@/types/gear';

import { fetchApi } from './http';

export const gear = {
    async get(id: string): Promise<Gear> {
        return fetchApi(`/api/gear/${id}`);
    },
};
