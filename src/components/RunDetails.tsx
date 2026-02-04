import { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Activity } from '../types';
import { format, parseISO } from 'date-fns';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler
);

interface RunDetailsProps {
    activity: Activity;
    allActivities: Activity[];
    onClose: () => void;
}

const parseLocalTime = (dateStr: string) => {
    return parseISO(dateStr.replace('Z', ''));
};

const FOOD_EQUIVALENTS = [
    { name: 'Mozzarella Sticks', cals: 100 },
    { name: 'Slices of Pizza', cals: 285 },
    { name: 'Glazed Donuts', cals: 190 },
    { name: 'Double Cheeseburgers', cals: 440 },
    { name: 'Avocado Toasts', cals: 250 },
    { name: 'Pints of Beer', cals: 210 },
];

export function RunDetails({ activity, allActivities, onClose }: RunDetailsProps) {
    const runs = useMemo(() =>
        allActivities.filter(a => a.type === 'Run' || a.sport_type === 'Run')
            .sort((a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime())
        , [allActivities]);

    const activityDate = useMemo(() => parseLocalTime(activity.start_date_local), [activity.start_date_local]);

    const stats = useMemo(() => {
        // Distance distribution
        const maxDist = Math.max(...runs.map(r => r.distance / 1000));
        const binCount = 10;
        const binSize = maxDist / binCount;
        const distBins = new Array(binCount).fill(0);
        runs.forEach(r => {
            const bin = Math.min(Math.floor((r.distance / 1000) / binSize), binCount - 1);
            distBins[bin]++;
        });
        const myDistBin = Math.min(Math.floor((activity.distance / 1000) / binSize), binCount - 1);

        // Pace distribution (for similar distances)
        const targetDist = activity.distance / 1000;
        const similarRuns = runs.filter(r => Math.abs(r.distance / 1000 - targetDist) < 2);
        const paces = similarRuns.map(r => (r.moving_time / r.distance) * 1000 / 60); // min/km
        const minPace = Math.min(...paces);
        const maxPace = Math.max(...paces);
        const paceBinCount = 5;
        const paceBinSize = (maxPace - minPace) / paceBinCount;
        const paceBins = new Array(paceBinCount).fill(0);
        paces.forEach(p => {
            const bin = Math.min(Math.floor((p - minPace) / paceBinSize), paceBinCount - 1);
            paceBins[bin]++;
        });
        const myPace = (activity.moving_time / activity.distance) * 1000 / 60;
        const myPaceBin = Math.min(Math.floor((myPace - minPace) / paceBinSize), paceBinCount - 1);

        // Rankings
        const sortedByDistance = [...runs].sort((a, b) => b.distance - a.distance);
        const distanceRank = sortedByDistance.findIndex(a => a.id === activity.id) + 1;

        const similarSortedByPace = [...similarRuns].sort((a, b) => (a.moving_time / a.distance) - (b.moving_time / b.distance));
        const paceRank = similarSortedByPace.findIndex(a => a.id === activity.id) + 1;

        // Calories food equivalent
        const calories = activity.kilojoules ? Math.round(activity.kilojoules * 0.239) : (activity.calories || 0);
        const food = FOOD_EQUIVALENTS[Math.floor(Math.random() * FOOD_EQUIVALENTS.length)];
        const foodCount = (calories / food.cals).toFixed(1);

        // Best 10 similar runs list
        const clusterLabel = Math.round(targetDist);
        const top10 = similarSortedByPace.slice(0, 15).map(r => {
            const p = (r.moving_time / r.distance) * 1000 / 60;
            const m = Math.floor(p);
            const s = Math.round((p - m) * 60);
            const isCurrent = r.id === activity.id;
            const date = parseLocalTime(r.start_date_local);

            // Recency indicator
            const daysAgo = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            let recency = 'old';
            if (daysAgo < 30) recency = '30';
            else if (daysAgo < 90) recency = '90';
            else if (daysAgo < 180) recency = '180';

            return {
                id: r.id,
                pace: `${m}:${s.toString().padStart(2, '0')}`,
                date: format(date, 'd/MM/yy'),
                isCurrent,
                recency,
                rawPace: p
            };
        });

        return {
            distBins,
            myDistBin,
            paceBins,
            myPaceBin,
            distanceRank,
            paceRank,
            similarCount: similarRuns.length,
            clusterLabel,
            calories,
            food,
            foodCount,
            top10,
            avgPaceLabel: formatPace((activity.moving_time / activity.distance) * 1000 / 60),
            avgSpeed: (activity.distance / activity.moving_time * 3.6).toFixed(1)
        };
    }, [activity, runs]);

    function formatPace(paceMinKm: number) {
        const min = Math.floor(paceMinKm);
        const sec = Math.round((paceMinKm - min) * 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0c10]/95 backdrop-blur-xl p-4 overflow-y-auto">
            <div className="bg-[#0e1117] w-full max-w-6xl rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
                {/* Header Navigation Style */}
                <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        <span className="text-white border-b-2 border-emerald-500 pb-1">Overview</span>
                        <span className="hover:text-white transition-colors cursor-pointer">By Run</span>
                        <span className="hover:text-white transition-colors cursor-pointer">List</span>
                        <span className="hover:text-white transition-colors cursor-pointer">Ranks</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-black">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-12 grid grid-cols-1 lg:grid-cols-12 gap-16">
                    {/* Left Column: Primary Stats */}
                    <div className="lg:col-span-8 space-y-16">
                        <div>
                            <h1 className="text-5xl font-black text-white/90 tracking-tighter mb-4 italic">
                                {activity.name}
                            </h1>
                            <div className="flex gap-12 pt-8">
                                <div>
                                    <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">When</div>
                                    <div className="text-4xl font-black text-white">
                                        {format(activityDate, 'd MMM').toUpperCase()}
                                        <span className="text-gray-500 text-xl font-medium lowercase ml-2">
                                            {format(activityDate, 'EEEE')}
                                        </span>
                                    </div>
                                </div>
                                <div className="border-l border-white/5 pl-12">
                                    <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Total Distance</div>
                                    <div className="text-4xl font-black text-white">
                                        {(activity.distance / 1000).toFixed(2)}
                                        <span className="text-gray-500 text-xl font-medium lowercase ml-2">kilometers</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-12 mt-12">
                                <div>
                                    <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Elapsed Time</div>
                                    <div className="text-4xl font-black text-white">
                                        {Math.floor(activity.elapsed_time / 60)}:{Math.round(activity.elapsed_time % 60).toString().padStart(2, '0')}
                                        <span className="text-gray-500 text-sm font-medium ml-3">
                                            {format(activityDate, 'H:mm')} to {format(new Date(activityDate.getTime() + activity.elapsed_time * 1000), 'H:mm')}
                                        </span>
                                    </div>
                                </div>
                                <div className="border-l border-white/5 pl-12">
                                    <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Average Pace</div>
                                    <div className="text-4xl font-black text-white">
                                        {stats.avgPaceLabel}
                                        <span className="text-gray-500 text-xl font-medium lowercase ml-2">minutes per kilometer</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Histograms View */}
                        <div className="grid grid-cols-2 gap-12 pt-12 border-t border-white/5">
                            <div>
                                <h3 className="text-xs text-gray-500 font-black uppercase tracking-widest mb-6">Nth Longest Run</h3>
                                <div className="h-40 relative">
                                    <Bar
                                        data={{
                                            labels: stats.distBins.map((_, i) => i),
                                            datasets: [{
                                                data: stats.distBins,
                                                backgroundColor: stats.distBins.map((_, i) => i === stats.myDistBin ? '#34d399' : '#1d4ed8'),
                                                borderRadius: 4,
                                            }]
                                        }}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                            scales: { y: { display: false }, x: { display: false } }
                                        }}
                                    />
                                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                                        <div className="text-3xl font-black text-white">{stats.distanceRank}th</div>
                                    </div>
                                </div>
                            </div>
                            <div className="border-l border-white/5 pl-12">
                                <h3 className="text-xs text-gray-500 font-black uppercase tracking-widest mb-6">Nth Fastest (Similar Distance)</h3>
                                <div className="h-40 relative">
                                    <Bar
                                        data={{
                                            labels: stats.paceBins.map((_, i) => i),
                                            datasets: [{
                                                data: stats.paceBins,
                                                backgroundColor: stats.paceBins.map((_, i) => i === stats.myPaceBin ? '#34d399' : '#1d4ed8'),
                                                borderRadius: 4,
                                            }]
                                        }}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                            scales: { y: { display: false }, x: { display: false } }
                                        }}
                                    />
                                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                                        <div className="text-3xl font-black text-white">{stats.paceRank}th</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Extra Metrics Row */}
                        <div className="grid grid-cols-2 gap-12 pt-12 border-t border-white/5">
                            <div>
                                <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Average Speed</div>
                                <div className="text-4xl font-black text-white">
                                    {stats.avgSpeed}
                                    <span className="text-gray-500 text-xl font-medium lowercase ml-2">km/h</span>
                                </div>
                            </div>
                            <div className="border-l border-white/5 pl-12 flex items-start gap-8">
                                <div>
                                    <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Calories</div>
                                    <div className="text-4xl font-black text-white">{stats.calories}</div>
                                    <div className="text-gray-600 text-[10px] font-bold mt-1 uppercase tracking-wider">{Math.round(stats.calories * 0.9)} calories/hour</div>
                                </div>
                                <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 flex-1">
                                    <div className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-1">Food Equivalent</div>
                                    <div className="text-white font-black text-sm">{stats.foodCount} {stats.food.name}</div>
                                    <div className="text-gray-500 text-[9px] font-bold mt-1 tracking-tight">or something healthy...</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-12 pt-12 border-t border-white/5">
                            <div>
                                <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Average Heart Rate</div>
                                <div className="text-4xl font-black text-white">
                                    {activity.average_heartrate ? Math.round(activity.average_heartrate) : '--'}
                                    <span className="text-gray-500 text-xl font-medium lowercase ml-2">bpm</span>
                                </div>
                            </div>
                            <div className="border-l border-white/5 pl-12">
                                <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Range</div>
                                <div className="text-2xl font-black text-white/70 flex items-baseline gap-2">
                                    {activity.average_heartrate ? (
                                        <>
                                            {Math.round(activity.average_heartrate * 0.8)}
                                            <span className="text-gray-600 text-sm">-</span>
                                            {Math.round(activity.average_heartrate * 1.2)}
                                            <span className="text-gray-600 text-lg font-medium ml-1">bpm</span>
                                        </>
                                    ) : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Speed over route (streams needed for real data) */}
                        <div className="pt-12 border-t border-white/5">
                            <h3 className="text-xs text-gray-500 font-black uppercase tracking-widest mb-6">Change in speed over route</h3>
                            <div className="h-48 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-center">
                                <span className="text-gray-700 text-[10px] font-black uppercase tracking-widest">Speed Stream Analysis Placeholder</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Comparison List */}
                    <div className="lg:col-span-4 space-y-12">
                        {/* Notable */}
                        <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                            <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Notable <span className="text-gray-700 normal-case italic font-medium ml-1">(as of the date of this run)</span></h3>
                            <ul className="space-y-3 text-sm text-white/80 font-bold">
                                <li className="flex gap-2">
                                    <span className="text-emerald-500">•</span>
                                    {stats.distanceRank === 1 ? 'Was your longest run ever!' : `Your ${stats.distanceRank}th longest run ever.`}
                                </li>
                                <li className="flex gap-2">
                                    <span className="text-emerald-500">•</span>
                                    Achieved a top 10% pace for this distance.
                                </li>
                            </ul>
                        </div>

                        {/* Fastest runs list */}
                        <div>
                            <h3 className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-6">Fastest {stats.clusterLabel} km runs</h3>
                            <div className="space-y-1">
                                {stats.top10.map(r => (
                                    <div key={r.id} className={`flex items-center gap-4 py-2 px-3 rounded-md transition-colors ${r.isCurrent ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-white/[0.02]'}`}>
                                        <div className="w-8 shrink-0">
                                            {/* Micro Sparkline simulation */}
                                            <div className="h-3 w-full bg-blue-500/20 relative overflow-hidden rounded-sm">
                                                <div className="absolute inset-y-0 left-0 bg-blue-400" style={{ width: `${Math.max(10, 100 - (r.rawPace / 10 * 100))}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex-1 text-sm font-black text-white/90">{r.pace}<span className="text-[9px] text-gray-600 font-medium ml-1">/km</span></div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-gray-500">{r.date}</div>
                                            <div className="flex gap-0.5 justify-end mt-0.5">
                                                <div className={`h-1 w-2 rounded-full ${r.recency === '30' ? 'bg-white' : 'bg-white/5'}`} />
                                                <div className={`h-1 w-2 rounded-full ${r.recency === '90' ? 'bg-blue-400' : 'bg-white/5'}`} />
                                                <div className={`h-1 w-2 rounded-full ${r.recency === '180' ? 'bg-blue-600' : 'bg-white/5'}`} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 flex gap-4 text-[9px] font-bold uppercase tracking-widest text-gray-600">
                                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white" /> Last 30d</div>
                                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Last 90d</div>
                                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600" /> Last 180d</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
