import type { Activity } from '../types';
import { formatDuration } from '../analytics/heartRateZones';

interface ActivityListProps {
    activities: Activity[];
    limit?: number;
}

export function ActivityList({ activities, limit = 10 }: ActivityListProps) {
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
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>🏃</span>
                <span>Recent Runs</span>
            </h2>

            <div className="space-y-3">
                {runs.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">No runs yet. Connect Strava to sync!</p>
                ) : (
                    runs.map((activity) => (
                        <div
                            key={activity.id}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-200 cursor-pointer group"
                        >
                            {/* Date */}
                            <div className="w-16 text-center">
                                <div className="text-sm text-gray-400">{formatDate(activity.start_date_local)}</div>
                            </div>

                            {/* Activity info */}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-white truncate group-hover:text-emerald-400 transition-colors">
                                    {activity.name}
                                </h3>
                                <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                                    <span>{formatDistance(activity.distance)} km</span>
                                    <span>•</span>
                                    <span>{formatDuration(activity.moving_time)}</span>
                                    <span>•</span>
                                    <span>{formatPace(activity.average_speed)} /km</span>
                                </div>
                            </div>

                            {/* Heart rate if available */}
                            {activity.average_heartrate && (
                                <div className="text-right">
                                    <div className="text-sm text-red-400 flex items-center gap-1">
                                        <span>❤️</span>
                                        <span>{Math.round(activity.average_heartrate)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Elevation */}
                            {activity.total_elevation_gain > 0 && (
                                <div className="text-right">
                                    <div className="text-sm text-gray-400 flex items-center gap-1">
                                        <span>⛰️</span>
                                        <span>{Math.round(activity.total_elevation_gain)}m</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
