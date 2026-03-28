import { Check, Monitor, Moon, SunMedium } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

const SELECTED_LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
}

export function ThemeToggle() {
  const { preference, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full justify-between rounded-xl px-3"
        >
          <span className="inline-flex items-center gap-2">
            <SunMedium className="size-4" />
            Theme
          </span>
          <span className="text-xs text-muted-foreground">
            {SELECTED_LABEL[preference]}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuGroup>
          {OPTIONS.map(({ value, icon: Icon, title }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <Icon className="size-4" />
                {title}
              </span>
              {preference === value ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
