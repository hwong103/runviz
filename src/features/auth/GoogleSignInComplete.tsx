import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function GoogleSignInComplete() {
    const navigate = useNavigate();

    useEffect(() => {
        const timer = window.setTimeout(() => {
            navigate('/', { replace: true });
        }, 250);

        return () => window.clearTimeout(timer);
    }, [navigate]);

    return (
        <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
            <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
                <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
                <div>
                    <p className="rv-kicker mb-2">System Sync</p>
                    <p className="rv-body-copy">Completing Google sign-in...</p>
                </div>
            </div>
        </div>
    );
}
