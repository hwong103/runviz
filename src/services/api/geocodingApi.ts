import { fetchApi } from './http';

export interface GeocodingSuggestion {
    display_name: string;
    lat: string;
    lon: string;
}

export const geocoding = {
    async search(query: string): Promise<GeocodingSuggestion[]> {
        return fetchApi(`/api/geocoding/search?q=${encodeURIComponent(query)}`);
    },

    async reverse(lat: number, lon: number): Promise<Partial<GeocodingSuggestion>> {
        return fetchApi(`/api/geocoding/reverse?lat=${lat}&lon=${lon}`);
    },
};
