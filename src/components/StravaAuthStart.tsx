import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function StravaAuthStart() {
    const location = useLocation();

    useEffect(() => {
        // This route is only a SPA fallback. Reloading the same URL as a
        // top-level navigation lets the browser follow the Worker 302 to Strava.
        window.location.replace(`${window.location.origin}${location.pathname}${location.search}`);
    }, [location.pathname, location.search]);

    return (
        <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
            <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
                <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
                <div>
                    <p className="rv-kicker mb-2">Route Sync</p>
                    <p className="text-lg font-medium text-[var(--rv-text-dim)]">Connecting you to Strava...</p>
                </div>
            </div>
        </div>
    );
}
