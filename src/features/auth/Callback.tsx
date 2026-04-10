import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/services/api/authApi';

export function Callback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const code = searchParams.get('code');
        const state = searchParams.get('state') || undefined;
        const error = searchParams.get('error');

        async function handleCallback(code: string, state?: string) {
            try {
                await auth.handleCallback(code, state);
                navigate('/');
            } catch (err) {
                console.error('Callback error:', err);
                navigate('/?error=auth_failed');
            }
        }

        if (error) {
            console.error('OAuth error:', error);
            navigate('/?error=' + encodeURIComponent(error));
            return;
        }

        if (code) {
            handleCallback(code, state);
        } else {
            navigate('/');
        }
    }, [searchParams, navigate]);

    return (
        <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
            <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
                <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
                <div>
                    <p className="rv-kicker mb-2">System Sync</p>
                    <p className="rv-body-copy">Connecting to Strava...</p>
                </div>
            </div>
        </div>
    );
}
