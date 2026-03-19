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
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin text-4xl mb-4">🔄</div>
                <p className="text-white text-xl">Verifying your magic link...</p>
            </div>
        </div>
    );
}
