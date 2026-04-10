import { Suspense } from 'react';

import { StatsOverview } from '@/components/StatsOverview';
import type { Activity } from '@/types/activity';
import type { ViewPeriod } from '@/lib/dashboard';
import { YearOnYearChart } from '@/features/dashboard/lazyDashboardPanels';
import { PanelFallback } from '@/features/dashboard/components/PanelFallback';

interface OverviewWorkspaceProps {
    activities: Activity[];
    filteredActivities: Activity[];
    viewPeriod: ViewPeriod;
    mostRecentActivityId?: number;
    maxHR: number;
}

export function OverviewWorkspace({
    activities,
    filteredActivities,
    viewPeriod,
    mostRecentActivityId,
    maxHR,
}: OverviewWorkspaceProps) {
    return (
        <section className="space-y-4">
            <StatsOverview
                activities={filteredActivities}
                allActivities={activities}
                period={viewPeriod}
                variant="overview"
                mostRecentActivityId={mostRecentActivityId}
                maxHR={maxHR}
            />
            <Suspense fallback={<PanelFallback title="Year on Year" subtitle="Loading annual comparison" heightClassName="h-[400px]" />}>
                <YearOnYearChart activities={activities} />
            </Suspense>
        </section>
    );
}
