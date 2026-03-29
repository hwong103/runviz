import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  ChartNoAxesCombined,
  LogOut,
  Settings2,
  Sparkles,
} from "lucide-react"

import { ThemeToggle } from "@/components/ThemeToggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  DASHBOARD_WORKSPACE_META,
  buildDashboardHref,
  type DashboardWorkspace,
} from "@/lib/dashboard"

interface AppShellProps {
  eyebrow: string
  title: string
  subtitle?: string
  currentWorkspace?: DashboardWorkspace
  onWorkspaceSelect?: (workspace: DashboardWorkspace) => void
  athleteName?: string
  athleteImage?: string | null
  statusText?: string
  onLogout?: () => void | Promise<void>
  headerActions?: ReactNode
  children: ReactNode
}

function AppShellMenuButton({
  label,
  detail,
  href,
  icon: Icon,
  active,
  onSelect,
}: {
  label: string
  detail: string
  href: string
  icon: typeof Sparkles
  active: boolean
  onSelect?: () => void
}) {
  const { setOpenMobile } = useSidebar()

  const handleSelect = () => {
    onSelect?.()
    setOpenMobile(false)
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        size="lg"
        className="items-start rounded-xl px-3 py-3"
      >
        <Link to={href} onClick={handleSelect}>
          <Icon className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">{label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {detail}
            </span>
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppShell({
  eyebrow,
  title,
  subtitle,
  currentWorkspace,
  onWorkspaceSelect,
  athleteName,
  athleteImage,
  statusText,
  onLogout,
  headerActions,
  children,
}: AppShellProps) {
  const location = useLocation()

  return (
    <SidebarProvider defaultOpen>
      <Sidebar className="border-r border-sidebar-border/70" variant="inset">
        <SidebarHeader className="gap-4 px-3 py-4">
          <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/35 px-3 py-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <ChartNoAxesCombined className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                RunViz
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Performance dashboard
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pb-3">
          <SidebarGroup>
            <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(
                  Object.entries(DASHBOARD_WORKSPACE_META) as Array<
                    [DashboardWorkspace, (typeof DASHBOARD_WORKSPACE_META)[DashboardWorkspace]]
                  >
                ).map(([workspace, meta]) => (
                  <AppShellMenuButton
                    key={workspace}
                    label={meta.label}
                    detail={meta.detail}
                    href={buildDashboardHref(workspace)}
                    icon={meta.icon}
                    active={location.pathname === "/" && currentWorkspace === workspace}
                    onSelect={
                      onWorkspaceSelect
                        ? () => onWorkspaceSelect(workspace)
                        : undefined
                    }
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-3 border-t border-sidebar-border/70 px-3 py-3">
          <div className="rounded-xl border border-sidebar-border/70 bg-sidebar-accent/20 p-3">
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                {athleteImage ? (
                  <AvatarImage src={athleteImage} alt={athleteName ?? "Athlete"} />
                ) : null}
                <AvatarFallback>
                  {athleteName?.slice(0, 1).toUpperCase() ?? "R"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {athleteName ?? "RunViz"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {statusText ?? "Performance workspace"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <ThemeToggle compact />
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-11 rounded-xl"
              aria-label="Settings"
            >
              <Link to="/settings">
                <Settings2 />
              </Link>
            </Button>
            {onLogout ? (
              <Button
                variant="outline"
                size="icon"
                onClick={onLogout}
                className="size-11 rounded-xl"
                aria-label="Logout"
              >
                <LogOut />
              </Button>
            ) : null}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-svh bg-background">
        <div className="flex min-h-svh flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/92 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex items-start gap-3">
                <div className="md:hidden">
                  <SidebarTrigger className="size-11 rounded-xl border border-border/70" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    {eyebrow}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                      {title}
                    </h1>
                  </div>
                  {subtitle ? (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {subtitle}
                    </p>
                  ) : null}
                </div>
              </div>

              {headerActions ? (
                <div className={cn("min-w-0 w-full")}>
                  {headerActions}
                </div>
              ) : null}
            </div>
          </header>

          <div className="flex-1 px-4 py-4 sm:px-6 lg:px-8">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
