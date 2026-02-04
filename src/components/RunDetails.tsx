import { useMemo, useEffect, useState } from 'react';
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
import { Bar, Chart } from 'react-chartjs-2';
import type { Activity, ActivityStreams } from '../types';
import { format, parseISO } from 'date-fns';
import { activities as activitiesApi } from '../services/api';

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

function getOrdinal(n: number) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function RunDetails({ activity, allActivities, onClose }: RunDetailsProps) {
    const [streams, setStreams] = useState<ActivityStreams | null>(null);
    const [loadingStreams, setLoadingStreams] = useState(false);

    useEffect(() => {
        const fetchStreams = async () => {
            setLoadingStreams(true);
            try {
                const data = await activitiesApi.getStreams(activity.id);
                setStreams(data);
            } catch (err) {
                console.error("Failed to fetch streams:", err);
            } finally {
                setLoadingStreams(false);
            }
        };
        fetchStreams();
    }, [activity.id]);

    const runs = useMemo(() =>
        allActivities.filter(a => a.type === 'Run' || a.sport_type === 'Run')
            .sort((a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime())
        , [allActivities]);

    const activityDate = useMemo(() => parseLocalTime(activity.start_date_local), [activity.start_date_local]);

    const stats = useMemo(() => {
        // --- LONG DISTANCE HISTOGRAM ---
        const allDistances = runs.map(r => r.distance / 1000);
        const maxDist = Math.ceil(Math.max(...allDistances, 1) / 2) * 2;
        const binCount = 10;
        const binSize = maxDist / binCount;

        const distBins = new Array(binCount).fill(0);
        const distLabels = [];
        for (let i = 0; i < binCount; i++) {
            const edge = maxDist - (i * binSize);
            distLabels.push(Math.round(edge));
        }

        runs.forEach(r => {
            const d = r.distance / 1000;
            const index = Math.min(Math.floor((maxDist - d) / binSize), binCount - 1);
            if (index >= 0) distBins[index]++;
        });

        const myDist = activity.distance / 1000;
        const myDistBin = Math.min(Math.floor((maxDist - myDist) / binSize), binCount - 1);

        // --- PACE HISTOGRAM ---
        const targetDist = activity.distance / 1000;
        const similarRuns = runs.filter(r => Math.abs(r.distance / 1000 - targetDist) < 2);
        const paces = similarRuns.map(r => (r.moving_time / r.distance) * 1000 / 60);
        const validPaces = paces.filter(p => !isNaN(p) && isFinite(p));

        const minPace = Math.floor(Math.min(...validPaces, 4));
        const maxPace = Math.ceil(Math.max(...validPaces, 8));
        const paceBinCount = 6;
        const paceBinSize = (maxPace - minPace) / paceBinCount;

        const paceBins = new Array(paceBinCount).fill(0);
        const paceLabels = [];
        for (let i = 0; i < paceBinCount; i++) {
            const p = minPace + (i * paceBinSize);
            const m = Math.floor(p);
            const s = Math.round((p - m) * 60);
            paceLabels.push(`${m}:${s.toString().padStart(2, '0')}`);
        }

        validPaces.forEach(p => {
            const bin = Math.min(Math.floor((p - minPace) / paceBinSize), paceBinCount - 1);
            if (bin >= 0) paceBins[bin]++;
        });

        const myPace = (activity.moving_time / activity.distance) * 1000 / 60;
        const myPaceBin = Math.min(Math.floor((myPace - minPace) / paceBinSize), paceBinCount - 1);

        const sortedByDistance = [...runs].sort((a, b) => b.distance - a.distance);
        const distanceRank = sortedByDistance.findIndex(a => a.id === activity.id) + 1;

        const similarSortedByPace = [...similarRuns].sort((a, b) => (a.moving_time / a.distance) - (b.moving_time / b.distance));
        const paceRank = similarSortedByPace.findIndex(a => a.id === activity.id) + 1;

        const calories = activity.calories || (activity.kilojoules ? Math.round(activity.kilojoules * 1.07) : 0);
        const food = FOOD_EQUIVALENTS[Math.floor(Math.random() * FOOD_EQUIVALENTS.length)];
        const foodCount = (calories / food.cals).toFixed(1);

        const clusterLabel = Math.round(targetDist);
        const top10 = similarSortedByPace.slice(0, 15).map(r => {
            const p = (r.moving_time / r.distance) * 1000 / 60;
            const m = Math.floor(p);
            const s = Math.round((p - m) * 60);
            const isCurrent = r.id === activity.id;
            const date = parseLocalTime(r.start_date_local);

            const daysAgo = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            let recencyColor = 'bg-gray-700';
            if (daysAgo < 30) recencyColor = 'bg-white';
            else if (daysAgo < 90) recencyColor = 'bg-blue-400';
            else if (daysAgo < 180) recencyColor = 'bg-blue-600';

            return {
                id: r.id,
                pace: `${m}:${s.toString().padStart(2, '0')}`,
                date: format(date, 'd/MM/yy'),
                isCurrent,
                recencyColor,
                rawPace: p
            };
        });

        const notables = [];
        if (distanceRank === 1) notables.push("Was your longest run ever!");
        else if (distanceRank <= 5) notables.push(`One of your top 5 longest runs ever!`);

        if (paceRank === 1) notables.push("Your fastest pace for this distance!");
        else if (paceRank <= 10) notables.push(`A top 10 performance for ${clusterLabel}km.`);

        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const monthRuns = runs.filter(r => {
            const d = parseLocalTime(r.start_date_local);
            return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        });
        if (monthRuns.length > 0) {
            const monthSorted = [...monthRuns].sort((a, b) => b.distance - a.distance);
            if (monthSorted[0].id === activity.id) notables.push(`Your longest run this month!`);
        }

        if (notables.length < 2) notables.push("Maintained consistent effort throughout.");

        return {
            distBins,
            distLabels,
            myDistBin,
            paceBins,
            paceLabels,
            myPaceBin,
            distanceRank,
            paceRank,
            distanceRankText: getOrdinal(distanceRank),
            paceRankText: getOrdinal(paceRank),
            similarCount: similarRuns.length,
            clusterLabel,
            calories,
            food,
            foodCount,
            top10,
            notables,
            avgPaceLabel: formatPace((activity.moving_time / activity.distance) * 1000 / 60),
            avgSpeed: (activity.distance / activity.moving_time * 3.6).toFixed(1)
        };
    }, [activity, runs]);

    const mixedChartData = useMemo(() => {
        if (!streams?.velocity_smooth?.data || !streams.distance?.data) return null;

        // Downsample to ~120 points for smooth performance
        const rawPoints = streams.velocity_smooth.data.length;
        const step = Math.max(1, Math.floor(rawPoints / 120));

        const velocityData = [];
        const hrData = [];
        const distanceLabels = [];

        for (let i = 0; i < rawPoints; i += step) {
            const dist = streams.distance.data[i];
            const speed = streams.velocity_smooth.data[i];
            const hr = streams.heartrate?.data ? streams.heartrate.data[i] : null;

            if (speed <= 0.5) continue;
            const pace = (1 / speed) * 1000 / 60;
            if (pace > 15) continue;

            velocityData.push(pace);
            hrData.push(hr);
            distanceLabels.push((dist / 1000).toFixed(2));
        }

        return {
            labels: distanceLabels,
            datasets: [
                {
                    type: 'line' as const,
                    label: 'Pace',
                    data: velocityData,
                    borderColor: '#60a5fa',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 3,
                    yAxisID: 'y',
                },
                {
                    type: 'bar' as const,
                    label: 'Heart Rate',
                    data: hrData,
                    backgroundColor: '#1d4ed8',
                    hoverBackgroundColor: '#2563eb',
                    borderRadius: 1,
                    barPercentage: 1.0,
                    categoryPercentage: 1.0,
                    yAxisID: 'y1',
                }
            ]
        };
    }, [streams]);

    function formatPace(paceMinKm: number) {
        const min = Math.floor(paceMinKm);
        const sec = Math.round((paceMinKm - min) * 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0c10]/95 backdrop-blur-xl p-4 overflow-y-auto">
            <div className="bg-[#0e1117] w-full max-w-6xl rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
                <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        <span className="text-white border-b-2 border-emerald-500 pb-1">Overview</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-black text-xl px-4 py-2 transition-colors">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-12 grid grid-cols-1 lg:grid-cols-12 gap-16">
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
                        </div>

                        {/* Smashrun Style Mixed Chart */}
                        <div className="pt-12 border-t border-white/5">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xs text-gray-400 font-bold uppercase tracking-widest">Change in speed over route</h3>
                                <div className="bg-white/5 rounded px-2 py-1 text-[9px] font-black text-gray-400 uppercase tracking-widest">Splits</div>
                            </div>

                            <div className="h-72 bg-black/40 rounded-[2rem] border border-white/5 p-8 relative flex flex-col">
                                {/* Custom Axis Labels */}
                                <div className="absolute left-2 top-1/2 -rotate-90 origin-center text-[9px] text-gray-600 font-black uppercase tracking-widest w-24 text-center">Pace</div>
                                <div className="absolute right-2 top-1/2 rotate-90 origin-center text-[9px] text-gray-600 font-black uppercase tracking-widest w-24 text-center">Heart Rate</div>

                                {loadingStreams ? (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : mixedChartData ? (
                                    <Chart
                                        type='bar'
                                        data={mixedChartData as any}
                                        options={{
                                            maintainAspectRatio: false,
                                            interaction: { mode: 'index', intersect: false },
                                            plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: 'rgba(0,0,0,0.8)', titleFont: { size: 10 }, bodyFont: { size: 10 } } },
                                            scales: {
                                                x: { display: true, grid: { display: false }, ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' }, maxTicksLimit: 8 } },
                                                y: {
                                                    reverse: true,
                                                    position: 'left',
                                                    grid: { color: 'rgba(255,255,255,0.03)' },
                                                    ticks: {
                                                        color: '#4b5563',
                                                        font: { size: 10, weight: 'bold' },
                                                        callback: (value: string | number) => {
                                                            const numValue = typeof value === 'string' ? parseFloat(value) : value;
                                                            const m = Math.floor(numValue);
                                                            const s = Math.round((numValue - m) * 60);
                                                            return `${m}:${s.toString().padStart(2, '0')}`;
                                                        }
                                                    }
                                                },
                                                y1: {
                                                    position: 'right',
                                                    grid: { display: false },
                                                    min: 80,
                                                    max: 200,
                                                    ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' } }
                                                }
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-600 text-[10px] font-black uppercase tracking-widest">
                                        GPS stream data not available
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 flex justify-between items-center text-[10px] text-gray-600 font-black uppercase tracking-[0.2em] px-12">
                                <span>0</span>
                                <span>kilometers</span>
                                <span>{(activity.distance / 1000).toFixed(0)}</span>
                            </div>
                        </div>

                        {/* Histograms Section */}
                        <div className="grid grid-cols-2 gap-12 pt-12 border-t border-white/5">
                            <div>
                                <h3 className="text-sm text-gray-400 font-bold border-b border-white/10 pb-2 mb-8">Nth longest run</h3>
                                <div className="h-44 relative mt-12">
                                    <div className="absolute -left-8 top-1/2 -rotate-90 origin-center text-[10px] text-gray-600 font-black uppercase tracking-widest w-24 text-center">run count</div>
                                    <Bar
                                        data={{
                                            labels: stats.distLabels,
                                            datasets: [{ data: stats.distBins, backgroundColor: '#1d4ed8', borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]
                                        }}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                            scales: { y: { display: true, ticks: { display: false }, grid: { display: true, color: 'rgba(255,255,255,0.03)' } }, x: { display: true, ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' } }, grid: { display: false } } }
                                        }}
                                    />
                                    <div className="absolute pointer-events-none transition-all duration-700" style={{ left: `${(stats.myDistBin / 10) * 100 + 5}%`, bottom: `${(stats.distBins[stats.myDistBin] / Math.max(...stats.distBins)) * 100}%` }}>
                                        <div className="text-3xl font-black text-white -mt-10 -ml-8 drop-shadow-2xl">{stats.distanceRankText}</div>
                                    </div>
                                    <div className="text-center text-[10px] text-gray-600 font-black uppercase tracking-widest mt-4">kilometers</div>
                                </div>
                            </div>

                            <div className="border-l border-white/5 pl-12">
                                <h3 className="text-sm text-gray-400 font-bold border-b border-white/10 pb-2 mb-8">Nth fastest (similar distance)</h3>
                                <div className="h-44 relative mt-12">
                                    <div className="absolute -left-8 top-1/2 -rotate-90 origin-center text-[10px] text-gray-600 font-black uppercase tracking-widest w-24 text-center">run count</div>
                                    <Bar
                                        data={{
                                            labels: stats.paceLabels,
                                            datasets: [{ data: stats.paceBins, backgroundColor: '#1d4ed8', borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]
                                        }}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                            scales: { y: { display: true, ticks: { display: false }, grid: { display: true, color: 'rgba(255,255,255,0.03)' } }, x: { display: true, ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' } }, grid: { display: false } } }
                                        }}
                                    />
                                    <div className="absolute pointer-events-none transition-all duration-700" style={{ left: `${(stats.myPaceBin / 6) * 100 + 8}%`, bottom: `${(stats.paceBins[stats.myPaceBin] / Math.max(...stats.paceBins)) * 100}%` }}>
                                        <div className="text-3xl font-black text-white -mt-10 -ml-8 drop-shadow-2xl">{stats.paceRankText}</div>
                                    </div>
                                    <div className="text-center text-[10px] text-gray-600 font-black uppercase tracking-widest mt-4">pace</div>
                                </div>
                            </div>
                        </div>

                        {/* Final Metrics */}
                        <div className="grid grid-cols-2 gap-12 pt-12 border-t border-white/5">
                            <div>
                                <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Calories</div>
                                <div className="text-4xl font-black text-white">{stats.calories}</div>
                            </div>
                            <div className="border-l border-white/5 pl-12">
                                <div className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">Food Equivalent</div>
                                <div className="text-3xl font-black text-white">{stats.foodCount} {stats.food.name}</div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-12">
                        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 shadow-xl">
                            <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Notable</h3>
                            <ul className="space-y-4 text-sm text-white/80 font-bold">
                                {stats.notables.map((note, idx) => (
                                    <li key={idx} className="flex gap-3 leading-relaxed">
                                        <span className="text-emerald-500 mt-0.5">•</span>
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="pt-8 border-t border-white/5">
                            <h3 className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-6">Fastest {stats.clusterLabel} km runs</h3>
                            <div className="space-y-1">
                                {stats.top10.map(r => (
                                    <div key={r.id} className={`flex items-center gap-4 py-2.5 px-3 rounded-xl transition-all ${r.isCurrent ? 'bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/5' : 'hover:bg-white/[0.03] border border-transparent'}`}>
                                        <div className="w-8 shrink-0">
                                            <div className="h-1.5 w-full bg-gray-800 relative overflow-hidden rounded-full">
                                                <div className={`absolute inset-y-0 left-0 ${r.recencyColor === 'bg-white' ? 'bg-emerald-400' : r.recencyColor.replace('bg-', 'bg-')}`} style={{ width: `${Math.max(20, 100 - (r.rawPace / 10 * 100))}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex-1 text-sm font-black text-white/90">{r.pace}<span className="text-[9px] text-gray-600 font-bold ml-1">/km</span></div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-gray-500 font-mono">{r.date}</div>
                                            <div className={`h-1 w-4 rounded-full mt-1.5 ml-auto ${r.recencyColor}`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
