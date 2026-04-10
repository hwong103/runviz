import type { LucideIcon } from "lucide-react"
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Map,
  Rocket,
  ScanSearch,
  Wrench,
} from "lucide-react"

export interface ViewPeriod {
  mode: "all" | "year" | "month" | "30d" | "90d" | "365d"
  year: number
  month: number | null
}

export type DashboardFilterStyle = "relative" | "calendar"

export type DashboardWorkspace =
  | "overview"
  | "training"
  | "race"
  | "logbook"
  | "tools"

export type TrainingWorkspace = "health" | "fitness" | "volume" | "mechanics"
export type ToolPage = "route-planner" | "form-analysis"

export interface DashboardWorkspaceMeta {
  label: string
  detail: string
  kicker: string
  title: string
  description: string
  icon: LucideIcon
}

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

export const DASHBOARD_WORKSPACE_META: Record<
  DashboardWorkspace,
  DashboardWorkspaceMeta
> = {
  overview: {
    label: "Overview",
    detail: "KPI view",
    kicker: "Overview",
    title: "Current training snapshot",
    description:
      "A compact command center for the current block, with the primary chart up front and deeper analysis one click away.",
    icon: LayoutDashboard,
  },
  training: {
    label: "Training",
    detail: "Load and trends",
    kicker: "Training",
    title: "Load and trend analysis",
    description:
      "Review block health first, then move into the chart or mechanics view you need.",
    icon: BarChart3,
  },
  race: {
    label: "Race",
    detail: "VDOT and pacing",
    kicker: "Race",
    title: "Race prediction and pacing",
    description:
      "VDOT-anchored race time predictions and training pace zones derived from your strongest recent effort.",
    icon: Rocket,
  },
  logbook: {
    label: "Logbook",
    detail: "Runs and shoes",
    kicker: "Logbook",
    title: "Runs, shoes, and calendar",
    description:
      "Filter the training log, inspect recent runs, and jump through the calendar without leaving the list.",
    icon: Activity,
  },
  tools: {
    label: "Tools",
    detail: "Plan and review",
    kicker: "Tools",
    title: "Planning and form review",
    description:
      "Non-daily tools live here so the dashboard stays focused on training decisions.",
    icon: Wrench,
  },
}

export const TOOL_PAGE_META: Record<
  ToolPage,
  {
    label: string
    detail: string
    title: string
    description: string
    href: string
    icon: LucideIcon
  }
> = {
  "route-planner": {
    label: "Route Planner",
    detail: "Plan your next run",
    title: "Plan a route for your next run",
    description:
      "Choose a start point, set the distance, and export the route without leaving the app shell.",
    href: "/plan-route",
    icon: Map,
  },
  "form-analysis": {
    label: "Form Lab",
    detail: "Review running form",
    title: "Review your running form",
    description:
      "Upload a clip, run the analysis, and keep technical feedback in a dedicated review flow.",
    href: "/form-analysis",
    icon: ScanSearch,
  },
}

export function buildDashboardHref(workspace: DashboardWorkspace) {
  return `/?workspace=${workspace}`
}

export function isDashboardWorkspace(
  value: string | null
): value is DashboardWorkspace {
  return value === "overview" ||
    value === "training" ||
    value === "race" ||
    value === "logbook" ||
    value === "tools"
}

export function formatLastSync(lastSync: Date | null, currentTime = Date.now()) {
  if (!lastSync) return "Never synced"

  const diffMs = currentTime - lastSync.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "Just synced"
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`

  return `${Math.floor(diffHrs / 24)}d ago`
}

export function describeViewPeriod(viewPeriod: ViewPeriod) {
  if (viewPeriod.mode === "all") return "All time"
  if (viewPeriod.mode === "year") return String(viewPeriod.year)
  if (viewPeriod.mode === "month") return `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`
  if (viewPeriod.mode === "30d") return "Last 30 days"
  if (viewPeriod.mode === "90d") return "Last 90 days"
  if (viewPeriod.mode === "365d") return "Last 365 days"
  return `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`
}
