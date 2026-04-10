import {
    createElement,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { auth } from '../services/api';
import { syncMaxHRForUser } from './useMaxHR';
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

interface AuthContextValue extends AuthState {
    login: () => Promise<void>;
    connectStrava: () => Promise<void>;
    sendMagicLink: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthState(): AuthContextValue {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        athlete: null,
        user: null,
        needsStravaConnect: false,
        loading: true,
        error: null,
    });

    const checkSession = useCallback(async () => {
        try {
            const session = await auth.getSession();
            if (session.authenticated) {
                await syncMaxHRForUser(session.user?.id ?? null);
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
                await syncMaxHRForUser(null);
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
            await syncMaxHRForUser(null);
            setState({
                isAuthenticated: false,
                athlete: null,
                user: null,
                needsStravaConnect: false,
                loading: false,
                error: null,
            });
        }
    }, []);

    useEffect(() => {
        void checkSession();
    }, [checkSession]);

    const login = useCallback(() => {
        return auth.signInGoogle();
    }, []);

    const connectStrava = useCallback(async () => {
        const { url } = await auth.getStravaLoginUrl('link');
        window.location.href = url;
    }, []);

    const sendMagicLink = useCallback(async (email: string) => {
        await auth.sendMagicLink(email);
    }, []);

    const logout = useCallback(async () => {
        try {
            await auth.logout();
        } catch (err) {
            console.error('Logout failed:', err);
        } finally {
            // Always clear local cache and state, even if server logout fails
            await cache.clearCache();
            await syncMaxHRForUser(null);
            setState({
                isAuthenticated: false,
                athlete: null,
                user: null,
                needsStravaConnect: false,
                loading: false,
                error: null,
            });
        }
    }, []);

    return useMemo(() => ({
        ...state,
        login,
        connectStrava,
        sendMagicLink,
        logout,
        refresh: checkSession,
    }), [state, login, connectStrava, sendMagicLink, logout, checkSession]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const value = useAuthState();
    return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
