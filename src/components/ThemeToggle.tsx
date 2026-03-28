import { Monitor, Moon, SunMedium } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTheme, type ThemePreference } from "@/hooks/useTheme"

const OPTIONS: Array<{
  value: ThemePreference
  icon: typeof SunMedium
  title: string
}> = [
  { value: "light", icon: SunMedium, title: "Light mode" },
  { value: "dark", icon: Moon, title: "Dark mode" },
  { value: "system", icon: Monitor, title: "System preference" },
]

export function ThemeToggle({
  compact = false,
}: {
  compact?: boolean
}) {
  const { preference, setTheme } = useTheme()

  if (compact) {
    const activeIndex = OPTIONS.findIndex(({ value }) => value === preference)
    const nextTheme = OPTIONS[(activeIndex + 1) % OPTIONS.length]
    const currentTheme = OPTIONS[activeIndex] ?? OPTIONS[0]
    const Icon = currentTheme.icon
    const title = `${currentTheme.title}. Switch to ${nextTheme.title.toLowerCase()}.`

    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme.value)}
        aria-label={title}
        title={title}
        className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Icon className="size-4" />
      </button>
    )
  }

  return (
    <div
      className="inline-flex h-11 w-full items-center gap-1 rounded-xl border border-border bg-background p-1"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, icon: Icon, title }) => {
        const selected = preference === value

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={selected}
            aria-label={title}
            title={title}
            className={cn(
              "inline-flex h-full min-w-11 flex-1 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected && "bg-foreground text-background shadow-sm hover:text-background"
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
