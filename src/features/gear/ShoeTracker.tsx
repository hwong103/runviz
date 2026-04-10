import { useMemo, useState, useEffect } from 'react';
import { Footprints } from 'lucide-react';
import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';
import { gear as gearApi } from '@/services/api/gearApi';
import { Badge } from '@/components/ui/Badge';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { SectionHeader } from '@/components/ui/SectionHeader';

interface ShoeTrackerProps {
    activities: Activity[];
    allActivities: Activity[];
    shoes: Gear[];
    selectedShoeId?: string | null;
    onSelectShoe?: (id: string) => void;
}

export function ShoeTracker({ activities, allActivities, shoes, selectedShoeId, onSelectShoe }: ShoeTrackerProps) {
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
        const lifetimeDistancesFromActivities = new Map<string, number>();

        activities.forEach(activity => {
            const gearId = activity.gear_id;
            if (gearId) {
                const currentDist = periodDistances.get(gearId) || 0;
                periodDistances.set(gearId, currentDist + activity.distance);
            }
        });

        allActivities.forEach(activity => {
            const gearId = activity.gear_id;
            if (gearId) {
                const currentDist = lifetimeDistancesFromActivities.get(gearId) || 0;
                lifetimeDistancesFromActivities.set(gearId, currentDist + activity.distance);
            }
        });

        const allKnownIds = new Set([
            ...Array.from(gearLibrary.keys()),
            ...Array.from(periodDistances.keys()),
            ...Array.from(lifetimeDistancesFromActivities.keys())
        ]);

        return Array.from(allKnownIds)
            .map(id => {
                const shoe = gearLibrary.get(id);
                const pDist = (periodDistances.get(id) || 0) / 1000;
                const activityLifetimeDistance = (lifetimeDistancesFromActivities.get(id) || 0) / 1000;
                const apiLifetimeDistance = (shoe?.distance || 0) / 1000;

                return {
                    id,
                    name: shoe?.name || `Unknown Shoe`,
                    brand_name: shoe?.brand_name,
                    primary: shoe?.primary || false,
                    lifetimeDistance: Math.max(apiLifetimeDistance, activityLifetimeDistance),
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
    }, [activities, allActivities, shoes, fetchedGear]);

    const pairLabel = `${shoeStats.length} ${shoeStats.length === 1 ? 'pair' : 'pairs'}`;

    return (
        <div className="rv-panel flex flex-col px-6 py-6 sm:px-7">
            <SectionHeader
                className="mb-8"
                kicker="Equipment Log"
                title="Shoe tracker"
                titleAs="h3"
                titleClassName="text-2xl font-bold tracking-tight text-[var(--rv-text)]"
                action={<Badge>{pairLabel}</Badge>}
            />

            <div className="flex-1 space-y-4">
                {shoeStats.length > 0 ? (
                    shoeStats.map(shoe => (
                        <button
                            key={shoe.id}
                            type="button"
                            onClick={() => onSelectShoe?.(shoe.id)}
                            className={`group block w-full rounded-[1.7rem] border p-5 text-left transition-all focus-visible:border-[var(--rv-blue)] ${selectedShoeId === shoe.id
                                ? 'bg-[var(--rv-blue)]/10 border-[var(--rv-blue)] ring-1 ring-[var(--rv-blue)]/40'
                                : 'bg-[var(--rv-bg-panel)] border-[var(--rv-border)] hover:border-[var(--rv-border-strong)]'
                                }`}
                            aria-pressed={selectedShoeId === shoe.id}
                            aria-label={`${selectedShoeId === shoe.id ? 'Clear' : 'Filter by'} shoe ${shoe.name}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1 min-w-0 mr-2">
                                    <div className="flex gap-3 items-start">
                                        <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl border border-[var(--rv-border)] bg-[var(--rv-bg-elevated)] p-1.5 transition-colors group-hover:border-[var(--rv-blue)]/30">
                                            <BrandLogo key={shoe.brand_name} brandName={shoe.brand_name} className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-black text-[var(--rv-text)] transition-colors uppercase tracking-tight truncate leading-tight group-hover:text-[var(--rv-blue)]">
                                                {shoe.name}
                                            </h4>
                                            {shoe.brand_name && (
                                                <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">
                                                    {shoe.brand_name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    {shoe.primary && (
                                        <Badge tone="blue">Primary</Badge>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Period</div>
                                    <div className="text-lg font-black text-[var(--rv-text)] transition-colors group-hover:text-[var(--rv-blue)]">
                                        {shoe.periodDistance.toFixed(1)}
                                        <span className="ml-1 text-[10px] font-bold uppercase text-[var(--rv-text-faint)]">km</span>
                                    </div>
                                </div>
                                <div className="border-l border-[var(--rv-border)] pl-4">
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--rv-text-faint)]">Lifetime</div>
                                    <div className="text-lg font-black text-[var(--rv-text-dim)]">
                                        {shoe.lifetimeDistance > 0 ? shoe.lifetimeDistance.toFixed(0) : '---'}
                                        <span className="ml-1 text-[10px] font-bold uppercase text-[var(--rv-text-faint)]">km</span>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar for Lifetime (assuming 800km lifespan) */}
                            {shoe.lifetimeDistance > 0 && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-[8px] font-black uppercase tracking-widest mb-1.5">
                                        <span className="text-[var(--rv-text-faint)]">Lifespan</span>
                                        <span className={shoe.lifetimeDistance > 700 ? 'text-orange-400' : 'text-gray-500'}>
                                            {Math.min(100, Math.round((shoe.lifetimeDistance / 800) * 100))}%
                                        </span>
                                    </div>
                                    <div className="h-1 w-full rounded-full overflow-hidden bg-[var(--rv-bg-elevated)]">
                                        <div
                                            className={`h-full transition-all duration-1000 ${shoe.lifetimeDistance > 800 ? 'bg-red-500' :
                                                shoe.lifetimeDistance > 700 ? 'bg-orange-500' :
                                                    'bg-[var(--rv-blue)]'
                                                }`}
                                            style={{ width: `${Math.min(100, (shoe.lifetimeDistance / 800) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </button>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-10 text-center opacity-50">
                        <Footprints className="mb-4 h-10 w-10 text-[var(--rv-text-faint)]" />
                        <p className="text-xs font-black uppercase tracking-widest italic text-[var(--rv-text-dim)]">No shoes used in this period</p>
                    </div>
                )}
            </div>
        </div>
    );
}
