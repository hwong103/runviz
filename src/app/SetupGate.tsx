import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { SetupPage } from '@/features/setup/SetupPage';

const LOADING_QUIPS = [
    'Tying shoelaces...',
    'Stretching hamstrings...',
    'Pinning on the race bib...',
    'Calibrating the GPS watch...',
    'Warming up on the track...',
    'Checking the weather forecast...',
    'Lacing up the race shoes...',
    'Eating the pre-run banana...',
    'Consulting the training plan...',
    'Calculating the optimal pace...',
    'Checking heart rate zones...',
    'Plotting the route on the map...',
    'Filling the water bottle...',
    'Queuing up the race playlist...',
    'Applying the anti-chafe balm...',
    'Reviewing last week\'s mileage...',
    'Setting the interval timer...',
    'Checking for elevation on the course...',
    'Syncing the Garmin...',
    'Taking a deep breath at the start line...',
] as const;

const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);

interface SetupGateProps {
    authLoading: boolean;
    isAuthenticated: boolean;
    user: { id: string; email?: string; name?: string; image?: string | null } | null;
    needsStravaConnect: boolean;
    login: () => Promise<void>;
    connectStrava: () => Promise<void>;
    sendMagicLink: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    children: ReactNode;
}

function useLoadingQuip(): string {
    const [quip, setQuip] = useState(
        () => LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]
    );

    useEffect(() => {
        const interval = setInterval(() => {
            setQuip(LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]);
        }, 1800);
        return () => clearInterval(interval);
    }, []);

    return quip;
}

