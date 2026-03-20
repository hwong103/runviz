import type { CSSProperties } from 'react';
import type { Activity, Gear } from '../types';
import { formatDuration } from '../analytics/heartRateZones';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronRight, Footprints, HeartPulse, Mountain, X } from 'lucide-react';
import { getBrandLogoUrl } from '../services/logoService';
import { parseActivityLocalDate } from '../utils/activityDate';

interface ActivityListProps {
    activities: Activity[];
    limit?: number;
    onSelect?: (activity: Activity) => void;
    selectedShoeId?: string | null;
    selectedShoeName?: string;
    onClearShoeFilter?: () => void;
    shoes?: Gear[];
}

// Brand logo component for list view
function BrandLogo({ brandName }: { brandName?: string }) {
    const logoUrl = getBrandLogoUrl(brandName, 32, 'dark');
    return logoUrl ? (
        <img src={logoUrl} alt={brandName} className="block w-5 h-5 object-contain" />
    ) : null;
}

export function ActivityList({
    activities,
    limit = 10,
    onSelect,
    selectedShoeId,
    selectedShoeName,
    onClearShoeFilter,
    shoes = []
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
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <div>
                    <p className="rv-kicker mb-2">Activity Log</p>
                    <h2 className="rv-section-title">Training log</h2>
                </div>
                {selectedShoeId && selectedShoeName && (
                    <div className="flex items-center gap-2 sm:ml-auto">
                        <span className="flex items-center gap-2 rounded-full border border-[var(--rv-blue)]/30 bg-[var(--rv-blue)]/15 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--rv-blue)]">
                            <Footprints className="h-3.5 w-3.5" />
                            <span>{selectedShoeName}</span>
                        </span>
                        <button
                            onClick={onClearShoeFilter}
                            className="rounded-full px-2 py-1 text-xs font-black text-[var(--rv-text-dim)] transition-colors hover:bg-white/10 hover:text-white"
                            title="Clear filter"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {runs.length === 0 ? (
                    <div className="space-y-3 py-12 text-center">
                        <Footprints className="mx-auto h-10 w-10 text-[var(--rv-text-faint)]" />
                        <p className="rv-mini-label text-[var(--rv-text-dim)]">This log is resting</p>
                        <p className="mx-auto max-w-[30ch] text-sm leading-6 text-[var(--rv-text-faint)]">Try easing the filters or pull a fresh sync. Once a run lands here, RunViz will turn it into a cleaner training story.</p>
                    </div>
                ) : (
                    runs.map((activity, index) => {
                        const dateParts = formatDate(activity.start_date_local);
                        return (
                            <button
                                key={activity.id}
                                type="button"
                                onClick={() => onSelect?.(activity)}
                                style={reveal(160 + index * 40)}
                                className="rv-reveal-subtle rv-spotlight group flex w-full cursor-pointer flex-col gap-3 rounded-[1.7rem] border border-white/[0.06] bg-black/[0.15] p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/5 focus-visible:border-[var(--rv-blue)] focus-visible:bg-white/5 sm:flex-row sm:items-center sm:gap-4"
                                aria-label={`Open run details for ${activity.name} on ${dateParts.month} ${dateParts.day}`}
                            >
                                {/* Date */}
                                <div className="w-full sm:w-16 flex items-center gap-2 sm:block sm:text-center">
                                    <div className="rv-mini-label">{dateParts.weekday}</div>
                                    <div className="text-[1.35rem] font-bold leading-none text-white">{dateParts.day}</div>
                                    <div className="rv-mini-label">{dateParts.month}</div>
                                </div>

                                {/* Activity info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-white transition-colors group-hover:text-[var(--rv-blue)]">
                                            {activity.name}
                                        </h3>
                                        {activity.distance === maxDist && maxDist > 0 && (
                                            <span className="shrink-0 rounded-full border border-[var(--rv-yellow)]/30 bg-[var(--rv-yellow)]/12 px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[var(--rv-yellow)]">
                                                Longest
                                            </span>
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
                                <div className="hidden sm:flex flex-col items-end min-w-[150px] max-w-[220px] ml-4 shrink-0">
                                    {(() => {
                                        // Try to find shoe in the provided shoes array, or use the one on the activity if available
                                        const shoe = (activity.gear_id ? shoes.find(s => s.id === activity.gear_id) : null) || activity.gear;
                                        if (!shoe) return null;
                                        return (
                                            <div className="group/shoe flex items-center gap-2 rounded-full border border-[var(--rv-blue)]/20 bg-[var(--rv-blue)]/10 px-3 py-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--rv-blue)]/20">
                                                <BrandLogo brandName={shoe.brand_name} />
                                                <span className="max-w-[160px] truncate text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--rv-blue)]">
                                                    {shoe.name}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Metrics */}
                                <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-4">
                                    <div className="flex flex-col items-end gap-1">
                                        {activity.average_heartrate && (
                                            <div className="text-right hidden sm:block">
                                                <div className="flex items-center justify-end gap-1 text-[0.72rem] font-semibold text-red-400/80">
                                                    <HeartPulse className="h-3.5 w-3.5" />
                                                    <span>{Math.round(activity.average_heartrate)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {activity.total_elevation_gain > 0 && (
                                            <div className="text-right hidden sm:block">
                                                <div className="flex items-center justify-end gap-1 text-[0.72rem] font-semibold text-[var(--rv-text-faint)]">
                                                    <Mountain className="h-3.5 w-3.5" />
                                                    <span>{Math.round(activity.total_elevation_gain)}m</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <ChevronRight className="h-4 w-4 text-[var(--rv-text-faint)] transition-all group-hover:translate-x-1 group-hover:text-white" />
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
