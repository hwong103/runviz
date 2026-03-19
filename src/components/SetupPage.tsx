import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth as authApi } from '../services/api';

interface SetupPageProps {
  authLoading: boolean;
  isAuthenticated: boolean;
  user: { id: string; email?: string; name?: string; image?: string | null } | null;
  needsStravaConnect: boolean;
  login: () => Promise<void>;
  connectStrava: () => void;
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
          <section className="rv-shell-card flex-1 overflow-hidden px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="max-w-3xl space-y-6">
              <p className="rv-kicker">Connect your Strava account</p>
              <BrandWordmark />
              <h1 className="rv-metric max-w-2xl text-5xl sm:text-6xl lg:text-7xl">
                Sign in first, then we’ll walk you through Strava setup.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--rv-text-dim)] sm:text-lg">
                RunViz needs access to your Strava data. To set this up, you'll create a free Strava API application — this takes about 2 minutes.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={async () => {
                    try {
                      await login();
                    } catch (error) {
                      console.error('Google sign-in failed:', error);
                    }
                  }}
                  className="rv-button-primary px-6 py-4 text-xs sm:px-8"
                >
                  Continue with Google
                </button>
                <Link
                  to="/"
                  className="rv-button-secondary inline-flex items-center justify-center px-6 py-4 text-xs sm:px-8"
                >
                  Go back
                </Link>
              </div>

              <div className="rv-panel rv-panel-strong max-w-xl px-5 py-5 sm:px-6">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--rv-text-faint)]">
                  Magic link
                </label>
                <div className="flex flex-col gap-3">
                  <input
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="you@example.com"
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
                    className="rv-button-secondary flex w-full items-center justify-center px-6 py-3 text-xs uppercase tracking-[0.24em] disabled:cursor-wait"
                  >
                    {magicSending ? 'Sending...' : 'Send magic link'}
                  </button>
                </div>
                {magicStatus && (
                  <p className="mt-3 text-xs leading-5 text-[var(--rv-text-dim)]">
                    {magicStatus}
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className="rv-panel rv-panel-strong flex w-full max-w-xl flex-col justify-between gap-6 px-6 py-8 sm:px-8 lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:self-start">
            <div className="space-y-4">
              <p className="rv-kicker">What you’ll do</p>
              <div className="space-y-3 text-sm leading-6 text-[var(--rv-text-dim)]">
                <p>Open the Strava API settings page.</p>
                <p>Create a free app with your RunViz callback domain.</p>
                <p>Copy the Client ID and Client Secret back into RunViz.</p>
              </div>
            </div>
            <Link
              to="/"
              className="rv-button-secondary inline-flex items-center justify-center px-6 py-4 text-xs uppercase tracking-[0.24em]"
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
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1600px] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <section className="rv-shell-card overflow-hidden px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="max-w-4xl space-y-8">
            <div className="space-y-4">
              <p className="rv-kicker">Connect your Strava account</p>
              <BrandWordmark />
              <p className="max-w-3xl text-base leading-7 text-[var(--rv-text-dim)] sm:text-lg">
                RunViz needs access to your Strava data. To set this up, you'll create a free Strava API application — this takes about 2 minutes.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="rv-chip">Step-by-step guide</span>
                <span className="rv-chip">Account-specific credentials</span>
                <span className="rv-chip">Encrypted secret storage</span>
              </div>
            </div>

            <div className="grid gap-4">
              <InstructionStep index="01" title="Open the Strava API settings page">
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

              <InstructionStep index="02" title="Create a new application">
                <p>If you see a form rather than an existing app, fill it in like this:</p>
                <div className="overflow-hidden rounded-[1.35rem] border border-white/8 bg-black/20">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/8 text-[10px] uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">
                        <th className="px-4 py-3 font-semibold">Field</th>
                        <th className="px-4 py-3 font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Application Name</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">Anything you like, e.g. "RunViz"</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Category</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">Visualizer</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Club</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">leave blank</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Website</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">
                          <code className="rounded-lg border border-white/8 bg-white/5 px-2 py-1 text-[0.95em] text-[var(--rv-text)]">
                            https://runviz.hwong103.work
                          </code>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--rv-text)]">Authorization Callback Domain</td>
                        <td className="px-4 py-3 text-[var(--rv-text-dim)]">
                          <code className="rounded-lg border border-white/8 bg-white/5 px-2 py-1 text-[0.95em] text-[var(--rv-text)]">
                            runviz.hwong103.work
                          </code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="rounded-[1.35rem] border border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/8 px-4 py-3 text-sm leading-6 text-[var(--rv-text-dim)]">
                  <p>
                    <strong className="text-[var(--rv-text)]">Website</strong> must be a valid URL — use the RunViz URL above.
                  </p>
                  <p>
                    <strong className="text-[var(--rv-text)]">Authorization Callback Domain</strong> is the domain only — no https://, no trailing slash.
                  </p>
                </div>
                <p className="text-sm leading-6 text-[var(--rv-text-dim)]">
                  Tick the "I agree" checkbox and click <strong className="text-[var(--rv-text)]">Create</strong>.
                </p>
              </InstructionStep>

              <InstructionStep index="03" title="Copy your credentials">
                <p>After creating your app, or if one already exists, you’ll land on the app detail page. Copy these two values:</p>
                <ul className="space-y-3 text-sm leading-6 text-[var(--rv-text-dim)]">
                  <li><strong className="text-[var(--rv-text)]">Client ID</strong> — a short number, e.g. <code className="rounded-md bg-white/5 px-2 py-1 text-[var(--rv-text)]">12345</code></li>
                  <li><strong className="text-[var(--rv-text)]">Client Secret</strong> — a long alphanumeric string. Click <em>show</em> next to it to reveal it, then copy it.</li>
                </ul>
                <div className="rounded-[1.35rem] border border-amber-400/15 bg-amber-400/8 px-4 py-3 text-sm leading-6 text-[var(--rv-text-dim)]">
                  <strong className="text-[var(--rv-text)]">Do not</strong> copy the Access Token or Refresh Token — those are different fields and are not needed here.
                </div>
              </InstructionStep>

              <InstructionStep index="04" title="Paste them below and click Save">
                <p>RunViz will use these credentials to securely connect to Strava on your behalf.</p>
              </InstructionStep>
            </div>
          </div>
        </section>

        <aside className="rv-panel rv-panel-accent flex flex-col gap-6 px-6 py-8 sm:px-8 lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:self-start lg:overflow-auto">
          <div className="space-y-2">
            <p className="rv-kicker">Your Strava app</p>
            <h2 className="rv-metric text-4xl sm:text-5xl">Save your credentials</h2>
            <p className="text-sm leading-6 text-[var(--rv-text-dim)]">
              RunViz uses only your Client ID and Client Secret for this account. The setup stays tied to {accountLabel}.
            </p>
          </div>

          {needsStravaConnect ? (
            <>
              <div className="space-y-4">
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">
                  Client ID
                  <input
                    value={stravaClientIdInput}
                    onChange={(e) => setStravaClientIdInput(e.target.value)}
                    placeholder="123456"
                    className="rv-field px-4 py-3 text-sm normal-case tracking-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">
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
                    if (!stravaClientIdInput.trim() || !stravaClientSecretInput.trim()) {
                      setStravaSetupStatus('Enter both your Strava Client ID and Client Secret.');
                      return;
                    }
                    setStravaSetupSaving(true);
                    setStravaSetupStatus(null);
                    try {
                      await authApi.saveStravaKey(stravaClientIdInput.trim(), stravaClientSecretInput.trim());
                      const status = await authApi.getStravaKeyStatus();
                      setStravaKeyConfigured(status.configured);
                      setStravaKeyUpdatedAt(status.updatedAt ?? null);
                      setStravaClientIdInput(status.clientId ?? stravaClientIdInput.trim());
                      setStravaClientSecretInput('');
                      setStravaSetupStatus('Strava app saved. You can connect your account now.');
                    } catch (error) {
                      console.error('Failed to save Strava app:', error);
                      setStravaSetupStatus(error instanceof Error ? error.message : 'Unable to save your Strava app.');
                    } finally {
                      setStravaSetupSaving(false);
                    }
                  }}
                  disabled={stravaSetupSaving || stravaSetupLoading}
                  className="rv-button-secondary px-6 py-3 text-xs uppercase tracking-[0.24em] disabled:cursor-wait"
                >
                  {stravaSetupSaving ? 'Saving...' : 'Save Strava app'}
                </button>
                <div className="text-xs leading-5 text-[var(--rv-text-dim)]">
                  {stravaSetupLoading
                    ? 'Loading your saved Strava app...'
                    : stravaKeyConfigured
                      ? `Saved for this account${stravaKeyUpdatedAt ? ` on ${new Date(stravaKeyUpdatedAt * 1000).toLocaleDateString()}` : ''}.`
                      : 'No Strava app saved for this account yet.'}
                </div>
              </div>

              {stravaSetupStatus && (
                <p className="text-sm leading-6 text-[var(--rv-text-dim)]">
                  {stravaSetupStatus}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={connectStrava}
                  disabled={!stravaKeyConfigured || stravaSetupLoading || stravaSetupSaving}
                  className="rv-button-primary px-6 py-4 text-sm disabled:cursor-not-allowed"
                >
                  Connect Strava
                </button>
                <button
                  onClick={logout}
                  className="rv-button-secondary px-6 py-4 text-sm"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-5 py-5 text-sm leading-6 text-[var(--rv-text-dim)]">
              <p className="text-[var(--rv-text)]">Strava is already connected for this account.</p>
              <p className="mt-2">You can return to the dashboard or reconnect if you want to change accounts.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/"
                  className="rv-button-primary inline-flex items-center justify-center px-6 py-4 text-sm"
                >
                  Go to dashboard
                </Link>
                <button
                  onClick={connectStrava}
                  className="rv-button-secondary px-6 py-4 text-sm"
                >
                  Reconnect Strava
                </button>
              </div>
            </div>
          )}

          <div className="rounded-[1.5rem] border border-[var(--rv-green)]/20 bg-[var(--rv-green)]/8 px-5 py-5 text-sm leading-6 text-[var(--rv-text-dim)]">
            <p className="text-[var(--rv-text)]">🔒 Your secret is safe.</p>
            <p className="mt-2">
              The Client Secret is encrypted before being stored. It is never visible to RunViz staff and is only used to fetch your Strava data.
            </p>
          </div>

          <div className="space-y-3 text-xs uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">
            <p>Need help?</p>
            <p>Keep the Strava app tab open while you copy the values back here.</p>
          </div>
        </aside>
      </div>

      <div className="mt-6 mx-auto max-w-[1600px] px-1 text-xs uppercase tracking-[0.24em] text-[var(--rv-text-faint)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4">
          <span>RunViz setup</span>
          <span>Secure Strava connection flow</span>
        </div>
      </div>

      {!needsStravaConnect && (
        <div className="mt-4 mx-auto max-w-[1600px] px-1">
          <div className="rounded-[1.5rem] border border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/8 px-5 py-4 text-sm leading-6 text-[var(--rv-text-dim)]">
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
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rv-panel overflow-hidden px-5 py-5 sm:px-6">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--rv-yellow)]/25 bg-[var(--rv-yellow)]/10 text-[10px] font-extrabold tracking-[0.2em] text-[var(--rv-yellow)]">
          {index}
        </span>
        <div className="min-w-0 space-y-3">
          <h3 className="text-xl font-bold tracking-tight text-[var(--rv-text)]">{title}</h3>
          <div className="space-y-3 text-sm leading-7 text-[var(--rv-text-dim)]">{children}</div>
        </div>
      </div>
    </article>
  );
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`${compact ? 'text-3xl' : 'text-5xl sm:text-6xl'} font-bold tracking-[-0.08em] text-[var(--rv-text)]`}>
        RUN<span className="text-[var(--rv-yellow)]">VIZ</span>
      </span>
      <span className="rounded-full border border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--rv-yellow)]">
        {compact ? 'Running Lab' : 'Running Training Lab'}
      </span>
    </div>
  );
}
