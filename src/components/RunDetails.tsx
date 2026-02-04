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
import type { Activity, ActivityStreams, Gear } from '../types';
import { isRun } from '../types';
import { format, parseISO } from 'date-fns';
import { activities as activitiesApi, gear as gearApi } from '../services/api';

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
    shoes: Gear[];
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

function formatPace(paceMinKm: number) {
    if (!paceMinKm || isNaN(paceMinKm) || !isFinite(paceMinKm)) return '--:--';
    const min = Math.floor(paceMinKm);
    const sec = Math.round((paceMinKm - min) * 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function RunDetails({ activity: initialActivity, allActivities, shoes, onClose }: RunDetailsProps) {
    const [activity, setActivity] = useState<Activity>(initialActivity);
    const [streams, setStreams] = useState<ActivityStreams | null>(null);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [viewMode, setViewMode] = useState<'stream' | 'splits'>('stream');
    const [fetchedShoe, setFetchedShoe] = useState<Gear | null>(null);

    // Fetch gear details if they are missing from props
    useEffect(() => {
        if (!activity.gear_id) return;

        const knownShoe = shoes.find(s => s.id === activity.gear_id);
        if (knownShoe) return;

        // Valid gear ID but not in props? Fetch it!
        // Strava gear IDs usually start with 'g' or 's' (shoes/gear)
        if (activity.gear_id.startsWith('g') || activity.gear_id.startsWith('s')) {
            gearApi.get(activity.gear_id)
                .then(setFetchedShoe)
                .catch(err => console.error("Failed to fetch gear", err));
        }
    }, [activity.gear_id, shoes]);

    useEffect(() => {
        const fetchData = async () => {
            setLoadingStreams(true);
            try {
                const fullActivity = await activitiesApi.get(initialActivity.id);
                if (fullActivity) setActivity(fullActivity);
                const streamData = await activitiesApi.getStreams(initialActivity.id);
                setStreams(streamData);
            } catch (err) {
                console.error("Failed to fetch detailed activity data:", err);
            } finally {
                setLoadingStreams(false);
            }
        };
        fetchData();
    }, [initialActivity.id]);

    const runs = useMemo(() =>
        allActivities.filter(isRun)
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
        const paceBinSize = Math.max((maxPace - minPace) / paceBinCount, 0.1);

        const paceBins = new Array(paceBinCount).fill(0);
        const paceLabels = [];
        for (let i = 0; i < paceBinCount; i++) {
            const p = minPace + (i * paceBinSize);
            paceLabels.push(formatPace(p));
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

        const calories = activity.calories || (activity.kilojoules ? Math.round(activity.kilojoules) : Math.round((activity.distance / 1000) * 70)); // 70 is a rough default for kcal/km
        // Use activity.id as a seed to keep food choice consistent for the same run
        const food = FOOD_EQUIVALENTS[activity.id % FOOD_EQUIVALENTS.length];
        const foodCount = (calories / food.cals).toFixed(1);

        const clusterLabel = Math.round(targetDist);
        const top10 = similarSortedByPace.slice(0, 15).map(r => {
            const p = (r.moving_time / r.distance) * 1000 / 60;
            const isCurrent = r.id === activity.id;
            const date = parseLocalTime(r.start_date_local);

            const daysAgo = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            let recencyColor = 'bg-gray-700';
            if (daysAgo < 30) recencyColor = 'bg-white';
            else if (daysAgo < 90) recencyColor = 'bg-emerald-400';
            else if (daysAgo < 180) recencyColor = 'bg-emerald-600';

            return {
                id: r.id,
                pace: formatPace(p),
                date: format(date, 'd/MM/yy'),
                isCurrent,
                recencyColor,
                rawPace: p
            };
        });



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
            avgPaceLabel: formatPace((activity.moving_time / activity.distance) * 1000 / 60),
            currentShoe: shoes.find(s => s.id === activity.gear_id) || fetchedShoe
        };
    }, [activity, runs, shoes, fetchedShoe]);

    const chartData = useMemo(() => {
        if (!streams?.velocity_smooth?.data || !streams.distance?.data) return null;

        if (viewMode === 'splits') {
            const splits = [];
            let currentSplitDist = 0;
            let currentSplitTime = 0;
            let currentSplitHR = 0;
            let hrCount = 0;
            let lastDist = 0;
            let lastTime = 0;

            for (let i = 0; i < streams.distance.data.length; i++) {
                const d = streams.distance.data[i];
                const t = streams.time?.data[i] || 0;
                const hr = streams.heartrate?.data[i];

                currentSplitDist += (d - lastDist);
                currentSplitTime += (t - lastTime);
                if (hr) {
                    currentSplitHR += hr;
                    hrCount++;
                }

                if (currentSplitDist >= 1000 || i === streams.distance.data.length - 1) {
                    const pace = (currentSplitTime / currentSplitDist) * 1000 / 60;
                    splits.push({
                        distance: Math.round(d / 1000),
                        pace,
                        hr: hrCount > 0 ? Math.round(currentSplitHR / hrCount) : null
                    });
                    currentSplitDist = 0;
                    currentSplitTime = 0;
                    currentSplitHR = 0;
                    hrCount = 0;
                }
                lastDist = d;
                lastTime = t;
            }

            return {
                labels: splits.map(s => s.distance.toString()),
                datasets: [
                    {
                        type: 'bar' as const,
                        label: 'Pace',
                        data: splits.map(s => s.pace),
                        backgroundColor: '#065f46',
                        borderRadius: 4,
                        yAxisID: 'y',
                        base: Math.ceil(Math.max(...splits.map(s => s.pace), 8)) + 1,
                    },
                    {
                        type: 'line' as const,
                        label: 'Heart Rate',
                        data: splits.map(s => s.hr),
                        borderColor: '#ffffff',
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0,
                        pointRadius: 4,
                        pointBackgroundColor: '#ffffff',
                        borderWidth: 2,
                        yAxisID: 'y1',
                    }
                ],
                paces: splits.map(s => s.pace)
            };
        } else {
            const rawPoints = streams.velocity_smooth.data.length;
            const step = Math.max(1, Math.floor(rawPoints / 120));
            const velocityData = [];
            const hrData = [];
            const distances = [];

            for (let i = 0; i < rawPoints; i += step) {
                const dist = streams.distance.data[i];
                const speed = streams.velocity_smooth.data[i];
                const hr = streams.heartrate?.data ? streams.heartrate.data[i] : null;

                if (speed <= 0.5) continue;
                const pace = (1 / speed) * 1000 / 60;
                if (pace > 15) continue;

                velocityData.push(pace);
                hrData.push(hr);
                distances.push(dist / 1000);
            }

            return {
                labels: distances,
                datasets: [
                    {
                        type: 'bar' as const,
                        label: 'Pace',
                        data: velocityData,
                        backgroundColor: '#064e3b',
                        hoverBackgroundColor: '#065f46',
                        borderRadius: 0,
                        barPercentage: 1.0,
                        categoryPercentage: 1.0,
                        yAxisID: 'y',
                        base: Math.ceil(Math.max(...velocityData, 8)) + 1,
                    },
                    {
                        type: 'line' as const,
                        label: 'Heart Rate',
                        data: hrData,
                        borderColor: '#ffffff',
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0,
                        borderWidth: 2,
                        yAxisID: 'y1',
                    }
                ],
                paces: velocityData
            };
        }
    }, [streams, viewMode]);

    const chartOptions = useMemo(() => {
        if (!chartData) return {};
        const paces = chartData.paces.filter(p => !isNaN(p) && isFinite(p));
        const minPaceFound = Math.min(...paces);
        const maxPaceFound = Math.max(...paces);
        const paceMin = Math.max(0, Math.floor(minPaceFound) - 1);
        const paceMax = Math.ceil(maxPaceFound) + 1;

        return {
            maintainAspectRatio: false,
            layout: { padding: { left: 20, right: 20, top: 20, bottom: 0 } },
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    titleFont: { size: 11, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 12,
                    callbacks: {
                        label: (context: any) => {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.yAxisID === 'y') label += formatPace(context.parsed.y);
                            else label += Math.round(context.parsed.y) + ' bpm';
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: viewMode === 'stream' ? 'linear' : 'category',
                    display: true,
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' }, maxTicksLimit: 12, callback: (value: any) => viewMode === 'stream' ? Math.round(value) : value },
                    title: { display: true, text: 'KILOMETERS', color: '#4b5563', font: { size: 10, weight: 'black' }, padding: { top: 10 } }
                },
                y: {
                    reverse: true,
                    position: 'left' as const,
                    min: paceMin,
                    max: paceMax,
                    grid: { color: 'rgba(255,255,255,0.03)', drawTicks: false },
                    border: { display: false },
                    ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' }, padding: 10, callback: (value: number | string) => formatPace(typeof value === 'string' ? parseFloat(value) : value) },
                    title: { display: true, text: 'PACE', color: '#4b5563', font: { size: 10, weight: 'black' }, padding: { bottom: 10 } }
                },
                y1: {
                    position: 'right' as const,
                    grid: { display: false },
                    min: 80,
                    max: 200,
                    border: { display: false },
                    ticks: { color: '#4b5563', font: { size: 10, weight: 'bold' }, padding: 10 },
                    title: { display: true, text: 'HEART RATE', color: '#4b5563', font: { size: 10, weight: 'black' }, padding: { bottom: 10 } }
                }
            }
        };
    }, [chartData, viewMode]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0c10]/95 backdrop-blur-xl p-4 overflow-y-auto">
            <div className="bg-[#0e1117] w-full max-w-6xl rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
                <div className="flex items-center justify-between px-8 py-3 border-b border-white/5 bg-black/20">
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Run Details Analysis</div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => console.log('DEBUG ACTIVITY JSON:', activity)}
                            className="text-[9px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-gray-400 px-3 py-1 rounded transition-colors"
                        >
                            Log JSON
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white font-black text-xl px-4 py-2 transition-colors">✕</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-10">
                    {/* Header: Compact Row */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-8 items-end border-b border-white/5 pb-10">
                        <div className="lg:col-span-2 self-start">
                            <h1 className="text-4xl font-black text-white/90 tracking-tighter italic mb-2 leading-tight">{activity.name}</h1>
                            <div className="text-gray-500 text-xs font-black uppercase tracking-widest">{format(activityDate, 'eeee, d MMM y').toUpperCase()}</div>
                            {stats.currentShoe && (
                                <div className="text-emerald-400 text-xs font-black uppercase tracking-widest mt-3 flex items-center gap-2 bg-emerald-500/10 w-fit px-3 py-1.5 rounded-lg border border-emerald-500/20">
                                    <span className="text-sm">
                                        {stats.currentShoe.brand_name?.includes('Hoka') || stats.currentShoe.brand_name?.includes('HOKA') ? '🦅' :
                                            stats.currentShoe.brand_name?.includes('Nike') ? '✔️' :
                                                stats.currentShoe.brand_name?.includes('Saucony') ? '🏃' :
                                                    stats.currentShoe.brand_name?.includes('New Balance') ? 'NB' :
                                                        stats.currentShoe.brand_name?.includes('Asics') || stats.currentShoe.brand_name?.includes('ASICS') ? '🌀' :
                                                            '👟'}
                                    </span>
                                    {stats.currentShoe.name}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1">Distance</div>
                            <div className="text-2xl font-black text-white">{(activity.distance / 1000).toFixed(2)}<span className="text-gray-500 text-sm font-medium ml-1">km</span></div>
                        </div>
                        <div>
                            <div className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1">Avg Pace</div>
                            <div className="text-2xl font-black text-white">{stats.avgPaceLabel}<span className="text-gray-500 text-sm font-medium ml-1">/km</span></div>
                        </div>
                        <div className="relative">
                            <div className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1">Calories</div>
                            <div className="text-2xl font-black text-white">{stats.calories}</div>
                            <div className="absolute top-full left-0 text-emerald-500/80 text-[10px] font-bold truncate mt-1 whitespace-nowrap">{stats.foodCount} {stats.food.name}</div>
                        </div>

                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                        {/* Primary Content Column */}
                        <div className="lg:col-span-8 space-y-12">
                            {/* Performance Chart */}
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Performance Analysis</h3>
                                    <button
                                        onClick={() => setViewMode(v => v === 'stream' ? 'splits' : 'stream')}
                                        className={`rounded px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-colors ${viewMode === 'splits' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                    >
                                        {viewMode === 'splits' ? 'Splits View' : 'Live Stream'}
                                    </button>
                                </div>
                                <div className="h-64 bg-black/40 rounded-3xl border border-white/5 p-4 relative">
                                    {loadingStreams ? (
                                        <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
                                    ) : chartData ? (
                                        <Chart type='bar' data={chartData as any} options={chartOptions as any} />
                                    ) : <div className="flex items-center justify-center h-full text-gray-600 text-[10px] font-black uppercase tracking-widest">Performance data not available</div>}
                                </div>
                            </div>

                            {/* Histograms: Side by Side */}
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h3 className="text-[9px] text-gray-600 font-black uppercase tracking-widest border-b border-white/5 pb-2 mb-6">Nth longest run</h3>
                                    <div className="h-40 relative">
                                        <Bar
                                            data={{
                                                labels: stats.distLabels,
                                                datasets: [{ data: stats.distBins, backgroundColor: '#065f46', borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]
                                            }}
                                            options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { y: { display: false }, x: { display: true, ticks: { color: '#4b5563', font: { size: 9, weight: 'bold' } }, grid: { display: false } } } }}
                                        />
                                        <div className="absolute pointer-events-none" style={{ left: `${(stats.myDistBin / 10) * 100 + 5}%`, bottom: `${(stats.distBins[stats.myDistBin] / Math.max(...stats.distBins)) * 100}%` }}>
                                            <div className="text-2xl font-black text-emerald-400 -mt-8 -ml-4 drop-shadow-2xl">{stats.distanceRankText}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-l border-white/5 pl-8">
                                    <h3 className="text-[9px] text-gray-600 font-black uppercase tracking-widest border-b border-white/5 pb-2 mb-6">Nth fastest (similar dist)</h3>
                                    <div className="h-40 relative">
                                        <Bar
                                            data={{
                                                labels: stats.paceLabels,
                                                datasets: [{ data: stats.paceBins, backgroundColor: '#065f46', borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]
                                            }}
                                            options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { y: { display: false }, x: { display: true, ticks: { color: '#4b5563', font: { size: 8, weight: 'bold' } }, grid: { display: false } } } }}
                                        />
                                        <div className="absolute pointer-events-none" style={{ left: `${(stats.myPaceBin / 6) * 100 + 8}%`, bottom: `${(stats.paceBins[stats.myPaceBin] / Math.max(...stats.paceBins)) * 100}%` }}>
                                            <div className="text-2xl font-black text-emerald-400 -mt-8 -ml-4 drop-shadow-2xl">{stats.paceRankText}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Similar Runs Column */}
                        <div className="lg:col-span-4 border-l border-white/5 pl-8">
                            <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-6">Comparison: {stats.clusterLabel}km runs</h3>
                            <div className="space-y-1">
                                {stats.top10.map(r => (
                                    <div key={r.id} className={`flex items-center gap-4 py-2 px-3 rounded-lg transition-all ${r.isCurrent ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-white/[0.03] border border-transparent'}`}>
                                        <div className="w-8 shrink-0"><div className="h-1 w-full bg-gray-800 relative overflow-hidden rounded-full"><div className={`absolute inset-y-0 left-0 ${r.recencyColor === 'bg-white' ? 'bg-emerald-400' : r.recencyColor}`} style={{ width: `${Math.max(20, 100 - (r.rawPace / 10 * 100))}%` }} /></div></div>
                                        <div className="flex-1 text-sm font-black text-white/90">{r.pace}<span className="text-[9px] text-gray-600 font-bold ml-1">/km</span></div>
                                        <div className="text-[10px] font-black text-gray-500 font-mono">{r.date}</div>
                                        <div className={`h-1 w-3 rounded-full ${r.recencyColor}`} />
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
