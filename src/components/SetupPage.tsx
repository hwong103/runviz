import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download } from 'lucide-react';
import { auth as authApi } from '../services/api';

const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);

interface SetupPageProps {
  authLoading: boolean;
  isAuthenticated: boolean;
  user: { id: string; email?: string; name?: string; image?: string | null } | null;
  needsStravaConnect: boolean;
  login: () => Promise<void>;
  connectStrava: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function SetupPage({
  authLoading,
  isAuthenticated,
  user,
  needsStravaConnect,
  login,
  connectStrava,
  sendMagicLink,
  logout,
}: SetupPageProps) {
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSending, setMagicSending] = useState(false);
  const [magicStatus, setMagicStatus] = useState<string | null>(null);
  const [stravaClientIdInput, setStravaClientIdInput] = useState('');
  const [stravaClientSecretInput, setStravaClientSecretInput] = useState('');
  const [stravaKeyConfigured, setStravaKeyConfigured] = useState(false);
  const [stravaKeyUpdatedAt, setStravaKeyUpdatedAt] = useState<number | null>(null);
  const [stravaSetupLoading, setStravaSetupLoading] = useState(false);
  const [stravaSetupSaving, setStravaSetupSaving] = useState(false);
  const [stravaSetupStatus, setStravaSetupStatus] = useState<string | null>(null);
  const [formLeadOffset, setFormLeadOffset] = useState(0);
  const setupGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!needsStravaConnect) {
      setStravaClientIdInput('');
      setStravaClientSecretInput('');
      setStravaKeyConfigured(false);
      setStravaKeyUpdatedAt(null);
      setStravaSetupStatus(null);
      setStravaSetupLoading(false);
      setStravaSetupSaving(false);
      return;
    }

    let cancelled = false;
    setStravaSetupLoading(true);
    setStravaSetupStatus(null);

    void authApi.getStravaKeyStatus()
      .then((status) => {
        if (cancelled) return;
        setStravaKeyConfigured(status.configured);
        setStravaClientIdInput(status.clientId ?? '');
        setStravaClientSecretInput('');
        setStravaKeyUpdatedAt(status.updatedAt ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unable to load your Strava setup.';
        setStravaSetupStatus(message);
      })
      .finally(() => {
        if (!cancelled) {
          setStravaSetupLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [needsStravaConnect]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFormLeadOffset(0);
      return;
    }

    const updateFormOffset = () => {
      if (window.innerWidth < 1024) {
        setFormLeadOffset(0);
        return;
      }

      const gridTop = setupGridRef.current?.getBoundingClientRect().top ?? 0;
      const scrollProgress = Math.max(0, 120 - gridTop);
      const nextOffset = Math.min(220, scrollProgress * 0.45);
      setFormLeadOffset(nextOffset);
    };

    updateFormOffset();
    window.addEventListener('scroll', updateFormOffset, { passive: true });
    window.addEventListener('resize', updateFormOffset);

    return () => {
      window.removeEventListener('scroll', updateFormOffset);
      window.removeEventListener('resize', updateFormOffset);
    };
  }, [isAuthenticated]);

  const accountLabel = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email;
    return 'your account';
  }, [user?.email, user?.name]);

  if (authLoading) {
    return (
      <div className="rv-grid-lines flex min-h-screen items-center justify-center px-6 py-10">
        <div className="rv-panel rv-panel-accent flex max-w-md flex-col items-center gap-5 px-10 py-12 text-center">
          <BrandWordmark compact />
          <div className="h-12 w-12 rounded-full border-4 border-[var(--rv-blue)]/40 border-t-[var(--rv-blue)] animate-spin" />
          <div>
            <p className="rv-kicker mb-2">System Sync</p>
            <p className="text-lg font-medium text-[var(--rv-text-dim)]">Loading your RunViz setup...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rv-grid-lines min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1600px] flex-col gap-6 lg:flex-row lg:items-stretch">
          <section className="rv-shell-card rv-glow-orb flex-1 overflow-hidden px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="max-w-3xl space-y-6">
              <p className="rv-kicker rv-reveal-subtle" style={reveal(0)}>Connect your Strava account</p>
              <BrandWordmark />
              <h1 className="rv-metric rv-reveal max-w-2xl text-5xl sm:text-6xl lg:text-7xl" style={reveal(80)}>
                Sign in first, then we’ll walk you through Strava setup.
              </h1>
              <p className="rv-body-copy rv-reveal-subtle max-w-2xl sm:text-lg" style={reveal(160)}>
                RunViz needs access to your Strava data. To set this up, you'll create a free Strava API application — this takes about 2 minutes.
              </p>
              <div className="rv-reveal-subtle grid gap-3 sm:grid-cols-2" style={reveal(220)}>
                <button
                  onClick={async () => {
                    try {
                      await login();
                    } catch (error) {
                      console.error('Google sign-in failed:', error);
                    }
                  }}
                  className="rv-button-primary px-6 py-4 sm:px-8"
                >
                  Continue with Google
                </button>
                <Link
                  to="/"
                  className="rv-button-secondary rv-pill-label inline-flex items-center justify-center px-6 py-4 sm:px-8"
                >
                  Go back
                </Link>
              </div>

              <div className="rv-panel rv-panel-strong rv-reveal-subtle rv-spotlight max-w-xl px-5 py-5 sm:px-6" style={reveal(300)}>
                <label htmlFor="setup-magic-email" className="rv-mini-label mb-2 block">
                  Magic link
                </label>
                <div className="flex flex-col gap-3">
                  <input
                    id="setup-magic-email"
                    name="email"
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="rv-field px-4 py-3 text-sm"
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
                {magicStatus && (
                  <p className="rv-body-copy-sm mt-3">
                    {magicStatus}
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className="rv-panel rv-panel-strong rv-reveal rv-spotlight flex w-full max-w-xl flex-col justify-between gap-6 px-6 py-8 sm:px-8 lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:self-start" style={reveal(180)}>
            <div className="space-y-4">
              <p className="rv-kicker">What you’ll do</p>
              <div className="space-y-3 text-sm leading-7 text-[var(--rv-text-dim)]">
                <p>Open the Strava API settings page.</p>
                <p>Create a free app with your RunViz callback domain.</p>
                <p>Copy the Client ID and Client Secret back into RunViz.</p>
              </div>
            </div>
            <Link
              to="/"
              className="rv-button-secondary rv-pill-label inline-flex items-center justify-center px-6 py-4"
            >
              Back to home
            </Link>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="rv-grid-lines min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div
        ref={setupGridRef}
        className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1600px] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]"
      >
        <section className="rv-shell-card rv-glow-orb overflow-hidden px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="max-w-4xl space-y-8">
            <div className="space-y-4">
              <p className="rv-kicker rv-reveal-subtle" style={reveal(0)}>Connect your Strava account</p>
              <BrandWordmark />
              <p className="rv-body-copy rv-reveal-subtle max-w-3xl sm:text-lg" style={reveal(90)}>
                RunViz needs access to your Strava data. To set this up, you'll create a free Strava API application — this takes about 2 minutes.
              </p>
            </div>

            <div className="grid gap-4">
              <InstructionStep index="01" title="Open the Strava API settings page" delay={180}>
                <p>
                  Go to{' '}
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--rv-blue)] underline decoration-white/20 decoration-2 underline-offset-4 transition hover:text-[var(--rv-text)]"
                  >
                    strava.com/settings/api
                  </a>{' '}
                  in a new tab. Make sure you're logged in to Strava first.
                </p>
              </InstructionStep>

              <InstructionStep index="02" title="Create a new application" delay={250}>
                <p>If you see a form rather than an existing app, fill it in like this:</p>
                <div className="overflow-hidden rounded-[1.35rem] border border-white/8 bg-black/20">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="rv-mini-label border-b border-white/8 text-[var(--rv-text-faint)]">
                        <th className="px-4 py-3 font-semibold">Field</th>
                        <th className="px-4 py-3 font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Application Name</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">
                          <SetupValueCell value="RunViz" label="application name" />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Category</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">Visualizer</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Website</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">
                          <SetupValueCell value="https://runviz.hwong103.work" label="website URL" />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Authorization Callback Domain</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">
                          <SetupValueCell value="runviz.hwong103.work" label="callback domain" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="rounded-[1.35rem] border border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/8 px-4 py-3 text-sm leading-7 text-[var(--rv-text-dim)]">
                  <p>
                    <strong className="text-[var(--rv-text)]">Website</strong> must be a valid URL — use the RunViz URL above.
                  </p>
                  <p>
                    <strong className="text-[var(--rv-text)]">Authorization Callback Domain</strong> is the domain only — no https://, no trailing slash.
                  </p>
                </div>
                <p className="rv-body-copy-sm">
                  Tick the "I agree" checkbox and click <strong className="text-[var(--rv-text)]">Create</strong>.
                </p>
              </InstructionStep>

              <InstructionStep index="03" title="Upload the app icon" delay={320}>
                <p>Strava asks for a square app icon right after creation. You can use the RunViz mark below to save time.</p>
                <div className="flex flex-col gap-4 rounded-[1.35rem] border border-white/8 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <img
                      src="/runviz-mark.png"
                      alt="RunViz app icon"
                      className="h-16 w-16 rounded-2xl border border-white/10 bg-white/5 object-cover"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[var(--rv-text)]">RunViz app icon</p>
                      <p className="text-sm text-[var(--rv-text-dim)]">PNG, 256 x 256, ready to upload.</p>
                    </div>
                  </div>
                  <a
                    href="/runviz-mark.png"
                    download="runviz-strava-icon.png"
                    className="rv-button-secondary rv-pill-label inline-flex items-center justify-center gap-2 px-4 py-2.5"
                  >
                    <Download className="h-4 w-4" />
                    Download icon
                  </a>
                </div>
              </InstructionStep>

              <InstructionStep index="04" title="Copy your credentials" delay={390}>
                <p>After creating your app, or if one already exists, you’ll land on the app detail page. Copy these two values:</p>
                <ul className="space-y-3 text-sm leading-7 text-[var(--rv-text-dim)]">
                  <li><strong className="text-[var(--rv-text)]">Client ID</strong> — a short number, e.g. <code className="rounded-md bg-white/5 px-2 py-1 text-[var(--rv-text)]">12345</code></li>
                  <li><strong className="text-[var(--rv-text)]">Client Secret</strong> — a long alphanumeric string. Click <em>show</em> next to it to reveal it, then copy it.</li>
                </ul>
                <div className="rounded-[1.35rem] border border-amber-400/15 bg-amber-400/8 px-4 py-3 text-sm leading-7 text-[var(--rv-text-dim)]">
                  <strong className="text-[var(--rv-text)]">Do not</strong> copy the Access Token or Refresh Token — those are different fields and are not needed here.
                </div>
              </InstructionStep>
            </div>
          </div>
        </section>

        <aside
          className="rv-panel rv-panel-accent rv-reveal rv-spotlight flex flex-col gap-6 px-6 py-8 sm:px-8 lg:sticky lg:h-[calc(100vh-4rem)] lg:self-start lg:overflow-auto"
          style={{ ...reveal(200), top: '32px', transform: `translateY(${formLeadOffset}px)` }}
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="rv-kicker">Your Strava app</p>
              <h2 className="rv-metric text-4xl sm:text-5xl">Paste and connect</h2>
              <p className="rv-body-copy-sm">
                Paste your Client ID and Client Secret here, then RunViz will save them for {accountLabel} and take you straight into Strava connection.
              </p>
            </div>

            {needsStravaConnect ? (
              <>
                <div className="space-y-4">
                  <label className="rv-mini-label flex flex-col gap-2">
                    Client ID
                    <input
                      value={stravaClientIdInput}
                      onChange={(e) => setStravaClientIdInput(e.target.value)}
                      placeholder="123456"
                      className="rv-field px-4 py-3 text-sm normal-case tracking-normal"
                    />
                  </label>
                  <label className="rv-mini-label flex flex-col gap-2">
                    Client Secret
                    <input
                      type="password"
                      value={stravaClientSecretInput}
                      onChange={(e) => setStravaClientSecretInput(e.target.value)}
                      placeholder={stravaKeyConfigured ? 'Saved. Enter a new value to rotate it.' : 'Paste your Strava Client Secret'}
                      className="rv-field px-4 py-3 text-sm normal-case tracking-normal"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={async () => {
                      try {
                        const trimmedClientId = stravaClientIdInput.trim();
                        const trimmedClientSecret = stravaClientSecretInput.trim();
                        const shouldSaveCredentials = trimmedClientId.length > 0 || trimmedClientSecret.length > 0;

                        if (!stravaKeyConfigured && !shouldSaveCredentials) {
                          setStravaSetupStatus('Enter both your Strava Client ID and Client Secret.');
                          return;
                        }

                        if (shouldSaveCredentials) {
                          if (!trimmedClientId || !trimmedClientSecret) {
                            setStravaSetupStatus('Enter both your Strava Client ID and Client Secret.');
                            return;
                          }

                          setStravaSetupSaving(true);
                          setStravaSetupStatus(null);
                          await authApi.saveStravaKey(trimmedClientId, trimmedClientSecret);
                          const status = await authApi.getStravaKeyStatus();
                          setStravaKeyConfigured(status.configured);
                          setStravaKeyUpdatedAt(status.updatedAt ?? null);
                          setStravaClientIdInput(status.clientId ?? trimmedClientId);
                          setStravaClientSecretInput('');
                        }

                        setStravaSetupStatus(shouldSaveCredentials ? 'Strava app saved. Redirecting you to connect Strava...' : 'Redirecting you to connect Strava...');
                        await connectStrava();
                      } catch (error) {
                        console.error('Failed to continue Strava setup:', error);
                        setStravaSetupStatus(error instanceof Error ? error.message : 'Unable to continue Strava setup.');
                      } finally {
                        setStravaSetupSaving(false);
                      }
                    }}
                    disabled={stravaSetupSaving || stravaSetupLoading}
                    className="rv-button-secondary rv-pill-label px-6 py-3 disabled:cursor-wait"
                  >
                    {stravaSetupSaving ? 'Saving...' : stravaKeyConfigured ? 'Connect Strava' : 'Save and connect Strava'}
                  </button>
                  <div className="rv-body-copy-sm">
                    {stravaSetupLoading
                      ? 'Loading your saved Strava app...'
                      : stravaKeyConfigured
                        ? `Saved for this account${stravaKeyUpdatedAt ? ` on ${new Date(stravaKeyUpdatedAt * 1000).toLocaleDateString()}` : ''}.`
                        : 'No Strava app saved for this account yet.'}
                  </div>
                </div>

                {stravaSetupStatus && (
                  <p className="rv-body-copy-sm">
                    {stravaSetupStatus}
                  </p>
                )}
                <button
                  onClick={logout}
                  className="rv-button-secondary rv-pill-label px-6 py-4"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-5 py-5 text-sm leading-7 text-[var(--rv-text-dim)]">
                <p className="text-[var(--rv-text)]">Strava is already connected for this account.</p>
                <p className="mt-2">You can return to the dashboard or reconnect if you want to change accounts.</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/"
                    className="rv-button-primary inline-flex items-center justify-center px-6 py-4"
                  >
                    Go to dashboard
                  </Link>
                  <button
                    onClick={connectStrava}
                    className="rv-button-secondary rv-pill-label px-6 py-4"
                  >
                    Reconnect Strava
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-[var(--rv-green)]/20 bg-[var(--rv-green)]/8 px-5 py-5 text-sm leading-7 text-[var(--rv-text-dim)]">
            <p className="text-[var(--rv-text)]">🔒 Your secret is safe.</p>
            <p className="mt-2">
              The Client Secret is encrypted before being stored. It is never visible to RunViz staff and is only used to fetch your Strava data.
            </p>
          </div>

          <div className="space-y-3">
            <p className="rv-mini-label">Need help?</p>
            <p className="rv-body-copy-sm">Keep the Strava app tab open while you copy the values back here.</p>
          </div>
        </aside>
      </div>

      <div className="rv-mini-label mt-6 mx-auto max-w-[1600px] px-1 text-[var(--rv-text-faint)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4">
          <span>RunViz setup</span>
          <span>Secure Strava connection flow</span>
        </div>
      </div>

      {!needsStravaConnect && (
        <div className="mt-4 mx-auto max-w-[1600px] px-1">
          <div className="rounded-[1.5rem] border border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/8 px-5 py-4 text-sm leading-7 text-[var(--rv-text-dim)]">
            Your Strava app is already saved for this account. If you just updated credentials, you can reconnect from the panel above.
          </div>
        </div>
      )}
    </div>
  );
}

