import { useEffect, useState } from 'react';
import { auth, athlete as athleteApi } from '../services/api';
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

    async function checkSession() {
        try {
            const session = await auth.getSession();
            if (session.authenticated) {
                // Fetch full profile to get gear/shoes
                const fullProfile = await athleteApi.getProfile();
                console.log('DEBUG: Full Athlete Profile:', fullProfile);
                console.log('DEBUG: Shoes:', fullProfile.shoes);
                console.log('DEBUG: Gear:', (fullProfile as any).gear);
                setState({
                    isAuthenticated: true,
                    athlete: fullProfile,
                    loading: false,
                    error: null,
                });
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
