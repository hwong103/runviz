import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function GoogleAuthCallback() {
    const location = useLocation();

    useEffect(() => {
        let cancelled = false;
        const fallbackTarget = `${window.location.origin}/signin/complete`;

        void fetch(`${window.location.origin}${location.pathname}${location.search}`, {
            credentials: 'include',
        })
            .then((response) => {
                if (cancelled) return;
                window.location.replace(response.url || fallbackTarget);
            })
            .catch(() => {
                if (cancelled) return;
                const separator = fallbackTarget.includes('?') ? '&' : '?';
                window.location.replace(`${fallbackTarget}${separator}error=auth_failed`);
            });

        return () => {
            cancelled = true;
        };
    }, [location.pathname, location.search]);

    return (
        <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
            <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
                <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
                <div>
                    <p className="rv-kicker mb-2">System Sync</p>
                    <p className="text-lg font-medium text-[var(--rv-text-dim)]">Completing Google sign-in...</p>
                </div>
            </div>
        </div>
    );
}
