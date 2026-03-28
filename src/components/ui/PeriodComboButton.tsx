import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MONTHS } from "@/lib/dashboard"
import type { ViewPeriod } from "@/lib/dashboard"

interface PeriodComboButtonProps {
  viewPeriod: ViewPeriod
  availableYears: number[]
  onViewPeriodChange: (next: ViewPeriod) => void
}

const NOW_YEAR = new Date().getFullYear()
const NOW_MONTH = new Date().getMonth()

export function PeriodComboButton({
  viewPeriod,
  availableYears,
  onViewPeriodChange,
}: PeriodComboButtonProps) {
  if (viewPeriod.mode === "all") return null

  const label =
    viewPeriod.mode === "year"
      ? String(viewPeriod.year)
      : `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="default"
          className="gap-1.5 font-medium"
          aria-label="Select period"
        >
          {label}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto min-w-[220px]" align="end">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Year</span>
          <ToggleGroup
            type="single"
            value={String(viewPeriod.year)}
            onValueChange={(value) => {
              if (!value) return
              onViewPeriodChange({ ...viewPeriod, year: parseInt(value, 10) })
            }}
            variant="outline"
            spacing={1}
          >
            {availableYears.map((year) => (
              <ToggleGroupItem
                key={year}
                value={String(year)}
                className="px-2.5 text-xs"
              >
                {year}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {viewPeriod.mode === "month" && (
          <>
            <div className="mb-2 h-px bg-border" />
            <div className="grid grid-cols-4 gap-1">
              {MONTHS.map((month, index) => {
                const isFuture = viewPeriod.year === NOW_YEAR && index > NOW_MONTH
                const isActive = viewPeriod.month === index

                return (
                  <button
                    key={month}
                    type="button"
                    disabled={isFuture}
                    onClick={() =>
                      onViewPeriodChange({ ...viewPeriod, month: index })
                    }
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-foreground text-background"
                        : "hover:bg-muted hover:text-foreground",
                      isFuture && "cursor-default opacity-30"
                    )}
                  >
                    {month}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
