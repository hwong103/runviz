import { useMemo, useState, useEffect } from 'react';
import type { Activity, Gear } from '../types';
import { gear as gearApi } from '../services/api';
import { getBrandLogoUrl, getBrandFallbackEmoji } from '../services/logoService';

interface ShoeTrackerProps {
    activities: Activity[];
    shoes: Gear[];
    selectedShoeId?: string | null;
    onSelectShoe?: (id: string) => void;
}

// Brand logo component with fallback support
function BrandLogo({ brandName, className }: { brandName?: string; className?: string }) {
    const [hasError, setHasError] = useState(false);
    const logoUrl = getBrandLogoUrl(brandName, 48, 'dark');
    const fallbackEmoji = getBrandFallbackEmoji(brandName);

    // State resets automatically when component remounts (controlled by key prop)

    if (!logoUrl || hasError) {
        return <span className={className}>{fallbackEmoji}</span>;
    }

    return (
        <img
            src={logoUrl}
            alt={brandName || 'Brand'}
            className={`${className} object-contain`}
            onError={() => setHasError(true)}
        />
    );
}

export function ShoeTracker({ activities, shoes, selectedShoeId, onSelectShoe }: ShoeTrackerProps) {
    const [fetchedGear, setFetchedGear] = useState<Map<string, Gear>>(new Map());

    // 1. Identify gears that are used but unknown
    const unknownGearIds = useMemo(() => {
        const knownIds = new Set(shoes.map(s => s.id));
        const unknown = new Set<string>();

        activities.forEach(a => {
            if (a.gear_id && !knownIds.has(a.gear_id)) {
                unknown.add(a.gear_id);
            }
        });

        // Filter out IDs we've already fetched
        Array.from(fetchedGear.keys()).forEach(id => unknown.delete(id));

        return Array.from(unknown);
    }, [activities, shoes, fetchedGear]);

    // 2. Lazy fetch unknown gear
    useEffect(() => {
        if (unknownGearIds.length === 0) return;

        unknownGearIds.forEach(async (id) => {
            try {
                // Skip if not a shoe/gear ID
                if (!id.startsWith('g') && !id.startsWith('s')) return;

                const gear = await gearApi.get(id);
                setFetchedGear(prev => new Map(prev).set(id, gear));
            } catch (err) {
                console.error(`Failed to fetch gear ${id}`, err);
            }
        });
    }, [unknownGearIds]);

    const shoeStats = useMemo(() => {
        // Build complete library from props + fetched
        const gearLibrary = new Map<string, Gear>();
        shoes.forEach(s => gearLibrary.set(s.id, s));
        fetchedGear.forEach((g, id) => gearLibrary.set(id, g));

        const periodDistances = new Map<string, number>();

        activities.forEach(activity => {
            const gearId = activity.gear_id;
            if (gearId) {
                const currentDist = periodDistances.get(gearId) || 0;
                periodDistances.set(gearId, currentDist + activity.distance);
            }
        });

        const allKnownIds = new Set([
            ...Array.from(gearLibrary.keys()),
            ...Array.from(periodDistances.keys())
        ]);

        return Array.from(allKnownIds)
            .map(id => {
                const shoe = gearLibrary.get(id);
                const pDist = (periodDistances.get(id) || 0) / 1000;

                return {
                    id,
                    name: shoe?.name || `Unknown Shoe`,
                    brand_name: shoe?.brand_name,
                    primary: shoe?.primary || false,
                    lifetimeDistance: (shoe?.distance || 0) / 1000,
                    periodDistance: pDist,
                    isDecoveredFromActivity: !shoe
                };
            })
            // Only show things that look like shoes 
            .filter(s => s.id.startsWith('g') || s.id.startsWith('s'))
            // Filter out unknown shoes with no activity in period (ghosts)
            .filter(s => !s.isDecoveredFromActivity || s.periodDistance > 0)
            // USER REQUEST FIX: Hide shoes if they haven't been used in this period
            // Unless it's "All Time" (which usually means we have all activities anyway)
            // But fundamentally, if periodDistance is 0, user wants it hidden to reduce noise.
            .filter(s => s.periodDistance > 0)
            .sort((a, b) => {
                if (b.periodDistance !== a.periodDistance) return b.periodDistance - a.periodDistance;
                return b.lifetimeDistance - a.lifetimeDistance;
            });
    }, [activities, shoes, fetchedGear]);

    return (
        <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/10 shadow-2xl h-full flex flex-col">
            <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-white flex items-center gap-3 tracking-tight">
                    <span className="text-2xl">👟</span>
                    SHOE TRACKER
                </h3>
                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md">
                    {shoeStats.length} pairs
                </span>
            </div>

            <div className="flex-1 space-y-4">
                {shoeStats.length > 0 ? (
                    shoeStats.map(shoe => (
                        <div
                            key={shoe.id}
                            onClick={() => onSelectShoe?.(shoe.id)}
                            className={`rounded-2xl p-5 border transition-all group cursor-pointer ${selectedShoeId === shoe.id
                                ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/50'
                                : 'bg-black/40 border-white/5 hover:border-emerald-500/30'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1 min-w-0 mr-2">
                                    <div className="flex gap-3 items-start">
                                        <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/5 rounded-xl border border-white/5 p-1.5 group-hover:border-emerald-500/30 transition-colors">
                                            <BrandLogo key={shoe.brand_name} brandName={shoe.brand_name} className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight truncate leading-tight">
                                                {shoe.name}
                                            </h4>
                                            {shoe.brand_name && (
                                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block truncate mt-1">
                                                    {shoe.brand_name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    {shoe.primary && (
                                        <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase">Primary</span>
                                    )}
                                </div>
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
                                        {shoe.lifetimeDistance > 0 ? shoe.lifetimeDistance.toFixed(0) : '---'}
                                        <span className="text-gray-600 text-[10px] font-bold ml-1 uppercase">km</span>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar for Lifetime (assuming 800km lifespan) */}
                            {shoe.lifetimeDistance > 0 && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-[8px] font-black uppercase tracking-widest mb-1.5">
                                        <span className="text-gray-600">Lifespan</span>
                                        <span className={shoe.lifetimeDistance > 700 ? 'text-orange-400' : 'text-gray-500'}>
                                            {Math.min(100, Math.round((shoe.lifetimeDistance / 800) * 100))}%
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-1000 ${shoe.lifetimeDistance > 800 ? 'bg-red-500' :
                                                shoe.lifetimeDistance > 700 ? 'bg-orange-500' :
                                                    'bg-emerald-500/50'
                                                }`}
                                            style={{ width: `${Math.min(100, (shoe.lifetimeDistance / 800) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-10 text-center opacity-50">
                        <span className="text-4xl mb-4 grayscale">👟</span>
                        <p className="text-gray-400 text-xs font-black uppercase tracking-widest italic">No shoes used in this period</p>
                    </div>
                )}
            </div>
        </div>
    );
}
