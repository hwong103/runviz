import { useMemo } from 'react';
import type { Activity } from '../types';
import { formatDuration } from '../analytics/heartRateZones';
import { format } from 'date-fns';

interface RunDetailsProps {
    activity: Activity;
    allActivities: Activity[];
    onClose: () => void;
}

export function RunDetails({ activity, allActivities, onClose }: RunDetailsProps) {
    const runs = useMemo(() =>
        allActivities.filter(a => a.type === 'Run' || a.sport_type === 'Run')
            .sort((a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime())
        , [allActivities]);

    const stats = useMemo(() => {
        // Calculate rankings
        const sortedByDistance = [...runs].sort((a, b) => b.distance - a.distance);
        const sortedByPace = [...runs].sort((a, b) => (a.moving_time / a.distance) - (b.moving_time / b.distance));

        const distanceRank = sortedByDistance.findIndex(a => a.id === activity.id) + 1;
        const paceRank = sortedByPace.findIndex(a => a.id === activity.id) + 1;

        // Similar runs (within +/- 2km)
        const similarRuns = runs.filter(a =>
            Math.abs(a.distance - activity.distance) < 2000 && a.id !== activity.id
        ).slice(0, 5);

        // Pace calculation
        const pace = (activity.moving_time / activity.distance) * 1000 / 60;
        const mins = Math.floor(pace);
        const secs = Math.round((pace - mins) * 60);

        return {
            distanceRank,
            paceRank,
            similarRuns,
            pace: `${mins}:${secs.toString().padStart(2, '0')}`,
            avgSpeed: (activity.distance / activity.moving_time * 3.6).toFixed(1), // km/h
            calories: activity.kilojoules ? Math.round(activity.kilojoules * 0.239) : '-',
        };
    }, [activity, runs]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-[#111827] w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div>
                        <div className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.2em] mb-2 px-2 py-0.5 bg-emerald-400/10 rounded-full inline-block">
                            Run Analysis
                        </div>
                        <h2 className="text-3xl font-black text-white tracking-tight">
                            {activity.name}
                        </h2>
                        <div className="text-gray-400 text-sm mt-1 font-bold">
                            {format(new Date(activity.start_date_local), 'EEEE, MMMM do, yyyy • h:mm a')}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-all border border-white/5"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <MetricCard label="Distance" value={(activity.distance / 1000).toFixed(2)} unit="km" />
                        <MetricCard label="Avg Pace" value={stats.pace} unit="/km" />
                        <MetricCard label="Moving Time" value={formatDuration(activity.moving_time)} unit="" />
                        <MetricCard label="Avg Speed" value={stats.avgSpeed} unit="km/h" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Rankings */}
                        <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                            <h3 className="text-xs text-gray-500 font-black uppercase tracking-widest mb-4">All-Time Rankings</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-sm">Longest Run</span>
                                    <span className="text-white font-black">#{stats.distanceRank} of {runs.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-sm">Fastest Pace</span>
                                    <span className="text-white font-black">#{stats.paceRank} of {runs.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* Extra Stats */}
                        <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                            <h3 className="text-xs text-gray-500 font-black uppercase tracking-widest mb-4">Detailed Data</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-sm">Calories</span>
                                    <span className="text-white font-black">{stats.calories} kcal</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-sm">Avg HR</span>
                                    <span className="text-white font-black">{activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Max HR / Elevation */}
                        <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                            <h3 className="text-xs text-gray-500 font-black uppercase tracking-widest mb-4">Elevation & Intensity</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-sm">Gain</span>
                                    <span className="text-white font-black">{activity.total_elevation_gain.toFixed(0)} m</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-sm">Max HR</span>
                                    <span className="text-white font-black">{activity.max_heartrate ? `${Math.round(activity.max_heartrate)} bpm` : 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Similar Runs */}
                    <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5">
                        <h3 className="text-lg font-bold text-white mb-6">Similar Runs (+/- 1km)</h3>
                        <div className="space-y-4">
                            {stats.similarRuns.map(run => {
                                const runPace = (run.moving_time / run.distance) * 1000 / 60;
                                const runMins = Math.floor(runPace);
                                const runSecs = Math.round((runPace - runMins) * 60);
                                return (
                                    <div key={run.id} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                        <div>
                                            <div className="text-white font-bold">{run.name}</div>
                                            <div className="text-gray-500 text-xs">{format(new Date(run.start_date_local), 'MMM d, yyyy')}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-emerald-400 font-black">{(run.distance / 1000).toFixed(1)} km</div>
                                            <div className="text-gray-400 text-xs">{runMins}:{runSecs.toString().padStart(2, '0')}/km</div>
                                        </div>
                                    </div>
                                );
                            })}
                            {stats.similarRuns.length === 0 && (
                                <div className="text-gray-500 text-center py-4">No similar runs found.</div>
                            )}
                        </div>
                    </div>

                    {/* Speed Chart Placeholder / streams needed for actual chart */}
                    <div className="h-48 bg-black/40 rounded-[2rem] border border-white/5 flex items-center justify-center">
                        <span className="text-gray-600 font-bold uppercase tracking-widest text-xs">Full Speed Chart & Mapping Coming Soon</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value, unit }: { label: string; value: string; unit: string }) {
    return (
        <div className="text-center p-6 bg-white/[0.03] rounded-[2rem] border border-white/5">
            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">{label}</div>
            <div className="flex items-baseline justify-center gap-1">
                <span className="text-3xl font-black text-white">{value}</span>
                <span className="text-xs text-gray-400 font-bold">{unit}</span>
            </div>
        </div>
    );
}