export function SetupGate({
    authLoading,
    isAuthenticated,
    user,
    needsStravaConnect,
    login,
    connectStrava,
    sendMagicLink,
    logout,
    children,
}: SetupGateProps) {
    const [searchParams] = useSearchParams();
    const [magicEmail, setMagicEmail] = useState('');
    const [magicSending, setMagicSending] = useState(false);
    const [magicStatus, setMagicStatus] = useState<string | null>(null);
    const [googleStatus, setGoogleStatus] = useState<string | null>(null);
    const loadingQuip = useLoadingQuip();

    useEffect(() => {
        const error = searchParams.get('error');
        if (!error) {
            return;
        }

        if (error === 'ATTEMPTS_EXCEEDED') {
            setMagicStatus('That magic link has already been used or has expired. Request a fresh one.');
            return;
        }

        if (error === 'magic_link_failed') {
            setMagicStatus('We could not verify that magic link. Request a fresh one and try again.');
            return;
        }

        if (error === 'auth_failed') {
            setMagicStatus('We could not complete sign-in. Please try again.');
        }
    }, [searchParams]);

    if (authLoading) {
        return (
            <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6">
                <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
                    <BrandWordmark compact />
                    <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
                    <div>
                        <p className="rv-kicker mb-2">System Sync</p>
                        <p className="text-lg font-medium text-[var(--rv-text-dim)]">{loadingQuip}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <main className="rv-grid-lines flex min-h-screen items-center justify-center px-4 py-10">
                <div className="rv-shell-card rv-glow-orb flex w-full max-w-5xl flex-col gap-8 overflow-hidden px-6 py-8 sm:px-10 lg:flex-row lg:items-end lg:px-12 lg:py-12">
                    <div className="flex-1 space-y-5">
                        <p className="rv-kicker rv-reveal-subtle" style={reveal(0)}>For Ambitious Runners</p>
                        <BrandWordmark />
                        <h1 className="rv-metric rv-reveal max-w-2xl text-5xl sm:text-6xl lg:text-7xl" style={reveal(80)}>
                            Clear training insights for runners getting more serious.
                        </h1>
                        <p className="rv-body-copy rv-reveal-subtle max-w-xl sm:text-lg" style={reveal(160)}>
                            Sign in with Google or magic link, then connect Strava to see your training load, plan routes, review running form, and keep your key metrics in one place.
                        </p>
                        <p className="rv-mini-label rv-reveal-subtle" style={reveal(220)}>
                            Training load, route planning, and video-based form analysis.
                        </p>
                    </div>
                    <div className="rv-panel rv-panel-accent rv-reveal rv-spotlight w-full max-w-md px-6 py-8 sm:px-8" style={reveal(140)}>
                        <p className="rv-kicker mb-4">Sign In</p>
                        <h2 className="rv-section-title mb-3">Open your RunViz workspace</h2>
                        <p className="rv-body-copy-sm mb-6">
                            Use Google or a magic link for your RunViz account, then connect Strava to bring in training data.
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={async () => {
                                    setGoogleStatus(null);
                                    try {
                                        await login();
                                    } catch (error) {
                                        console.error('Google sign-in failed:', error);
                                        setGoogleStatus('Google sign-in is unavailable right now. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the Worker and redeploy.');
                                    }
                                }}
                                className="rv-button-primary flex w-full items-center justify-center gap-3 px-8 py-4 text-sm active:translate-y-0"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
                                    <path d="M15.387 0L0 24h6.128l3.054-6.172h3.065L15.387 24l9.109-18.172h6.063L15.387 0z" opacity="0.6" />
                                </svg>
                                Continue with Google
                            </button>
                            {googleStatus ? (
                                <p className="rv-body-copy-sm">
                                    {googleStatus}
                                </p>
                            ) : null}
                            <div className="rv-reveal-subtle rounded-3xl border border-white/8 bg-white/[0.04] p-4" style={reveal(240)}>
                                <label htmlFor="magic-email" className="rv-mini-label mb-2 block">
                                    Magic link
                                </label>
                                <div className="flex flex-col gap-3">
                                    <input
                                        id="magic-email"
                                        name="email"
                                        type="email"
                                        value={magicEmail}
                                        onChange={(event) => setMagicEmail(event.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        className="rv-field w-full px-4 py-3 text-sm"
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!magicEmail.trim()) return;
                                            setMagicSending(true);
                                            setMagicStatus(null);
                                            try {
                                                await sendMagicLink(magicEmail.trim());
                                                setMagicStatus('Check your email for a sign-in link.');
                                            } catch (error) {
                                                console.error('Magic link failed:', error);
                                                setMagicStatus('Unable to send the magic link right now.');
                                            } finally {
                                                setMagicSending(false);
                                            }
                                        }}
                                        disabled={magicSending}
                                        className="rv-button-secondary rv-pill-label flex w-full items-center justify-center px-6 py-3 disabled:cursor-wait"
                                    >
                                        {magicSending ? 'Sending...' : 'Send magic link'}
                                    </button>
                                </div>
                                {magicStatus ? (
                                    <p className="rv-body-copy-sm mt-3">
                                        {magicStatus}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <p className="rv-mini-label mt-6 text-[0.68rem] sm:text-[0.7rem] lg:whitespace-nowrap">
                            Connect Strava during setup after sign-in.
                        </p>
                        <div className="mt-6 pt-4 text-center">
                            <Link
                                to="/privacy"
                                className="rv-mini-label transition hover:text-foreground"
                            >
                                Privacy Policy
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (needsStravaConnect) {
        return (
            <SetupPage
                authLoading={authLoading}
                isAuthenticated={isAuthenticated}
                user={user}
                needsStravaConnect={needsStravaConnect}
                login={login}
                connectStrava={connectStrava}
                sendMagicLink={sendMagicLink}
                logout={logout}
            />
        );
    }

    return <>{children}</>;
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
    return (
        <div className={`flex flex-col ${compact ? 'items-center gap-2' : 'items-start gap-2'}`}>
            <span className={`${compact ? 'text-3xl' : 'text-5xl sm:text-6xl'} font-bold tracking-[-0.08em] text-[var(--rv-text)]`}>
                RUN<span className="text-[var(--rv-yellow)]">VIZ</span>
            </span>
            <span className="rv-pill-label rounded-full border border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 px-3 py-1 text-[var(--rv-yellow)]">
                {compact ? 'Running Lab' : 'Running Training Lab'}
            </span>
        </div>
    );
}
