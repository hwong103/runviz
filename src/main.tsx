import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Callback } from './components/Callback.tsx'

const RoutePlanner = lazy(() => import('./components/RoutePlanner.tsx'))
const FormAnalysis = lazy(() => import('./components/FormAnalysis.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/runviz">
      <Suspense fallback={<div className="min-h-screen bg-[#0a0c10]" />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/plan-route" element={<RoutePlanner />} />
          <Route path="/form-analysis" element={<FormAnalysis />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
