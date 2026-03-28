import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"
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
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  if (viewPeriod.mode === "all") return null

  const label =
    viewPeriod.mode === "year"
      ? String(viewPeriod.year)
      : `${MONTHS[viewPeriod.month ?? 0]} ${viewPeriod.year}`

  const trigger = (
    <Button
      variant="outline"
      size="default"
      className="gap-1.5 font-medium"
      aria-label="Select period"
    >
      {label}
      <ChevronDown className="size-3.5 opacity-60" />
    </Button>
  )

  const handleYearChange = (value: string) => {
    if (!value) return
    onViewPeriodChange({ ...viewPeriod, year: parseInt(value, 10) })
    if (viewPeriod.mode === "year") {
      setOpen(false)
    }
  }

  const handleMonthChange = (month: number) => {
    onViewPeriodChange({ ...viewPeriod, month })
    setOpen(false)
  }

  const content = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Year</span>
        {isMobile ? (
          <div className="grid flex-1 grid-cols-3 gap-1.5 sm:grid-cols-4">
            {availableYears.map((year) => {
              const isActive = viewPeriod.year === year

              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleYearChange(String(year))}
                  className={cn(
                    "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-muted hover:text-foreground"
                  )}
                >
                  {year}
                </button>
              )
            })}
          </div>
        ) : (
          <ToggleGroup
            type="single"
            value={String(viewPeriod.year)}
            onValueChange={handleYearChange}
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
        )}
      </div>

      {viewPeriod.mode === "month" && (
        <>
          <div className="mb-2 h-px bg-border" />
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((month, index) => {
              const isFuture = viewPeriod.year === NOW_YEAR && index > NOW_MONTH
              const isActive = viewPeriod.month === index

              return (
                <button
                  key={month}
                  type="button"
                  disabled={isFuture}
                  onClick={() => handleMonthChange(index)}
                  className={cn(
                    "rounded-md px-2 py-2 text-xs font-medium transition-colors",
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
    </>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-border px-4 pb-5 pt-0"
        >
          <SheetHeader className="px-0 pt-5">
            <SheetTitle>Select period</SheetTitle>
            <SheetDescription>
              Choose the year and, when needed, the month for this view.
            </SheetDescription>
          </SheetHeader>
          <div className="px-0">{content}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>

      <PopoverContent className="w-auto min-w-[220px]" align="end">
        {content}
      </PopoverContent>
    </Popover>
  )
}
