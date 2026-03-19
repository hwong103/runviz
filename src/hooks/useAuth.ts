import { useEffect, useState } from 'react';
import { auth } from '../services/api';
import * as cache from '../services/cache';
import type { Athlete } from '../types';

interface AuthState {
    isAuthenticated: boolean;
    athlete: Athlete | null;
    user: { id: string; email?: string; name?: string; image?: string | null } | null;
    needsStravaConnect: boolean;
    loading: boolean;
    error: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        athlete: null,
        user: null,
        needsStravaConnect: false,
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
                const athlete: Athlete | null = session.athlete ? {
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
                    athlete,
                    user: session.user ?? null,
                    needsStravaConnect: !!session.needsStravaConnect,
                    loading: false,
                    error: null,
                });
            } else {
                setState({
                    isAuthenticated: false,
                    athlete: null,
                    user: null,
                    needsStravaConnect: false,
                    loading: false,
                    error: null,
                });
            }
        } catch {
            setState({
                isAuthenticated: false,
                athlete: null,
                user: null,
                needsStravaConnect: false,
                loading: false,
                error: null,
            });
        }
    }

    function login() {
        return auth.signInGoogle();
    }

    async function connectStrava() {
        const { url } = await auth.getStravaLoginUrl('link');
        window.location.href = url;
    }

    async function sendMagicLink(email: string) {
        await auth.sendMagicLink(email);
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
                user: null,
                needsStravaConnect: false,
                loading: false,
                error: null,
            });
        }
    }

    return {
        ...state,
        login,
        connectStrava,
        sendMagicLink,
        logout,
        refresh: checkSession,
    };
}