function InstructionStep({
  index,
  title,
  delay = 0,
  children,
}: {
  index: string;
  title: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <article className="rv-panel rv-reveal-subtle rv-spotlight overflow-hidden px-5 py-5 sm:px-6" style={reveal(delay)}>
      <div className="flex items-start gap-4">
        <span className="rv-pill-label mt-0.5 inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-[var(--rv-yellow)]/25 bg-[var(--rv-yellow)]/10 px-3 text-[var(--rv-yellow)]">
          Step {index}
        </span>
        <div className="min-w-0 space-y-3">
          <h3 className="rv-section-title text-[1.45rem]">{title}</h3>
          <div className="space-y-3 text-sm leading-7 text-[var(--rv-text-dim)]">{children}</div>
        </div>
      </div>
    </article>
  );
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rv-reveal-subtle flex ${compact ? 'items-center gap-3' : 'flex-col items-start gap-2'}`} style={reveal(40)}>
      <span className={`${compact ? 'text-3xl' : 'text-5xl sm:text-6xl'} font-bold tracking-[-0.08em] text-[var(--rv-text)]`}>
        RUN<span className="text-[var(--rv-yellow)]">VIZ</span>
      </span>
      <span className="rv-pill-label rounded-full border border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 px-3 py-1 text-[var(--rv-yellow)]">
        {compact ? 'Running Lab' : 'Running Training Lab'}
      </span>
    </div>
  );
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch (error) {
          console.error(`Failed to copy ${label}:`, error);
        }
      }}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--rv-text-dim)] transition hover:border-white/20 hover:text-[var(--rv-text)]"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function SetupValueCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-lg border border-white/8 bg-white/5 px-2 py-1 text-[0.95em] text-[var(--rv-text)]">
        {value}
      </code>
      <CopyValueButton value={value} label={label} />
    </div>
  );
}
