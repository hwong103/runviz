import { Suspense } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';
import type {
    TrainingWorkspace as TrainingWorkspaceTab,
    ViewPeriod,
} from '@/lib/dashboard';
import {
    CadenceTrendChart,
    FitnessChart,
    MileageTrendChart,
    ShoeTracker,
    WeeklyRampChart,
} from '@/features/dashboard/lazyDashboardPanels';
import { PanelFallback } from '@/features/dashboard/components/PanelFallback';
import { StatsOverviewPanel as StatsOverview } from '@/features/dashboard/stats/StatsOverviewPanel';

const workspaceTabTriggerClass =
    'min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-[0.8rem] text-foreground/75 hover:text-foreground sm:px-4 sm:py-2 sm:text-sm data-[state=active]:!border-foreground/20 data-[state=active]:!bg-foreground data-[state=active]:!text-background dark:data-[state=active]:!bg-foreground dark:data-[state=active]:!text-background';

interface TrainingWorkspaceProps {
    activities: Activity[];
    filteredActivities: Activity[];
    runActivities: Activity[];
    allShoes: Gear[];
    selectedShoeId: string | null;
    onSelectShoe: (id: string) => void;
    trainingWorkspace: TrainingWorkspaceTab;
    onTrainingWorkspaceChange: (workspace: TrainingWorkspaceTab) => void;
    viewPeriod: ViewPeriod;
    maxHR: number;
    mostRecentActivityId?: number;
}

export function TrainingWorkspace({
    activities,
    filteredActivities,
    runActivities,
    allShoes,
    selectedShoeId,
    onSelectShoe,
    trainingWorkspace,
    onTrainingWorkspaceChange,
    viewPeriod,
    maxHR,
    mostRecentActivityId,
}: TrainingWorkspaceProps) {
    return (
        <Tabs
            value={trainingWorkspace}
            onValueChange={(value) => onTrainingWorkspaceChange(value as TrainingWorkspaceTab)}
            className="space-y-4"
        >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <p className="rv-kicker mb-2">Training Views</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Start with block health, then move into the chart or mechanics view you want.
                    </p>
                </div>
                <TabsList variant="line" className="grid h-auto w-full grid-cols-4 gap-2 bg-transparent p-0 sm:flex sm:w-auto sm:flex-wrap sm:justify-start">
                    <TabsTrigger value="health" className={workspaceTabTriggerClass}>
                        Health
                    </TabsTrigger>
                    <TabsTrigger value="fitness" className={workspaceTabTriggerClass}>
                        Fitness
                    </TabsTrigger>
                    <TabsTrigger value="volume" className={workspaceTabTriggerClass}>
                        Volume
                    </TabsTrigger>
                    <TabsTrigger value="mechanics" className={workspaceTabTriggerClass}>
                        Mechanics
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="health" className="mt-0">
                <StatsOverview
                    activities={filteredActivities}
                    allActivities={activities}
                    period={viewPeriod}
                    variant="training"
                    mostRecentActivityId={mostRecentActivityId}
                    maxHR={maxHR}
                />
            </TabsContent>
            <TabsContent value="fitness" className="mt-0">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                    <Suspense fallback={<PanelFallback title="Fitness" subtitle="Loading training load" heightClassName="h-72" />}>
                        <FitnessChart
                            activities={activities}
                            allActivities={activities}
                            period={viewPeriod}
                            maxHR={maxHR}
                            mostRecentActivityId={mostRecentActivityId}
                        />
                    </Suspense>
                    <Suspense fallback={<PanelFallback title="Weekly Ramp" subtitle="Loading weekly changes" heightClassName="h-[320px]" />}>
                        <WeeklyRampChart activities={activities} />
                    </Suspense>
                </div>
            </TabsContent>
            <TabsContent value="volume" className="mt-0">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.75fr)]">
                    <Suspense fallback={<PanelFallback title="Mileage" subtitle="Loading volume trends" heightClassName="h-[400px]" />}>
                        <MileageTrendChart
                            activities={activities}
                            allActivities={activities}
                            period={viewPeriod}
                            maxHR={maxHR}
                            mostRecentActivityId={mostRecentActivityId}
                        />
                    </Suspense>
                    <Suspense fallback={<PanelFallback title="Weekly Ramp" subtitle="Loading weekly changes" heightClassName="h-[320px]" />}>
                        <WeeklyRampChart activities={activities} />
                    </Suspense>
                </div>
            </TabsContent>
            <TabsContent value="mechanics" className="mt-0">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
                    <Suspense fallback={<PanelFallback title="Cadence" subtitle="Loading run mechanics" />}>
                        <CadenceTrendChart activities={activities} />
                    </Suspense>
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
            </TabsContent>
        </Tabs>
    );
}
