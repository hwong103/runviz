import { useMemo } from 'react';
import type { Activity, Gear } from '../types';

interface ShoeTrackerProps {
    activities: Activity[];
    shoes: Gear[];
}

export function ShoeTracker({ activities, shoes }: ShoeTrackerProps) {
    const shoeStats = useMemo(() => {
        // Map of gear_id to period distance (meters)
        const periodStats = new Map<string, number>();

        activities.forEach(activity => {
            if (activity.gear_id) {
                const current = periodStats.get(activity.gear_id) || 0;
                periodStats.set(activity.gear_id, current + activity.distance);
            }
        });

        // Filter out bikes, just in case. Strava gear IDs for shoes usually start with 'g'
        const runShoes = shoes.filter(s => s.id.startsWith('g'));

        return runShoes
            .map(shoe => ({
                ...shoe,
                periodDistance: (periodStats.get(shoe.id) || 0) / 1000,
                lifetimeDistance: shoe.distance / 1000,
            }))
            .sort((a, b) => {
                // Prioritize shoes used in this period, then by lifetime distance
                if (b.periodDistance !== a.periodDistance) {
                    return b.periodDistance - a.periodDistance;
                }
                return b.lifetimeDistance - a.lifetimeDistance;
            });
    }, [activities, shoes]);

    return (
        <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/10 shadow-2xl h-full flex flex-col">
            <h3 className="text-xl font-black text-white mb-8 flex items-center gap-3 tracking-tight">
                <span className="text-2xl">👟</span>
                SHOE TRACKER
            </h3>

            <div className="flex-1 space-y-4">
                {shoeStats.length > 0 ? (
                    shoeStats.map(shoe => (
                        <div key={shoe.id} className="bg-black/40 rounded-2xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{shoe.name}</h4>
                                    {shoe.brand_name && (
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{shoe.brand_name}</span>
                                    )}
                                </div>
                                {shoe.primary && (
                                    <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase">Primary</span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Period</div>
                                    <div className="text-lg font-black text-white group-hover:text-emerald-400 transition-colors">
                                        {shoe.periodDistance.toFixed(1)}
                                        <span className="text-gray-500 text-[10px] font-bold ml-1 uppercase">km</span>
                                    </div>
                                </div>
                                <div className="border-l border-white/5 pl-4">
                                    <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Lifetime</div>
                                    <div className="text-lg font-black text-white/60">
                                        {shoe.lifetimeDistance.toFixed(0)}
                                        <span className="text-gray-600 text-[10px] font-bold ml-1 uppercase">km</span>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar for Lifetime (assuming 800km lifespan) */}
                            <div className="mt-4">
                                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest mb-1.5">
                                    <span className="text-gray-600">Lifespan</span>
                                    <span className={shoe.lifetimeDistance > 700 ? 'text-orange-400' : 'text-gray-500'}>
                                        {Math.min(100, Math.round((shoe.lifetimeDistance / 800) * 100))}%
                                    </span>
                                </div>
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-1000 ${shoe.lifetimeDistance > 700 ? 'bg-orange-500' : 'bg-emerald-500/50'
                                            }`}
                                        style={{ width: `${Math.min(100, (shoe.lifetimeDistance / 800) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-10 text-center opacity-50">
                        <span className="text-4xl mb-4 grayscale">👟</span>
                        <p className="text-gray-400 text-xs font-black uppercase tracking-widest italic">No shoes detected</p>
                        <p className="text-gray-500 text-[9px] mt-2 leading-relaxed font-medium uppercase tracking-tighter">Check your gear settings in Strava</p>
                    </div>
                )}
            </div>
        </div>
    );
}
