import type { CSSProperties } from 'react';
import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';
import { formatDuration } from '@/analytics/heartRateZones';
import { calculateActivityTRIMP } from '@/analytics/trainingLoad';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronRight, Footprints, HeartPulse, Mountain, X } from 'lucide-react';
import { parseActivityLocalDate } from '@/utils/activityDate';
import { Badge } from '@/components/ui/Badge';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { SectionHeader } from '@/components/ui/SectionHeader';

interface ActivityListProps {
    activities: Activity[];
    limit?: number;
    kicker?: string;
    title?: string;
    onSelect?: (activity: Activity) => void;
    selectedShoeId?: string | null;
    selectedShoeName?: string;
    onClearShoeFilter?: () => void;
    shoes?: Gear[];
    maxHR?: number;
    restHR?: number;
}

export function ActivityList({
    activities,
    limit = 10,
    kicker = 'Activity Log',
    title = 'Training log',
    onSelect,
    selectedShoeId,
    selectedShoeName,
    onClearShoeFilter,
    shoes = [],
    maxHR = 185,
    restHR = 60,
}: ActivityListProps) {
    const reveal = (delay: number): CSSProperties => ({ '--rv-delay': `${delay}ms` } as CSSProperties);
    const runs = activities
        .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
        .slice(0, limit);

    const maxDist = Math.max(...runs.map(r => r.distance), 0);

    const formatDistance = (meters: number): string => {
        return (meters / 1000).toFixed(2);
    };

    const formatPace = (speedMs: number): string => {
        if (speedMs <= 0) return '--:--';
        const paceMinKm = (1 / speedMs) * 1000 / 60;
        const mins = Math.floor(paceMinKm);
        const secs = Math.round((paceMinKm - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatDate = (dateStr: string) => {
        const date = parseActivityLocalDate(dateStr);
        return {
            weekday: format(date, 'eee'),
            day: format(date, 'd'),
            month: format(date, 'MMM'),
            relative: formatDistanceToNow(date, { addSuffix: true })
        };
    };

    return (
        <div className="rv-panel rv-reveal-subtle px-5 py-5 sm:px-7 sm:py-6" style={reveal(120)}>
            <SectionHeader
                className="mb-6"
                kicker={kicker}
                title={title}
                action={selectedShoeId && selectedShoeName ? (
                    <div className="flex items-center gap-2">
                        <Badge tone="blue" icon={<Footprints className="h-3.5 w-3.5" />}>
                            {selectedShoeName}
                        </Badge>
                        <button
                            onClick={onClearShoeFilter}
                            className="rounded-full px-2 py-1 text-xs font-black text-[var(--rv-text-dim)] transition-colors hover:bg-[var(--rv-bg-elevated)] hover:text-[var(--rv-text)]"
                            title="Clear filter"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : null}
            />

            <div className="space-y-1">
                {runs.length === 0 ? (
                    <div className="space-y-3 py-12 text-center">
                        <Footprints className="mx-auto h-10 w-10 text-[var(--rv-text-faint)]" />
                        <p className="rv-mini-label text-[var(--rv-text-dim)]">No runs in this view</p>
                        <p className="mx-auto max-w-[30ch] text-sm leading-6 text-[var(--rv-text-faint)]">Try easing the filters or run a fresh sync to bring matching sessions back into the log.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--rv-border)]">
                        {runs.map((activity, index) => {
                        const dateParts = formatDate(activity.start_date_local);
                        const trimp = calculateActivityTRIMP(activity, maxHR, restHR);
                        const trimpColor =
                            trimp >= 150 ? 'text-red-400' :
                            trimp >= 100 ? 'text-orange-400' :
                            'text-emerald-400';

                        return (
                            <button
                                key={activity.id}
                                type="button"
                                onClick={() => onSelect?.(activity)}
                                style={reveal(160 + index * 40)}
                                className="rv-reveal-subtle group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer flex-col gap-3 rounded-[1.25rem] px-2 py-4 text-left transition-all duration-300 hover:bg-[color-mix(in_srgb,var(--rv-bg-elevated)_72%,transparent)] focus-visible:bg-[var(--rv-bg-elevated)] sm:flex-row sm:items-center sm:gap-4"
                                aria-label={`Open run details for ${activity.name} on ${dateParts.month} ${dateParts.day}`}
                            >
                                {/* Date */}
                                <div className="flex w-full items-center gap-3 sm:block sm:w-16 sm:text-center">
                                    <div className="rv-mini-label">{dateParts.weekday}</div>
                                    <div className="text-[1.35rem] font-bold leading-none text-[var(--rv-text)]">{dateParts.day}</div>
                                    <div className="rv-mini-label">{dateParts.month}</div>
                                </div>

                                {/* Activity info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--rv-text)] transition-colors group-hover:text-[var(--rv-blue)]">
                                            {activity.name}
                                        </h3>
                                        {activity.distance === maxDist && maxDist > 0 && (
                                            <Badge tone="gold" className="shrink-0">
                                                Longest
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-[var(--rv-text-faint)]">
                                        <span className="text-[var(--rv-text-dim)]">{formatDistance(activity.distance)} km</span>
                                        <span>•</span>
                                        <span>{formatDuration(activity.moving_time)}</span>
                                        <span className="hidden sm:inline">•</span>
                                        <span className="hidden sm:inline">{formatPace(activity.average_speed)} /km</span>
                                        <span className="ml-auto text-[0.72rem] font-medium lowercase tracking-[0.01em] opacity-70 sm:ml-0">{dateParts.relative}</span>
                                    </div>
                                </div>

                                {/* Shoe (Always Visible) */}
                                <div className="hidden min-w-[150px] max-w-[220px] shrink-0 sm:ml-4 sm:flex sm:flex-col sm:items-end">
                                    {(() => {
                                        // Try to find shoe in the provided shoes array, or use the one on the activity if available
                                        const shoe = (activity.gear_id ? shoes.find(s => s.id === activity.gear_id) : null) || activity.gear;
                                        if (!shoe) return null;
                                        return (
                                            <div className="group/shoe flex items-center gap-2 rounded-full border border-[var(--rv-border)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_94%,transparent)] px-3 py-1.5 transition-colors duration-300 hover:border-[var(--rv-border-strong)]">
                                                <BrandLogo brandName={shoe.brand_name} fallbackMode="none" size={32} className="h-5 w-5" />
                                                <span className="max-w-[160px] truncate text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--rv-text-dim)]">
                                                    {shoe.name}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Metrics */}
                                <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] font-semibold sm:flex-col sm:items-end sm:gap-1">
                                        {activity.average_heartrate && (
                                            <div className="flex items-center justify-end gap-1 text-red-400/80">
                                                <HeartPulse className="h-3.5 w-3.5" />
                                                <span>{Math.round(activity.average_heartrate)} bpm</span>
                                            </div>
                                        )}

                                        {activity.total_elevation_gain > 0 && (
                                            <div className="flex items-center justify-end gap-1 text-[var(--rv-text-faint)]">
                                                <Mountain className="h-3.5 w-3.5" />
                                                <span>{Math.round(activity.total_elevation_gain)} m</span>
                                            </div>
                                        )}

                                        {trimp > 0 && (
                                            <div className={`flex items-center justify-end gap-1 ${trimpColor}`}>
                                                <span>TRIMP {trimp}</span>
                                            </div>
                                        )}

                                        {activity.suffer_score != null && (
                                            <div className="text-[var(--rv-text-faint)]">
                                                Stress {activity.suffer_score}
                                            </div>
                                        )}
                                    </div>

                                    <ChevronRight className="h-4 w-4 text-[var(--rv-text-faint)] transition-all group-hover:translate-x-1 group-hover:text-[var(--rv-text)]" />
                                </div>
                            </button>
                        );
                    })}
                    </div>
                )}
            </div>
        </div>
    );
}
