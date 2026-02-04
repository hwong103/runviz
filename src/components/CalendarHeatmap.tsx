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

export function CalendarHeatmap({
    activities,
    year = new Date().getFullYear(),
    month,
    onSelectDay,
    selectedDate
}: CalendarHeatmapProps) {
    const [hoveredDay, setHoveredDay] = useState<{ date: string; distance: number; x: number; y: number } | null>(null);
    const { weeks, monthLabels, maxDistance } = useMemo(() => {
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

        // Current range
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        // Start from Sunday of the week containing Jan 1
        const firstSunday = new Date(startDate);
        firstSunday.setDate(startDate.getDate() - startDate.getDay());

        const weeks: Array<Array<{ date: string; distance: number; dayOfWeek: number; currentMonth: boolean } | null>> = [];
        const months: Array<{ label: string; weekIndex: number }> = [];
        let curMonth = -1;

        const current = new Date(firstSunday);
        let weekIndex = 0;

        while (current <= endDate || weeks.length < 53) {
            const week: Array<{ date: string; distance: number; dayOfWeek: number; currentMonth: boolean } | null> = [];

            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const dateStr = current.toISOString().split('T')[0];
                const inYear = current.getFullYear() === year;
                const isSelectedMonth = month !== undefined ? current.getMonth() === month : true;

                if (inYear) {
                    // Track month changes for labels
                    if (current.getMonth() !== curMonth) {
                        curMonth = current.getMonth();
                        months.push({
                            label: current.toLocaleString('default', { month: 'short' }),
                            weekIndex,
                        });
                    }

                    week.push({
                        date: dateStr,
                        distance: dailyDistances.get(dateStr) || 0,
                        dayOfWeek,
                        currentMonth: isSelectedMonth && inYear
                    });
                } else {
                    week.push(null);
                }

                current.setDate(current.getDate() + 1);
            }

            weeks.push(week);
            weekIndex++;

            if (current > endDate && weeks.length >= 52) break;
        }

        return { weeks, monthLabels: months, maxDistance: max };
    }, [activities, year, month]);

    const getColor = (distance: number, isActive: boolean, isSelected: boolean): string => {
        if (isSelected) return 'bg-white ring-2 ring-emerald-400';
        if (!isActive) return 'bg-white/[0.02]';
        if (distance === 0) return 'bg-white/5';
        const intensity = Math.min(distance / maxDistance, 1);

        if (intensity < 0.25) return 'bg-emerald-900/60';
        if (intensity < 0.5) return 'bg-emerald-700/70';
        if (intensity < 0.75) return 'bg-emerald-500/80';
        return 'bg-emerald-400';
    };

    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10 overflow-x-auto">
            <div className="min-w-[700px]">
                {/* Month labels */}
                <div className="flex mb-2 text-[10px] text-gray-500 font-bold uppercase tracking-tighter ml-8 h-4 relative">
                    {monthLabels.map((m, i) => (
                        <div
                            key={i}
                            className="absolute"
                            style={{ left: `${m.weekIndex * 14}px` }}
                        >
                            {m.label}
                        </div>
                    ))}
                </div>

                <div className="flex gap-0.5">
                    {/* Day labels */}
                    <div className="flex flex-col gap-0.5 text-[9px] text-gray-600 font-bold pr-2 select-none uppercase">
                        <span className="h-3">S</span>
                        <span className="h-3">M</span>
                        <span className="h-3">T</span>
                        <span className="h-3">W</span>
                        <span className="h-3">T</span>
                        <span className="h-3">F</span>
                        <span className="h-3">S</span>
                    </div>

                    {/* Calendar grid */}
                    <div className="flex gap-0.5">
                        {weeks.map((week, weekIdx) => (
                            <div key={weekIdx} className="flex flex-col gap-0.5">
                                {week.map((day, dayIdx) => (
                                    <div
                                        key={dayIdx}
                                        onClick={() => day?.currentMonth && onSelectDay?.(day.date)}
                                        onMouseEnter={(e) => {
                                            if (day?.currentMonth) {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setHoveredDay({
                                                    date: day.date,
                                                    distance: day.distance,
                                                    x: rect.left + rect.width / 2,
                                                    y: rect.top - 10
                                                });
                                            }
                                        }}
                                        onMouseLeave={() => setHoveredDay(null)}
                                        className={`w-3 h-3 rounded-[2px] transition-all duration-200 ${day ? getColor(day.distance, day.currentMonth, selectedDate === day.date) : 'bg-transparent'
                                            } ${day?.currentMonth ? 'hover:scale-125 cursor-pointer hover:ring-2 hover:ring-white/30' : ''}`}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-6 mt-6">
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                        <span>Less</span>
                        <div className="w-3 h-3 rounded-[2px] bg-white/5" />
                        <div className="w-3 h-3 rounded-[2px] bg-emerald-900/60" />
                        <div className="w-3 h-3 rounded-[2px] bg-emerald-700/70" />
                        <div className="w-3 h-3 rounded-[2px] bg-emerald-500/80" />
                        <div className="w-3 h-3 rounded-[2px] bg-emerald-400" />
                        <span>More</span>
                    </div>
                    {onSelectDay && (
                        <div className="text-[10px] text-emerald-400/70 italic">
                            Click a day to view run details
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Tooltip */}
            {hoveredDay && (
                <div
                    className="fixed z-[200] pointer-events-none -translate-x-1/2 -translate-y-full px-3 py-2 bg-[#11141b] border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                    style={{ left: hoveredDay.x, top: hoveredDay.y }}
                >
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-0.5">
                        {format(parseISO(hoveredDay.date), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs font-bold text-white">
                        {hoveredDay.distance.toFixed(2)} km
                    </div>
                </div>
            )}
        </div>
    );
}
