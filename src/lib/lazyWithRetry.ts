import { lazy } from 'react'
import type { ComponentType } from 'react'

type ModuleLoader<T extends ComponentType<object>> = () => Promise<{ default: T }>

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

export function lazyWithRetry<T extends ComponentType<object>>(
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
        return new Promise<never>(() => {})
      }

      throw error
    }
  })
}
