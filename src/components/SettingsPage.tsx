import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ChevronRight,
  LogOut,
  MoonStar,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { ThemeToggle } from "@/components/ThemeToggle"
import { AppShell } from "@/components/layout/app-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import { auth as authApi } from "@/services/api"

export function SettingsPage() {
  const {
    athlete,
    user,
    isAuthenticated,
    needsStravaConnect,
    loading,
    login,
    connectStrava,
    logout,
  } = useAuth()
  const { preference, resolved } = useTheme()
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [keyUpdatedAt, setKeyUpdatedAt] = useState<number | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)
  const [keySaving, setKeySaving] = useState(false)
  const [keyStatus, setKeyStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    async function loadStravaKeys() {
      setKeyLoading(true)
      setKeyStatus(null)

      try {
        const status = await authApi.getStravaKeyStatus()
        if (cancelled) return
        setKeyConfigured(status.configured)
        setClientId(status.clientId ?? "")
        setClientSecret("")
        setKeyUpdatedAt(status.updatedAt ?? null)
      } catch {
        if (cancelled) return
        setKeyStatus("Unable to load Strava credentials.")
      } finally {
        if (!cancelled) {
          setKeyLoading(false)
        }
      }
    }

    void loadStravaKeys()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  async function handleSaveAndConnect() {
    const trimmedId = clientId.trim()
    const trimmedSecret = clientSecret.trim()

    if (!trimmedId || !trimmedSecret) {
      setKeyStatus("Enter both your Client ID and Client Secret.")
      return
    }

    try {
      setKeySaving(true)
      setKeyStatus(null)
      await authApi.saveStravaKey(trimmedId, trimmedSecret)
      await connectStrava()
    } catch (error) {
      setKeyStatus(
        error instanceof Error ? error.message : "Failed to save credentials."
      )
      setKeySaving(false)
    }
  }

  const athleteLabel = athlete
    ? `${athlete.firstname} ${athlete.lastname}`.trim()
    : user?.name ?? "RunViz"

  const statusText = loading
    ? "Loading account"
    : isAuthenticated
      ? "Signed in"
      : "Browsing without an account"

  const themeLabel =
    preference === "system"
      ? `System (${resolved})`
      : preference === "dark"
        ? "Dark"
        : "Light"

  return (
    <AppShell
      eyebrow="Settings"
      title="Account and workspace settings"
      subtitle="Manage appearance, account access, and service connections from one dedicated page."
      athleteName={athleteLabel}
      athleteImage={athlete?.profile ?? user?.image ?? null}
      statusText={statusText}
      onLogout={isAuthenticated ? logout : undefined}
    >
      <div className="mx-auto max-w-[1120px] space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Card className="border border-border/70 bg-background/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="size-4 text-muted-foreground" />
                Account
              </CardTitle>
              <CardDescription>
                Identity and session controls for this RunViz workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar size="lg">
                  {athlete?.profile || user?.image ? (
                    <AvatarImage
                      src={athlete?.profile ?? user?.image ?? undefined}
                      alt={athleteLabel}
                    />
                  ) : null}
                  <AvatarFallback>
                    {athleteLabel.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-foreground">
                    {athleteLabel}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user?.email ?? "No email available"}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">Session</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {statusText}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">Workspace</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Shared shell active across dashboard, planning, form, and settings.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    Logging out clears the local activity cache on this device.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={logout}
                    className="shrink-0 gap-2"
                  >
                    <LogOut className="size-4" />
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">
                    Sign in to save your setup and sync your Strava data.
                  </span>
                  <Button size="sm" onClick={login} className="shrink-0 gap-2">
                    <Sparkles className="size-4" />
                    Sign in
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>

          <div className="grid gap-4">
            <Card className="border border-border/70 bg-background/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="size-4 text-muted-foreground" />
                  Appearance
                </CardTitle>
                <CardDescription>
                  Choose how RunViz renders across light, dark, and system themes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">Current theme</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {themeLabel}
                  </p>
                </div>
                <div className="max-w-[220px]">
                  <ThemeToggle />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-background/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Connections
                </CardTitle>
                <CardDescription>
                  Keep your training data source connected and ready to sync.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">Strava</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {!isAuthenticated
                      ? "Sign in first to link your Strava account."
                      : needsStravaConnect
                        ? "Connection required before your activities can sync."
                        : "Connected and ready to sync."}
                  </p>
                  {isAuthenticated && keyConfigured && keyUpdatedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      App credentials last saved{" "}
                      {new Date(keyUpdatedAt * 1000).toLocaleDateString()}.
                    </p>
                  ) : null}
                </div>

                {isAuthenticated ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      {keyLoading
                        ? "Loading..."
                        : keyConfigured
                          ? "Update Strava app credentials"
                          : "Enter Strava app credentials"}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="settings-client-id" className="text-sm">
                        Client ID
                      </Label>
                      <Input
                        id="settings-client-id"
                        value={clientId}
                        onChange={(event) => setClientId(event.target.value)}
                        placeholder="123456"
                        disabled={keyLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="settings-client-secret"
                        className="text-sm"
                      >
                        Client Secret
                      </Label>
                      <Input
                        id="settings-client-secret"
                        type="password"
                        value={clientSecret}
                        onChange={(event) => setClientSecret(event.target.value)}
                        placeholder={
                          keyConfigured
                            ? "Enter new secret to rotate"
                            : "Paste your Client Secret"
                        }
                        disabled={keyLoading}
                      />
                    </div>
                    {keyStatus ? (
                      <p className="text-sm text-muted-foreground">
                        {keyStatus}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-3">
                <Link
                  to="/?workspace=tools"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Open tools workspace
                  <ChevronRight className="size-4" />
                </Link>
                {isAuthenticated ? (
                  <Button
                    size="sm"
                    onClick={handleSaveAndConnect}
                    disabled={
                      keySaving || keyLoading || !clientId.trim() || !clientSecret.trim()
                    }
                    className="shrink-0 gap-2"
                  >
                    <MoonStar className="size-4" />
                    {keySaving
                      ? "Saving..."
                      : keyConfigured
                        ? "Save and reconnect Strava"
                        : "Save and connect Strava"}
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
      <div className="pt-2 text-center">
        <Link
          to="/privacy"
          className="rv-mini-label inline-flex items-center gap-1.5 transition hover:text-foreground"
        >
          <ShieldCheck className="size-3" />
          Privacy Policy
        </Link>
      </div>
    </AppShell>
  )
}
