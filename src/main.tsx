import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { GoogleAuthCallback } from './components/GoogleAuthCallback.tsx'
import { Callback } from './components/Callback.tsx'
import { GoogleSignInComplete } from './components/GoogleSignInComplete.tsx'
import { MagicLinkVerify } from './components/MagicLinkVerify.tsx'
import { ToolRouteFrame } from './components/layout/tool-route-frame.tsx'
import { PrivacyPage } from './components/PrivacyPage.tsx'
import { SettingsPage } from './components/SettingsPage.tsx'
import { SetupRoute } from './components/SetupRoute.tsx'
import { StravaAuthStart } from './components/StravaAuthStart.tsx'
import { Badge } from './components/ui/Badge.tsx'
import { lazyWithRetry } from './lib/lazyWithRetry.ts'

const RoutePlanner = lazyWithRetry(() => import('./components/RoutePlanner.tsx'), 'route-planner')
const FormAnalysis = lazyWithRetry(() => import('./components/FormAnalysis.tsx'), 'form-analysis')
const routerBase = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL.slice(0, -1) || '/'
  : import.meta.env.BASE_URL

;(function () {
  try {
    const stored = window.localStorage.getItem('runviz_theme_v1')
    const pref = stored === 'light' || stored === 'dark' ? stored : 'system'
    const resolved =
      pref === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : pref
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
  } catch {
    const resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <Suspense fallback={<div className="min-h-screen bg-background text-foreground" />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth/strava" element={<StravaAuthStart />} />
          <Route path="/api/auth/strava" element={<StravaAuthStart />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/api/auth/callback/google" element={<GoogleAuthCallback />} />
          <Route path="/signin/complete" element={<GoogleSignInComplete />} />
          <Route path="/api/auth/magic-link/verify" element={<MagicLinkVerify />} />
          <Route path="/setup" element={<SetupRoute />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            path="/plan-route"
            element={
              <ToolRouteFrame
                eyebrow="Route Planner"
                title="Plan a route for your next run"
                subtitle="Choose a start point, set the distance, and export the route from the same RunViz workspace shell."
              >
                <RoutePlanner />
              </ToolRouteFrame>
            }
          />
          <Route
            path="/form-analysis"
            element={
              <ToolRouteFrame
                eyebrow="Form Lab"
                title="Review your running form"
                subtitle="Upload a clip, run the analysis, and keep your video-based coaching workflow inside the shared app shell."
                headerActions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue" size="sm">100% On-device</Badge>
                    <Badge tone="gold" size="sm">Analysis history saved locally</Badge>
                  </div>
                }
              >
                <FormAnalysis />
              </ToolRouteFrame>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
