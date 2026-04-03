import type { ReactNode } from "react"

import { AppShell } from "@/components/layout/app-shell"
import { useActivities } from "@/hooks/useActivities"
import { useAuth } from "@/hooks/useAuth"

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
  const { athlete, isAuthenticated, loading, logout } = useAuth()
  const { syncing, sync, lastSync } = useActivities(isAuthenticated)

  const athleteLabel = athlete
    ? `${athlete.firstname} ${athlete.lastname}`.trim()
    : undefined

  const formatLastSync = (date: Date | null) => {
    if (!date) return "Never synced"
    const diff = Date.now() - date.getTime()
    if (diff < 60_000) return "Just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return date.toLocaleDateString()
  }

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
              ? formatLastSync(lastSync)
              : "Browsing without an account"
      }
      syncing={syncing}
      onSync={isAuthenticated ? () => sync({ forceFull: true }) : undefined}
      onLogout={isAuthenticated ? logout : undefined}
      headerActions={headerActions}
    >
      {children}
    </AppShell>
  )
}
