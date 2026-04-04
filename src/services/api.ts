// API service for communicating with Cloudflare Workers backend

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

const API_URL = import.meta.env.VITE_API_URL || '';
const AUTH_BASE_URL = API_URL || window.location.origin;
const authClient = createAuthClient({
    baseURL: AUTH_BASE_URL,
    basePath: '/api/auth',
    plugins: [magicLinkClient()],
});

interface GeocodingSuggestion {
    display_name: string;
    lat: string;
    lon: string;
}

class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        credentials: 'include', // Include cookies for auth
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new ApiError(response.status, error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// Auth endpoints
export const auth = {
    async signInGoogle(callbackURL = `${window.location.origin}${import.meta.env.BASE_URL}signin/complete`): Promise<void> {
        await authClient.signIn.social({
            provider: 'google',
            callbackURL,
        });
    },

    async sendMagicLink(email: string, callbackURL = `${window.location.origin}${import.meta.env.BASE_URL}`): Promise<void> {
        await authClient.signIn.magicLink({
            email,
            callbackURL,
        });
    },

    getStravaLoginUrl(mode: 'link' = 'link', scope = 'read,activity:read_all,activity:write'): Promise<{ url: string }> {
        const callbackUrl = `${window.location.origin}${import.meta.env.BASE_URL}callback`;
        return fetchApi(`/api/auth/strava-url?redirect_uri=${encodeURIComponent(callbackUrl)}&mode=${mode}&scope=${encodeURIComponent(scope)}`);
    },

    async handleCallback(code: string, state?: string): Promise<{ athlete: { id: number; firstname: string; lastname: string; profile: string } }> {
        return fetchApi('/auth/callback', {
            method: 'POST',
            body: JSON.stringify({ code, state }),
        });
    },

    async logout(): Promise<void> {
        try {
            await authClient.signOut();
        } catch {
            // Ignore Better Auth sign-out errors and still clear the legacy session.
        }
        await fetchApi('/api/logout', { method: 'POST' });
    },

    async getSession(): Promise<{
        authenticated: boolean;
        needsStravaConnect?: boolean;
        source?: 'legacy' | 'better-auth';
        user?: { id: string; email?: string; name?: string; image?: string | null };
        athlete?: { id: number; firstname: string; lastname: string; profile: string };
    }> {
        return fetchApi('/api/session');
    },

    async getStravaScopes(): Promise<{ scopes: string }> {
        return fetchApi('/api/auth/strava/scopes');
    },

    async getStravaKeyStatus(): Promise<{ configured: boolean; clientId: string | null; updatedAt: number | null }> {
        return fetchApi('/setup/strava-key');
    },

    async saveStravaKey(clientId: string, clientSecret: string): Promise<{ ok: boolean }> {
        return fetchApi('/setup/strava-key', {
            method: 'POST',
            body: JSON.stringify({ clientId, clientSecret }),
        });
    },

    async getMaxHRPreference(): Promise<{ maxHR: number | null; updatedAt: number | null }> {
        return fetchApi('/setup/max-hr');
    },

    async saveMaxHRPreference(maxHR: number): Promise<{ ok: boolean; maxHR: number }> {
        return fetchApi('/setup/max-hr', {
            method: 'POST',
            body: JSON.stringify({ maxHR }),
        });
    },

    async clearMaxHRPreference(): Promise<{ ok: boolean }> {
        return fetchApi('/setup/max-hr', {
            method: 'DELETE',
        });
    },
};

export const google = {
    getLoginUrl(): string {
        return `${API_URL}/auth/google`;
    },

    async getSessionStatus(): Promise<{ connected: boolean }> {
        return fetchApi('/auth/google/session');
    },

    async getToken(): Promise<{ accessToken: string }> {
        return fetchApi('/auth/google/token');
    },
};

// Activity endpoints
export const activities = {
    async list(page = 1, perPage = 30): Promise<{ activities: Activity[]; hasMore: boolean }> {
        return fetchApi(`/api/athlete/activities?page=${page}&per_page=${perPage}`);
    },

    async get(id: number): Promise<Activity> {
        return fetchApi(`/api/activities/${id}`);
    },

    async getStreams(id: number): Promise<ActivityStreams> {
        const keys = 'time,distance,latlng,altitude,heartrate,cadence,velocity_smooth,grade_smooth';
        return fetchApi(`/api/activities/${id}/streams?keys=${keys}&key_by_type=true`);
    },

    async update(id: number, payload: { description: string }): Promise<Activity> {
        return fetchApi(`/api/activities/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },
};

// Athlete endpoints
export const athlete = {
    async getProfile(): Promise<Athlete> {
        return fetchApi('/api/athlete');
    },

    async getStats(): Promise<AthleteStats> {
        return fetchApi('/api/athlete/stats');
    },
};

// Gear endpoints
export const gear = {
    async get(id: string): Promise<Gear> {
        return fetchApi(`/api/gear/${id}`);
    },
};

// Route Planning endpoints
export const routes = {
    async generate(request: RouteGenerationRequest): Promise<GeneratedRoute[]> {
        return fetchApi('/api/routes/generate', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    },
};

// Geocoding endpoints
export const geocoding = {
    async search(query: string): Promise<GeocodingSuggestion[]> {
        return fetchApi(`/api/geocoding/search?q=${encodeURIComponent(query)}`);
    },

    async reverse(lat: number, lon: number): Promise<Partial<GeocodingSuggestion>> {
        return fetchApi(`/api/geocoding/reverse?lat=${lat}&lon=${lon}`);
    },
};

// Types used by this module
import type { Activity, ActivityStreams, Athlete, Gear, RouteGenerationRequest, GeneratedRoute } from '../types';

interface AthleteStats {
    all_run_totals: {
        count: number;
        distance: number;
        moving_time: number;
        elapsed_time: number;
        elevation_gain: number;
    };
    ytd_run_totals: {
        count: number;
        distance: number;
        moving_time: number;
        elapsed_time: number;
        elevation_gain: number;
    };
    recent_run_totals: {
        count: number;
        distance: number;
        moving_time: number;
        elapsed_time: number;
        elevation_gain: number;
    };
}

export { ApiError };
