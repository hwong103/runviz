import { Suspense } from 'react';

import type { Activity } from '@/types/activity';
import type { ViewPeriod } from '@/lib/dashboard';
import { VDOTPanel } from '@/features/dashboard/lazyDashboardPanels';
import { PanelFallback } from '@/features/dashboard/components/PanelFallback';

interface RaceWorkspaceProps {
    activities: Activity[];
    viewPeriod: ViewPeriod;
    maxHR: number;
    mostRecentActivityId?: number;
}

export function RaceWorkspace({
    activities,
    viewPeriod,
    maxHR,
    mostRecentActivityId,
}: RaceWorkspaceProps) {
    return (
        <Suspense fallback={<PanelFallback title="Race Prediction" subtitle="Loading VDOT and pacing" />}>
            <VDOTPanel
                activities={activities}
                allActivities={activities}
                period={viewPeriod}
                maxHR={maxHR}
                mostRecentActivityId={mostRecentActivityId}
            />
        </Suspense>
    );
}
