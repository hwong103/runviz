import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { GoogleAuthCallback } from './components/GoogleAuthCallback.tsx'
import { Callback } from './components/Callback.tsx'
import { GoogleSignInComplete } from './components/GoogleSignInComplete.tsx'
import { MagicLinkVerify } from './components/MagicLinkVerify.tsx'
import { SetupRoute } from './components/SetupRoute.tsx'
import { StravaAuthStart } from './components/StravaAuthStart.tsx'
import { ThemeToggle } from './components/ThemeToggle.tsx'

const RoutePlanner = lazy(() => import('./components/RoutePlanner.tsx'))
const FormAnalysis = lazy(() => import('./components/FormAnalysis.tsx'))
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
  } catch {
    const resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', resolved)
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <div className="fixed right-4 top-4 z-[200] sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <Suspense fallback={<div className="min-h-screen bg-[#0a0c10]" />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth/strava" element={<StravaAuthStart />} />
          <Route path="/api/auth/strava" element={<StravaAuthStart />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/api/auth/callback/google" element={<GoogleAuthCallback />} />
          <Route path="/signin/complete" element={<GoogleSignInComplete />} />
          <Route path="/api/auth/magic-link/verify" element={<MagicLinkVerify />} />
          <Route path="/setup" element={<SetupRoute />} />
          <Route path="/plan-route" element={<RoutePlanner />} />
          <Route path="/form-analysis" element={<FormAnalysis />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
