import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

function readOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }

  return navigator.onLine
}

export function OfflineNotice() {
  const [isOnline, setIsOnline] = useState(() => readOnlineStatus())

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex max-w-md items-center gap-3 rounded-full border border-white/10 bg-zinc-950/92 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur">
        <WifiOff className="size-4 shrink-0 text-amber-300" />
        <p>
          You&apos;re offline. Cached screens can still open, but live activity data may be unavailable.
        </p>
      </div>
    </div>
  )
}
