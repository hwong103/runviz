import type { ReactNode } from "react"

import { AppShell } from "@/components/layout/app-shell"
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

  const athleteLabel = athlete
    ? `${athlete.firstname} ${athlete.lastname}`.trim()
    : undefined

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
          : isAuthenticated
            ? "Signed in"
            : "Browsing without an account"
      }
      onLogout={isAuthenticated ? logout : undefined}
      headerActions={headerActions}
    >
      {children}
    </AppShell>
  )
}
