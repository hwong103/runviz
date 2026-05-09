import { Suspense, useMemo } from 'react';

import { CalendarIcon } from '@radix-ui/react-icons';

import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';
import type { ViewPeriod } from '@/lib/dashboard';
import { ShoeTracker } from '@/features/dashboard/lazyDashboardPanels';
import { PanelFallback } from '@/features/dashboard/components/PanelFallback';
import { ActivityList } from '@/features/dashboard/logbook/ActivityList';
import { CalendarHeatmap } from '@/features/dashboard/logbook/CalendarHeatmap';

interface LogbookWorkspaceProps {
    filteredActivities: Activity[];
    runActivities: Activity[];
    allShoes: Gear[];
    selectedActivity: Activity | null;
    selectedShoeId: string | null;
    selectedShoeName?: string;
    viewPeriod: ViewPeriod;
    maxHR: number;
    onSelectActivity: (activity: Activity | null) => void;
    onSelectShoe: (id: string) => void;
    onClearShoeFilter: () => void;
}

function buildRelativeWindow(viewPeriod: ViewPeriod) {
    if (viewPeriod.mode === '30d') {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        return { startDate: date, endDate: new Date() };
    }

    if (viewPeriod.mode === '90d') {
        const date = new Date();
        date.setDate(date.getDate() - 90);
        return { startDate: date, endDate: new Date() };
    }

    if (viewPeriod.mode === '365d') {
        const date = new Date();
        date.setDate(date.getDate() - 365);
        return { startDate: date, endDate: new Date() };
    }

    return { startDate: undefined, endDate: undefined };
}

export function LogbookWorkspace({
    filteredActivities,
    runActivities,
    allShoes,
    selectedActivity,
    selectedShoeId,
    selectedShoeName,
    viewPeriod,
    maxHR,
    onSelectActivity,
    onSelectShoe,
    onClearShoeFilter,
}: LogbookWorkspaceProps) {
    const relativeWindow = useMemo(() => buildRelativeWindow(viewPeriod), [viewPeriod]);

    const handleSelectDay = (dateStr: string) => {
        const activity = filteredActivities.find((candidate) =>
            candidate.start_date_local.startsWith(dateStr)
        );
        onSelectActivity(activity ?? null);
    };

    return (
        <section className="min-w-0 space-y-4 overflow-x-hidden">
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                <div className="min-w-0">
                    <div className="mb-3 flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-[var(--rv-blue)]" />
                        <p className="rv-kicker">Calendar</p>
                    </div>
                    <p className="mb-4 text-sm leading-6 text-muted-foreground xl:max-w-[72ch]">
                        Scan the whole block at a glance, then drop into the daily log or shoe rotation below.
                    </p>
                    <CalendarHeatmap
                        activities={filteredActivities}
                        year={viewPeriod.mode !== 'all' && !['30d', '90d', '365d'].includes(viewPeriod.mode) ? viewPeriod.year : undefined}
                        month={viewPeriod.mode === 'month' ? (viewPeriod.month ?? undefined) : undefined}
                        startDate={relativeWindow.startDate}
                        endDate={relativeWindow.endDate}
                        onSelectDay={handleSelectDay}
                        selectedDate={selectedActivity?.start_date_local.split('T')[0]}
                    />
                </div>
                <Suspense fallback={<PanelFallback title="Shoes" subtitle="Loading equipment log" />}>
                    <ShoeTracker
                        activities={filteredActivities}
                        allActivities={runActivities}
                        shoes={allShoes}
                        selectedShoeId={selectedShoeId}
                        onSelectShoe={onSelectShoe}
                    />
                </Suspense>
            </div>

            <ActivityList
                activities={filteredActivities}
                limit={50}
                onSelect={onSelectActivity}
                selectedShoeId={selectedShoeId}
                selectedShoeName={selectedShoeName}
                onClearShoeFilter={onClearShoeFilter}
                shoes={allShoes}
                maxHR={maxHR}
            />
        </section>
    );
}
