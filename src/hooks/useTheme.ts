import { useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'runviz_theme_v1';
const listeners = new Set<() => void>();

let currentPreference: ThemePreference = getStoredPreference();

function getStoredPreference(): ThemePreference {
    if (typeof window === 'undefined') {
        return 'system';
    }

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light' || stored === 'system') {
            return stored;
        }
    } catch {
        // Ignore storage failures and fall back to system preference.
    }

    return 'system';
}

export function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') {
        return 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
    return preference === 'system' ? getSystemTheme() : preference;
}

function applyTheme(resolved: ResolvedTheme) {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
}

function emitChange() {
    listeners.forEach((listener) => listener());
}

function setStoredPreference(preference: ThemePreference) {
    currentPreference = preference;

    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(STORAGE_KEY, preference);
        } catch {
            // Ignore storage failures.
        }
    }

    applyTheme(resolveTheme(preference));
    emitChange();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return currentPreference;
}

export function useTheme() {
    const preference = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const resolved = resolveTheme(preference);

    useEffect(() => {
        applyTheme(resolved);
    }, [resolved]);

    useEffect(() => {
        if (preference !== 'system' || typeof window === 'undefined') {
            return;
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        const handleChange = () => {
            applyTheme(resolveTheme('system'));
            emitChange();
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [preference]);

    const setTheme = (nextPreference: ThemePreference) => {
        setStoredPreference(nextPreference);
    };

    return { preference, resolved, setTheme };
}
