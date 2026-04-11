import { useEffect, useState, type ReactNode } from "react"

import { AppShell } from "@/components/layout/app-shell"
import { useActivities } from "@/hooks/useActivities"
import { useAuth } from "@/hooks/useAuth"
import { formatLastSync } from "@/lib/dashboard"

interface ToolRouteFrameProps {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
  headerActions?: ReactNode
}

export function ToolRouteFrame({
  eyebrow,
  title,
  subtitle,
  children,
  headerActions,
}: ToolRouteFrameProps) {
  const { athlete, isAuthenticated, needsStravaConnect, loading, logout } = useAuth()
  const { syncing, sync, lastSync } = useActivities()
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const athleteLabel = athlete
    ? `${athlete.firstname} ${athlete.lastname}`.trim()
    : undefined

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <AppShell
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      athleteName={athleteLabel}
      athleteImage={athlete?.profile ?? null}
      statusText={
        loading
          ? "Loading account"
          : syncing
            ? "Syncing now"
            : isAuthenticated
              ? formatLastSync(lastSync, currentTime)
              : "Browsing without an account"
      }
      syncing={syncing}
      onSync={isAuthenticated && !needsStravaConnect ? () => sync({ forceFull: true }) : undefined}
      onLogout={isAuthenticated ? logout : undefined}
      headerActions={headerActions}
    >
      {children}
    </AppShell>
  )
}
