import { lazy } from 'react'
import type { ComponentType } from 'react'

// React.lazy is typed in terms of ComponentType<any>, so we keep the escape hatch
// isolated to this adapter instead of weakening types across the call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModuleLoader<T extends ComponentType<any>> = () => Promise<{ default: T }>

function isRecoverableChunkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('chunkloaderror') ||
    message.includes('loading chunk')
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  loader: ModuleLoader<T>,
  retryKey: string,
) {
  return lazy(async () => {
    const storageKey = `runviz_lazy_retry:${retryKey}`

    try {
      const module = await loader()

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(storageKey)
      }

      return module
    } catch (error) {
      if (
        typeof window !== 'undefined' &&
        isRecoverableChunkError(error) &&
        !window.sessionStorage.getItem(storageKey)
      ) {
        window.sessionStorage.setItem(storageKey, '1')
        window.location.reload()
        return await new Promise<never>(() => {})
      }

      throw error
    }
  })
}
