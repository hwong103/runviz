import { useEffect, useState } from 'react';
import { auth, athlete as athleteApi, ApiError } from '../services/api';
import * as cache from '../services/cache';
import type { Athlete } from '../types';

interface AuthState {
    isAuthenticated: boolean;
    athlete: Athlete | null;
    loading: boolean;
    error: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        athlete: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        checkSession();
    }, []);

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    async function getProfileWithRetry(retries = 2): Promise<Athlete> {
        let lastError: unknown;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await athleteApi.getProfile();
            } catch (err) {
                lastError = err;
                const isRetriable =
                    err instanceof ApiError &&
                    (err.status === 429 || err.status >= 500);
                if (!isRetriable || attempt === retries) break;
                await wait(400 * (attempt + 1));
            }
        }
        throw lastError;
    }

    async function checkSession() {
        try {
            const session = await auth.getSession();
            if (session.authenticated) {
                try {
                    // Fetch full profile to get gear/shoes
                    const fullProfile = await getProfileWithRetry();
                    setState({
                        isAuthenticated: true,
                        athlete: fullProfile,
                        loading: false,
                        error: null,
                    });
                } catch (err) {
                    // Keep user authenticated from session even if profile endpoint is rate-limited.
                    const fallbackAthlete: Athlete | null = session.athlete ? {
                        id: session.athlete.id,
                        username: '',
                        firstname: session.athlete.firstname,
                        lastname: session.athlete.lastname,
                        profile: session.athlete.profile,
                        profile_medium: session.athlete.profile,
                        shoes: [],
                        bikes: [],
                        gear: [],
                    } : null;

                    setState({
                        isAuthenticated: true,
                        athlete: fallbackAthlete,
                        loading: false,
                        error: err instanceof ApiError && err.status === 429
                            ? 'Strava is rate limiting requests. Please retry in a few minutes.'
                            : 'Profile data is temporarily unavailable.',
                    });
                }
            } else {
                setState({
                    isAuthenticated: false,
                    athlete: null,
                    loading: false,
                    error: null,
                });
            }
        } catch {
            setState({
                isAuthenticated: false,
                athlete: null,
                loading: false,
                error: null,
            });
        }
    }

    function login() {
        window.location.href = auth.getLoginUrl();
    }

    async function logout() {
        try {
            await auth.logout();
        } catch (err) {
            console.error('Logout failed:', err);
        } finally {
            // Always clear local cache and state, even if server logout fails
            await cache.clearCache();
            setState({
                isAuthenticated: false,
                athlete: null,
                loading: false,
                error: null,
            });
        }
    }

    return {
        ...state,
        login,
        logout,
        refresh: checkSession,
    };
}
