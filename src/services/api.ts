// API service for communicating with Cloudflare Workers backend

const API_URL = import.meta.env.VITE_API_URL || '';

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
    getLoginUrl(): string {
        const callbackUrl = `${window.location.origin}${import.meta.env.BASE_URL}callback`;
        return `${API_URL}/auth/strava?redirect_uri=${encodeURIComponent(callbackUrl)}`;
    },

    async handleCallback(code: string): Promise<{ athlete: { id: number; firstname: string; lastname: string; profile: string } }> {
        return fetchApi('/auth/callback', {
            method: 'POST',
            body: JSON.stringify({ code }),
        });
    },

    async logout(): Promise<void> {
        return fetchApi('/auth/logout', { method: 'POST' });
    },

    async getSession(): Promise<{ authenticated: boolean; athlete?: { id: number; firstname: string; lastname: string; profile: string } }> {
        return fetchApi('/auth/session');
    },

    async getStravaScopes(): Promise<{ scopes: string }> {
        return fetchApi('/auth/strava/scopes');
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
    async search(query: string): Promise<any[]> {
        return fetchApi(`/api/geocoding/search?q=${encodeURIComponent(query)}`);
    },

    async reverse(lat: number, lon: number): Promise<any> {
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
