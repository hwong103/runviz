import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../services/api';

export function Callback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
            console.error('OAuth error:', error);
            navigate('/?error=' + encodeURIComponent(error));
            return;
        }

        if (code) {
            handleCallback(code);
        } else {
            navigate('/');
        }
    }, [searchParams, navigate]);

    async function handleCallback(code: string) {
        try {
            await auth.handleCallback(code);
            navigate('/');
        } catch (err) {
            console.error('Callback error:', err);
            navigate('/?error=auth_failed');
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin text-4xl mb-4">🔄</div>
                <p className="text-white text-xl">Connecting to Strava...</p>
            </div>
        </div>
    );
}
