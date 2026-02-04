import { useEffect, useState } from 'react';
import { auth } from '../services/api';
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
            setState({
                isAuthenticated: session.authenticated,
                athlete: session.athlete as Athlete | null,
                loading: false,
                error: null,
            });
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
