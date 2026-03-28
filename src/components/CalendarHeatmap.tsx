import { useMemo, useState } from 'react';
import type { Activity } from '../types';
import { isRun } from '../types';
import { format, parseISO } from 'date-fns';

interface CalendarHeatmapProps {
    activities: Activity[];
    year?: number;
    month?: number;
    onSelectDay?: (date: string) => void;
    selectedDate?: string | null;
}

interface YearGridMonthProps {
    mg: {
        monthIndex: number;
        label: string;
        firstDow: number;
        days: Array<{ date: string; distance: number; inRange: boolean }>;
    };
    maxDistance: number;
    selectedDate?: string | null;
    onSelectDay?: (date: string) => void;
    setHoveredDay: (v: { date: string; distance: number; x: number; y: number } | null) => void;
}

function YearGridMonth({ mg, maxDistance, selectedDate, onSelectDay, setHoveredDay }: YearGridMonthProps) {
    const getCellClass = (distance: number, isSelected: boolean): string => {
        const baseCell = 'border border-[var(--rv-border)] transition-transform duration-100 hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
        if (isSelected) return `${baseCell} bg-[var(--rv-blue)] ring-1 ring-[var(--rv-blue)]/40`;
        if (distance === 0) return `${baseCell} bg-[var(--rv-bg-elevated)]`;
        const intensity = maxDistance === 0 ? 0 : Math.min(distance / maxDistance, 1);
        if (intensity < 0.25) return `${baseCell} bg-[var(--rv-green)]/30`;
        if (intensity < 0.5) return `${baseCell} bg-[var(--rv-green)]/45`;
        if (intensity < 0.75) return `${baseCell} bg-[var(--rv-green)]/65`;
        return `${baseCell} bg-[var(--rv-green)]`;
    };

    const leadingEmpties = Array.from({ length: mg.firstDow });

    return (
        <div className="min-w-0">
            <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-text-faint)]">
                {mg.label}
            </p>

            <div className="mb-1.5 grid grid-cols-7 gap-[3px]">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div key={i} className="text-center text-[0.6rem] text-[var(--rv-text-faint)]/75 select-none">
                        {d}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-[3px]">
                {leadingEmpties.map((_, i) => (
                    <div key={`e-${i}`} />
                ))}
                {mg.days.map((day) => {
                    const isSelected = selectedDate === day.date;
                    return (
                        <button
                            key={day.date}
                            type="button"
                            onClick={() => onSelectDay?.(day.date)}
                            onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const TOOLTIP_WIDTH = 140;
                                const clampedX = Math.min(
                                    window.innerWidth - TOOLTIP_WIDTH / 2,
                                    Math.max(TOOLTIP_WIDTH / 2, rect.left + rect.width / 2)
                                );
                                setHoveredDay({ date: day.date, distance: day.distance, x: clampedX, y: rect.top - 10 });
                            }}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`aspect-square w-full rounded-[3px] ${getCellClass(day.distance, isSelected)}`}
                            aria-label={`${format(parseISO(day.date), 'MMMM d, yyyy')}, ${day.distance.toFixed(1)} km`}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export function CalendarHeatmap({
    activities,
    year = new Date().getFullYear(),
    month,
    onSelectDay,
    selectedDate
}: CalendarHeatmapProps) {
    const [hoveredDay, setHoveredDay] = useState<{ date: string; distance: number; x: number; y: number } | null>(null);

    // Check if we're in month-only view
    const isMonthView = month !== undefined;

    const { weeks, monthLabels, maxDistance, monthGrids } = useMemo(() => {
        // Build daily distance map
        const dailyDistances = new Map<string, number>();

        for (const activity of activities) {
            if (!isRun(activity)) continue;
            const date = activity.start_date_local.split('T')[0];
            const existing = dailyDistances.get(date) || 0;
            dailyDistances.set(date, existing + activity.distance / 1000);
        }

        // Find max for color scaling
        let max = 0;
        dailyDistances.forEach((d) => {
            if (d > max) max = d;
        });

        let startDate: Date;
        let endDate: Date;

        if (isMonthView) {
            // Month view: show only the selected month
            startDate = new Date(year, month!, 1);
            endDate = new Date(year, month! + 1, 0); // Last day of month
        } else {
            // Year view: show full year
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31);
        }

        // Start from Sunday of the week containing the start date
        const firstSunday = new Date(startDate);
        firstSunday.setDate(startDate.getDate() - startDate.getDay());

        const weeks: Array<Array<{ date: string; distance: number; dayOfWeek: number; currentMonth: boolean; inRange: boolean } | null>> = [];
        const months: Array<{ label: string; weekIndex: number }> = [];
        let curMonth = -1;

        const current = new Date(firstSunday);
        let weekIndex = 0;

        // For month view, we only need 5-6 weeks max
        const maxWeeks = isMonthView ? 6 : 53;

        while (weeks.length < maxWeeks) {
            const week: Array<{ date: string; distance: number; dayOfWeek: number; currentMonth: boolean; inRange: boolean } | null> = [];

            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const dateStr = format(current, 'yyyy-MM-dd');
                const inYear = current.getFullYear() === year;
                const inMonth = isMonthView ? current.getMonth() === month : true;
                const inRange = isMonthView
                    ? (current >= startDate && current <= endDate)
                    : inYear;

                if (inYear || isMonthView) {
                    // Track month changes for labels
                    if (current.getMonth() !== curMonth) {
                        curMonth = current.getMonth();
                        // In month view, only show the label for the selected month to avoid "DECJAN" squishing.
                        // In year view, show all months.
                        if (!isMonthView || curMonth === month) {
                            months.push({
                                label: current.toLocaleString('default', { month: 'short' }).toUpperCase(),
                                weekIndex,
                            });
                        }
                    }

                    week.push({
                        date: dateStr,
                        distance: dailyDistances.get(dateStr) || 0,
                        dayOfWeek,
                        currentMonth: inMonth && inYear,
                        inRange
                    });
                } else {
                    week.push(null);
                }

                current.setDate(current.getDate() + 1);
            }

            weeks.push(week);
            weekIndex++;

            // For month view, stop when we've passed the end date
            if (isMonthView && current > endDate) {
                break;
            }
            // For year view, stop at end of year
            if (!isMonthView && current > endDate && weeks.length >= 52) {
                break;
            }
        }

        const monthGrids: Array<{
            monthIndex: number;
            label: string;
            firstDow: number;
            days: Array<{ date: string; distance: number; inRange: boolean }>;
        }> = [];

        if (!isMonthView) {
            for (let m = 0; m < 12; m++) {
                const firstOfMonth = new Date(year, m, 1);
                const lastOfMonth = new Date(year, m + 1, 0);
                const daysInMonth = lastOfMonth.getDate();
                const days: Array<{ date: string; distance: number; inRange: boolean }> = [];

                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = format(new Date(year, m, d), 'yyyy-MM-dd');
                    days.push({
                        date: dateStr,
                        distance: dailyDistances.get(dateStr) ?? 0,
                        inRange: true,
                    });
                }

                monthGrids.push({
                    monthIndex: m,
                    label: firstOfMonth.toLocaleString('default', { month: 'short' }).toUpperCase(),
                    firstDow: firstOfMonth.getDay(),
                    days,
                });
            }
        }

        return { weeks, monthLabels: months, maxDistance: max, monthGrids };
    }, [activities, year, month, isMonthView]);

    const getColor = (distance: number, isActive: boolean, isSelected: boolean): string => {
        const baseCell = 'border border-[var(--rv-border)]';
        if (isSelected) return `${baseCell} bg-[var(--rv-blue)] ring-2 ring-[var(--rv-blue)]/35`;
        if (!isActive) return `${baseCell} bg-[var(--rv-bg-elevated)]`;
        if (distance === 0) return `${baseCell} bg-[var(--rv-bg-elevated)]`;
        const intensity = Math.min(distance / maxDistance, 1);

        if (intensity < 0.25) return `${baseCell} bg-[var(--rv-green)]/30`;
        if (intensity < 0.5) return `${baseCell} bg-[var(--rv-green)]/45`;
        if (intensity < 0.75) return `${baseCell} bg-[var(--rv-green)]/65`;
        return `${baseCell} bg-[var(--rv-green)]`;
    };

    const getDayStory = (distance: number) => {
        if (distance === 0) return 'Recovery day';
        const intensity = maxDistance === 0 ? 0 : distance / maxDistance;
        if (intensity >= 0.9) return 'Peak mileage day';
        if (intensity >= 0.55) return 'Strong session';
        if (intensity >= 0.25) return 'Steady mileage';
        return 'Light touch';
    };

    if (!isMonthView) {
        return (
            <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-6 sm:py-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
                    {monthGrids.map((mg) => (
                        <YearGridMonth
                            key={mg.monthIndex}
                            mg={mg}
                            maxDistance={maxDistance}
                            selectedDate={selectedDate}
                            onSelectDay={onSelectDay}
                            setHoveredDay={setHoveredDay}
                        />
                    ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 sm:gap-5">
                    <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-text-faint)]">
                        <span>Less</span>
                        <div className="h-3 w-3 rounded-[2px] border border-[var(--rv-border)] bg-[var(--rv-bg-elevated)]" />
                        <div className="h-3 w-3 rounded-[2px] border border-[var(--rv-border)] bg-[var(--rv-green)]/30" />
                        <div className="h-3 w-3 rounded-[2px] border border-[var(--rv-border)] bg-[var(--rv-green)]/45" />
                        <div className="h-3 w-3 rounded-[2px] border border-[var(--rv-border)] bg-[var(--rv-green)]/65" />
                        <div className="h-3 w-3 rounded-[2px] border border-[var(--rv-border)] bg-[var(--rv-green)]" />
                        <span>More</span>
                    </div>
                    {onSelectDay && (
                        <div className="text-[0.78rem] italic text-[var(--rv-blue)]/80">
                            Click a day to open that run story
                        </div>
                    )}
                </div>

                {hoveredDay && (
                    <div
                        className="rv-panel fixed z-[200] pointer-events-none -translate-x-1/2 -translate-y-full px-3 py-2 animate-in fade-in zoom-in-95 duration-150"
                        style={{ left: hoveredDay.x, top: hoveredDay.y }}
                    >
                        <div className="mb-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-blue)]">
                            {format(parseISO(hoveredDay.date), 'MMM d, yyyy')}
                        </div>
                        <div className="text-sm font-semibold text-[var(--rv-text)]">
                            {hoveredDay.distance.toFixed(2)} km
                        </div>
                        <div className="mt-1 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--rv-text-faint)]">
                            {getDayStory(hoveredDay.distance)}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="rv-subtle-card overflow-x-auto p-4 sm:p-5">
            <div className="min-w-[300px]">
                {/* Month labels */}
                <div className="relative mb-2 ml-8 flex h-5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-text-faint)]">
                    {monthLabels.map((m, i) => (
                        <div
                            key={i}
                            className={isMonthView ? '' : 'absolute'}
                            style={isMonthView ? {} : { left: `${m.weekIndex * 14}px` }}
                        >
                            {m.label}
                        </div>
                    ))}
                </div>

                <div className="rounded-[1.35rem] border border-[var(--rv-border)]/70 bg-[var(--rv-bg-panel)]/30 p-3 sm:p-4">
                    <div className={`flex ${isMonthView ? 'gap-1.5' : 'gap-0.5'}`}>
                        {/* Day labels */}
                        <div className="flex flex-col gap-0.5 pr-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--rv-text-faint)] select-none">
                            <span className={isMonthView ? 'h-5' : 'h-3'}>S</span>
                            <span className={isMonthView ? 'h-5' : 'h-3'}>M</span>
                            <span className={isMonthView ? 'h-5' : 'h-3'}>T</span>
                            <span className={isMonthView ? 'h-5' : 'h-3'}>W</span>
                            <span className={isMonthView ? 'h-5' : 'h-3'}>T</span>
                            <span className={isMonthView ? 'h-5' : 'h-3'}>F</span>
                            <span className={isMonthView ? 'h-5' : 'h-3'}>S</span>
                        </div>

                        {/* Calendar grid */}
                        <div className={`relative flex ${isMonthView ? 'gap-1.5' : 'gap-0.5'}`}>
                            {weeks.map((week, weekIdx) => (
                                <div key={weekIdx} className={`flex flex-col ${isMonthView ? 'gap-1.5' : 'gap-0.5'}`}>
                                    {week.map((day, dayIdx) => {
                                        const isInteractive = isMonthView ? day?.inRange : day?.currentMonth;
                                        return (
                                            <button
                                                key={dayIdx}
                                                type="button"
                                                onClick={() => isInteractive && onSelectDay?.(day!.date)}
                                                onMouseEnter={(e) => {
                                                    if (isInteractive) {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const TOOLTIP_WIDTH = 140;
                                                        const clampedX = Math.min(
                                                            window.innerWidth - TOOLTIP_WIDTH / 2,
                                                            Math.max(TOOLTIP_WIDTH / 2, rect.left + rect.width / 2)
                                                        );
                                                        setHoveredDay({
                                                            date: day!.date,
                                                            distance: day!.distance,
                                                            x: clampedX,
                                                            y: rect.top - 10
                                                        });
                                                    }
                                                }}
                                                onMouseLeave={() => setHoveredDay(null)}
                                                className={`relative ${isMonthView ? 'h-5 w-5 rounded-[3px]' : 'h-3 w-3 rounded-[2px]'} transition-all duration-200 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-[var(--rv-border-strong)] ${day ? getColor(day.distance, isMonthView ? day.inRange : day.currentMonth, selectedDate === day.date) : 'border border-transparent bg-transparent'
                                                    } ${isInteractive ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-white/30' : ''}`}
                                                disabled={!isInteractive}
                                                aria-label={day ? `${format(parseISO(day.date), 'MMMM d, yyyy')}, ${day.distance.toFixed(2)} kilometers, ${getDayStory(day.distance)}` : 'Empty day'}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-6">
                        <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-text-faint)]">
                        <span>Less</span>
                        <div className="h-3 w-3 rounded-[2px] bg-[var(--rv-bg-elevated)]" />
                        <div className="h-3 w-3 rounded-[2px] bg-[var(--rv-green)]/30" />
                        <div className="h-3 w-3 rounded-[2px] bg-[var(--rv-green)]/45" />
                        <div className="h-3 w-3 rounded-[2px] bg-[var(--rv-green)]/65" />
                        <div className="h-3 w-3 rounded-[2px] bg-[var(--rv-green)]" />
                        <span>More</span>
                    </div>
                    {onSelectDay && (
                        <div className="text-[0.78rem] italic text-[var(--rv-blue)]/80">
                            Click a square to open that day&apos;s run story
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Tooltip */}
            {hoveredDay && (
                <div
                    className="rv-panel fixed z-[200] pointer-events-none -translate-x-1/2 -translate-y-full px-3 py-2 animate-in fade-in zoom-in-95 duration-150"
                    style={{ left: hoveredDay.x, top: hoveredDay.y }}
                >
                    <div className="mb-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-blue)]">
                        {format(parseISO(hoveredDay.date), 'MMM d, yyyy')}
                    </div>
                    <div className="text-sm font-semibold text-[var(--rv-text)]">
                        {hoveredDay.distance.toFixed(2)} km
                    </div>
                    <div className="mt-1 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--rv-text-faint)]">
                        {getDayStory(hoveredDay.distance)}
                    </div>
                </div>
            )}
        </div>
    );
}
