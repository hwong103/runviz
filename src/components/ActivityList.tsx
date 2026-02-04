import type { Activity, Gear } from '../types';
import { formatDuration } from '../analytics/heartRateZones';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { getBrandLogoUrl } from '../services/logoService';

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
        <img src={logoUrl} alt={brandName} className="w-5 h-5 object-contain" />
    ) : null;
}

const parseLocalTime = (dateStr: string) => {
    return parseISO(dateStr.replace('Z', ''));
};

export function ActivityList({
    activities,
    limit = 10,
    onSelect,
    selectedShoeId,
    selectedShoeName,
    onClearShoeFilter,
    shoes = []
}: ActivityListProps) {
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
        const date = parseLocalTime(dateStr);
        return {
            weekday: format(date, 'eee'),
            day: format(date, 'd'),
            month: format(date, 'MMM'),
            relative: formatDistanceToNow(date, { addSuffix: true })
        };
    };

    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                <span className="text-2xl">🏃</span>
                <span>Training Log</span>
                {selectedShoeId && selectedShoeName && (
                    <div className="flex items-center gap-2 ml-auto">
                        <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border border-emerald-500/30 flex items-center gap-2">
                            <span>👟</span>
                            <span>{selectedShoeName}</span>
                        </span>
                        <button
                            onClick={onClearShoeFilter}
                            className="text-gray-400 hover:text-white text-xs font-black transition-colors px-2 py-1 rounded hover:bg-white/10"
                            title="Clear filter"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </h2>

            <div className="space-y-3">
                {runs.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                        <div className="text-4xl">🏜️</div>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No activities found</p>
                        <p className="text-gray-600 text-xs max-w-[200px] mx-auto">Try adjusting your filters or sync your latest Strava data.</p>
                    </div>
                ) : (
                    runs.map((activity) => {
                        const dateParts = formatDate(activity.start_date_local);
                        return (
                            <div
                                key={activity.id}
                                onClick={() => onSelect?.(activity)}
                                className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer group border border-transparent hover:border-white/10"
                            >
                                {/* Date */}
                                <div className="w-16 text-center">
                                    <div className="text-[10px] font-black uppercase tracking-tighter text-gray-500">{dateParts.weekday}</div>
                                    <div className="text-lg font-black text-white leading-none">{dateParts.day}</div>
                                    <div className="text-[10px] font-black uppercase tracking-tighter text-gray-500">{dateParts.month}</div>
                                </div>

                                {/* Activity info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                                            {activity.name}
                                        </h3>
                                        {activity.distance === maxDist && maxDist > 0 && (
                                            <span className="shrink-0 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                                Longest
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 font-bold mt-1">
                                        <span className="text-gray-300">{formatDistance(activity.distance)} km</span>
                                        <span>•</span>
                                        <span>{formatDuration(activity.moving_time)}</span>
                                        <span className="hidden sm:inline">•</span>
                                        <span className="hidden sm:inline">{formatPace(activity.average_speed)} /km</span>
                                        <span className="text-[10px] opacity-60 lowercase font-medium ml-auto sm:ml-0">{dateParts.relative}</span>
                                    </div>
                                </div>

                                {/* Shoe (Always Visible) */}
                                <div className="flex flex-col items-end min-w-[120px] max-w-[180px] ml-4 shrink-0">
                                    {(() => {
                                        // Try to find shoe in the provided shoes array, or use the one on the activity if available
                                        const shoe = (activity.gear_id ? shoes.find(s => s.id === activity.gear_id) : null) || activity.gear;
                                        if (!shoe) return null;
                                        return (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 group/shoe hover:bg-emerald-500/20 transition-colors">
                                                <BrandLogo brandName={shoe.brand_name} />
                                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider truncate max-w-[120px]">
                                                    {shoe.name}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Metrics */}
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-end gap-1">
                                        {activity.average_heartrate && (
                                            <div className="text-right hidden sm:block">
                                                <div className="text-[10px] text-red-500/80 font-black flex items-center gap-1 justify-end">
                                                    <span>❤️</span>
                                                    <span>{Math.round(activity.average_heartrate)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {activity.total_elevation_gain > 0 && (
                                            <div className="text-right hidden sm:block">
                                                <div className="text-[10px] text-gray-400/60 font-black flex items-center gap-1 justify-end">
                                                    <span>⛰️</span>
                                                    <span>{Math.round(activity.total_elevation_gain)}m</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-gray-700 font-black group-hover:text-white transition-all transform group-hover:translate-x-1">→</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
