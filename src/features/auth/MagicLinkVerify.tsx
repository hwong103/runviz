import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function MagicLinkVerify() {
    const location = useLocation();

    useEffect(() => {
        const callbackURL = new URLSearchParams(location.search).get('callbackURL') || `${window.location.origin}/`;
        const fallbackTarget = (() => {
            try {
                return new URL(callbackURL, window.location.origin).toString();
            } catch {
                return `${window.location.origin}/`;
            }
        })();

        let cancelled = false;

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
                window.location.replace(`${fallbackTarget}${separator}error=magic_link_failed`);
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
                    <p className="rv-body-copy">Verifying your magic link...</p>
                </div>
            </div>
        </div>
    );
}
