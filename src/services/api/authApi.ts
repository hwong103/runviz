import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

import { API_URL, fetchApi } from './http';

const AUTH_BASE_URL = API_URL || window.location.origin;

const authClient = createAuthClient({
    baseURL: AUTH_BASE_URL,
    basePath: '/api/auth',
    plugins: [magicLinkClient()],
});

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
