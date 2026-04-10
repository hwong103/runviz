import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

const LAST_UPDATED = new Date().toLocaleDateString('en-AU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function PrivacyPage() {
  return (
    <main className="rv-grid-lines min-h-screen px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-blue)_14%,transparent)] text-[var(--rv-blue)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <Link
              to="/"
              className="rv-mini-label mb-1 block transition hover:text-foreground"
            >
              ← Back to RunViz
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Privacy Policy
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Last updated: {LAST_UPDATED}
            </p>
          </div>
        </div>

        <div className="rv-panel rv-panel-accent space-y-8 px-6 py-8 sm:px-8 sm:py-10">
          <Section title="What RunViz is">
            <p>
              RunViz is a personal running analytics dashboard that connects to your Strava account to
              display training metrics, fitness trends, and coaching insights. It is operated as an
              independent project and is not affiliated with Strava.
            </p>
          </Section>

          <Section title="Data we collect">
            <p>RunViz collects and processes the following categories of data:</p>
            <ul>
              <li>
                <strong>Account identity.</strong> Your email address and display name, provided when
                you sign in via Google or magic link. This is stored in our database to identify your
                workspace.
              </li>
              <li>
                <strong>Strava API credentials.</strong> If you use the bring-your-own-Strava-app
                feature, your Strava Client ID and Client Secret are stored encrypted in our database.
                Your Client Secret is encrypted with AES-256-GCM before storage and is never returned
                to the client in plaintext.
              </li>
              <li>
                <strong>Strava OAuth tokens.</strong> After you authorise RunViz via Strava, your
                access token and refresh token are stored in an encrypted key-value store for the
                duration of your session (up to 30 days). These tokens are used solely to retrieve
                your activity data from the Strava API.
              </li>
              <li>
                <strong>Activity data.</strong> Running activities retrieved from the Strava API are
                cached in your browser&apos;s IndexedDB for performance. This data is not stored
                server-side beyond what Strava&apos;s own API returns on demand.
              </li>
              <li>
                <strong>AI-generated insights.</strong> When you request training insights, anonymised
                aggregated metrics (e.g. weekly mileage, load ratio) are sent to a Cloudflare Workers
                AI model to generate coaching observations. These insights are cached server-side
                against your account ID. No identifiable information is included in the AI prompt.
              </li>
              <li>
                <strong>Route planning.</strong> When you generate a route, your start coordinates and
                target distance are forwarded to OpenRouteService. No persistent record of these
                requests is kept by RunViz.
              </li>
              <li>
                <strong>Form analysis video.</strong> If you use the Form Lab feature, video you
                upload is processed ephemerally via MediaPipe in your browser and is never uploaded
                to or stored on RunViz servers.
              </li>
            </ul>
          </Section>

          <Section title="Data we do not collect">
            <ul>
              <li>We do not run advertising or sell data to third parties.</li>
              <li>We do not use tracking pixels, third-party analytics, or ad networks.</li>
              <li>
                We do not store GPS track data, heart rate data, or media from your Strava
                activities on our servers. This data is fetched on demand and displayed in your browser.
              </li>
            </ul>
          </Section>

          <Section title="Third-party services">
            <p>RunViz relies on the following external services:</p>
            <ul>
              <li>
                <strong>Strava.</strong> Activity and athlete data is retrieved via the{' '}
                <a
                  href="https://developers.strava.com"
                  className="text-[var(--rv-blue)] underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Strava API
                </a>
                . Strava&apos;s own privacy policy applies to data held by Strava.
              </li>
              <li>
                <strong>Google.</strong> Sign-in via Google OAuth uses Google&apos;s identity platform.
                Google&apos;s privacy policy applies to data processed during sign-in.
              </li>
              <li>
                <strong>Cloudflare.</strong> The application is hosted on Cloudflare Workers and Pages.
                Cloudflare may process request metadata in accordance with their data processing policies.
              </li>
              <li>
                <strong>OpenRouteService.</strong> Route generation requests include your start
                coordinates and are subject to OpenRouteService&apos;s terms.
              </li>
              <li>
                <strong>Resend.</strong> Magic link emails are delivered via Resend. Your email address
                is included in the delivery request.
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <ul>
              <li>Session tokens are retained for up to 30 days and automatically expire.</li>
              <li>OAuth state tokens used during the Strava authorisation flow expire after 10 minutes.</li>
              <li>
                AI insight cache entries are retained until the underlying activity data changes or you
                manually clear them.
              </li>
              <li>Account data (email, name) is retained until you delete your account.</li>
              <li>
                Browser-cached activity data is stored in your device&apos;s IndexedDB and can be cleared
                via your browser&apos;s developer tools at any time.
              </li>
            </ul>
          </Section>

          <Section title="Your rights">
            <p>
              You can disconnect RunViz from Strava at any time via your{' '}
              <a
                href="https://www.strava.com/settings/apps"
                className="text-[var(--rv-blue)] underline-offset-2 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Strava app settings
              </a>
              . To request deletion of your RunViz account data, contact the project maintainer via the
              GitHub repository.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              RunViz is an open-source personal project. Questions about this policy can be raised via
              the{' '}
              <a
                href="https://github.com/hwong103/runviz"
                className="text-[var(--rv-blue)] underline-offset-2 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                project repository
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground [&_a]:text-[var(--rv-blue)] [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-4 [&_ul]:marker:text-[var(--rv-border)]">
        {children}
      </div>
    </section>
  );
}
