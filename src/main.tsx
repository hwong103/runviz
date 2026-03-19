import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Callback } from './components/Callback.tsx'
import { MagicLinkVerify } from './components/MagicLinkVerify.tsx'
import { SetupRoute } from './components/SetupRoute.tsx'

const RoutePlanner = lazy(() => import('./components/RoutePlanner.tsx'))
const FormAnalysis = lazy(() => import('./components/FormAnalysis.tsx'))
const routerBase = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL.slice(0, -1) || '/'
  : import.meta.env.BASE_URL

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <Suspense fallback={<div className="min-h-screen bg-[#0a0c10]" />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/api/auth/magic-link/verify" element={<MagicLinkVerify />} />
          <Route path="/setup" element={<SetupRoute />} />
          <Route path="/plan-route" element={<RoutePlanner />} />
          <Route path="/form-analysis" element={<FormAnalysis />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
