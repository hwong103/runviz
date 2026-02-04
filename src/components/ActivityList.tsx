import type { Activity } from '../types';
import { formatDuration } from '../analytics/heartRateZones';

interface ActivityListProps {
    activities: Activity[];
    limit?: number;
    onSelect?: (activity: Activity) => void;
}

export function ActivityList({ activities, limit = 10, onSelect }: ActivityListProps) {
    const runs = activities
        .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
        .slice(0, limit);

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

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-AU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        });
    };

    return (
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                <span className="text-2xl">🏃</span>
                <span>Training Log</span>
            </h2>

            <div className="space-y-3">
                {runs.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">No runs yet. Connect Strava to sync!</p>
                ) : (
                    runs.map((activity) => (
                        <div
                            key={activity.id}
                            onClick={() => onSelect?.(activity)}
                            className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer group border border-transparent hover:border-white/10"
                        >
                            {/* Date */}
                            <div className="w-16 text-center">
                                <div className="text-[10px] font-black uppercase tracking-tighter text-gray-500">{formatDate(activity.start_date_local).split(',')[0]}</div>
                                <div className="text-lg font-black text-white leading-none">{formatDate(activity.start_date_local).split(' ')[1]}</div>
                                <div className="text-[10px] font-black uppercase tracking-tighter text-gray-500">{formatDate(activity.start_date_local).split(' ')[2]}</div>
                            </div>

                            {/* Activity info */}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                                    {activity.name}
                                </h3>
                                <div className="flex items-center gap-3 text-xs text-gray-500 font-bold mt-1">
                                    <span className="text-gray-300">{formatDistance(activity.distance)} km</span>
                                    <span>•</span>
                                    <span>{formatDuration(activity.moving_time)}</span>
                                    <span>•</span>
                                    <span>{formatPace(activity.average_speed)} /km</span>
                                </div>
                            </div>

                            {/* Metrics */}
                            <div className="flex items-center gap-4">
                                {activity.average_heartrate && (
                                    <div className="text-right hidden sm:block">
                                        <div className="text-xs text-red-500/80 font-black flex items-center gap-1 justify-end">
                                            <span>❤️</span>
                                            <span>{Math.round(activity.average_heartrate)}</span>
                                        </div>
                                    </div>
                                )}

                                {activity.total_elevation_gain > 0 && (
                                    <div className="text-right hidden sm:block">
                                        <div className="text-xs text-gray-500 font-black flex items-center gap-1 justify-end">
                                            <span>⛰️</span>
                                            <span>{Math.round(activity.total_elevation_gain)}m</span>
                                        </div>
                                    </div>
                                )}

                                <div className="text-gray-700 font-black group-hover:text-white transition-colors">→</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
