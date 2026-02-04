import { useEffect, useState } from 'react';
import { auth, athlete as athleteApi } from '../services/api';
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
            setState({
                isAuthenticated: false,
                athlete: null,
                loading: false,
                error: null,
            });
        } catch (err) {
            setState((prev) => ({
                ...prev,
                error: err instanceof Error ? err.message : 'Logout failed',
            }));
        }
    }

    return {
        ...state,
        login,
        logout,
        refresh: checkSession,
    };
}
