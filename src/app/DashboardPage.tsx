import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PeriodComboButton } from '@/components/ui/PeriodComboButton';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AppShell } from '@/components/layout/app-shell';
import type { Activity } from '@/types/activity';
import type { Gear } from '@/types/gear';
import {
    DASHBOARD_WORKSPACE_META,
    describeViewPeriod,
    formatLastSync,
    type DashboardWorkspace,
    type TrainingWorkspace,
    type ViewPeriod,
} from '@/lib/dashboard';
import { ChevronDown } from 'lucide-react';
import { Suspense, type Dispatch, type SetStateAction } from 'react';

import { ModalFallback } from '@/features/dashboard/components/ModalFallback';
import { HeatmapWorkspace, RunDetails } from '@/features/dashboard/lazyDashboardPanels';
import { LogbookWorkspace } from '@/features/dashboard/workspaces/LogbookWorkspace';
import { OverviewWorkspace } from '@/features/dashboard/workspaces/OverviewWorkspace';
import { RaceWorkspace } from '@/features/dashboard/workspaces/RaceWorkspace';
import { ToolsWorkspace } from '@/features/dashboard/workspaces/ToolsWorkspace';
import { TrainingWorkspace as TrainingWorkspaceSection } from '@/features/dashboard/workspaces/TrainingWorkspace';

interface DashboardPageProps {
    athleteName: string;
    athleteImage: string | null;
    dashboardWorkspace: DashboardWorkspace;
    onWorkspaceSelect: (workspace: DashboardWorkspace) => void;
    syncing: boolean;
    onSync: () => void;
    onLogout: () => Promise<void>;
    currentSummary: {
        runCount: number;
        totalDistanceKm: number;
    };
    selectedShoeName?: string;
    filterStyle: 'relative' | 'calendar';
    onFilterStyleChange: (style: 'relative' | 'calendar') => void;
    viewPeriod: ViewPeriod;
    onViewPeriodChange: Dispatch<SetStateAction<ViewPeriod>>;
    availableYears: number[];
    selectedActivity: Activity | null;
    onSelectActivity: (activity: Activity | null) => void;
    activities: Activity[];
    filteredActivities: Activity[];
    runActivities: Activity[];
    allShoes: Gear[];
    trainingWorkspace: TrainingWorkspace;
    onTrainingWorkspaceChange: (workspace: TrainingWorkspace) => void;
    selectedShoeId: string | null;
    onSelectShoe: (id: string) => void;
    onClearShoeFilter: () => void;
    lastSync: Date | null;
    maxHR: number;
    mostRecentActivityId?: number;
}

export function DashboardPage({
    athleteName,
    athleteImage,
    dashboardWorkspace,
    onWorkspaceSelect,
    syncing,
    onSync,
    onLogout,
    currentSummary,
    selectedShoeName,
    filterStyle,
    onFilterStyleChange,
    viewPeriod,
    onViewPeriodChange,
    availableYears,
    selectedActivity,
    onSelectActivity,
    activities,
    filteredActivities,
    runActivities,
    allShoes,
    trainingWorkspace,
    onTrainingWorkspaceChange,
    selectedShoeId,
    onSelectShoe,
    onClearShoeFilter,
    lastSync,
    maxHR,
    mostRecentActivityId,
}: DashboardPageProps) {
    const activeMeta = DASHBOARD_WORKSPACE_META[dashboardWorkspace];

    return (
        <AppShell
            eyebrow={activeMeta.kicker}
            title={activeMeta.title}
            subtitle={activeMeta.description}
            currentWorkspace={dashboardWorkspace}
            onWorkspaceSelect={onWorkspaceSelect}
            athleteName={athleteName}
            athleteImage={athleteImage}
            statusText={syncing ? 'Syncing now' : formatLastSync(lastSync)}
            syncing={syncing}
            onSync={onSync}
            onLogout={onLogout}
            headerActions={
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                        <span>{describeViewPeriod(viewPeriod)}</span>
                        <span className="text-border">/</span>
                        <span>{currentSummary.runCount} runs</span>
                        <span className="text-border">/</span>
                        <span>{currentSummary.totalDistanceKm.toFixed(1)} km</span>
                        {selectedShoeName ? (
                            <>
                                <span className="text-border">/</span>
                                <span>{selectedShoeName}</span>
                            </>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="flex items-center gap-1 rounded-md border border-input bg-transparent p-0.5">
                            <Toggle
                                pressed={filterStyle === 'relative'}
                                onPressedChange={() => onFilterStyleChange('relative')}
                                size="sm"
                                className="data-[state=on]:bg-muted"
                            >
                                Relative
                            </Toggle>
                            <Toggle
                                pressed={filterStyle === 'calendar'}
                                onPressedChange={() => onFilterStyleChange('calendar')}
                                size="sm"
                                className="data-[state=on]:bg-muted"
                            >
                                Calendar
                            </Toggle>
                        </div>

                        {filterStyle === 'relative' ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="h-8 min-w-[120px] justify-between gap-2 px-3">
                                        {viewPeriod.mode === '30d' ? 'Last 30 days' : viewPeriod.mode === '90d' ? 'Last 90 days' : 'Last 365 days'}
                                        <ChevronDown className="size-4 opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[160px]">
                                    <DropdownMenuRadioGroup
                                        value={viewPeriod.mode}
                                        onValueChange={(value) => {
                                            onViewPeriodChange((previous) => ({
                                                ...previous,
                                                mode: value as ViewPeriod['mode'],
                                            }));
                                        }}
                                    >
                                        <DropdownMenuRadioItem value="30d">Last 30 days</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="90d">Last 90 days</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="365d">Last 365 days</DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <>
                                <ToggleGroup
                                    type="single"
                                    value={viewPeriod.mode}
                                    onValueChange={(value) => {
                                        if (!value) return;
                                        onViewPeriodChange((previous) => ({
                                            ...previous,
                                            mode: value as ViewPeriod['mode'],
                                        }));
                                    }}
                                    variant="outline"
                                    spacing={1}
                                    className="w-auto"
                                >
                                    <ToggleGroupItem value="all" className="flex-1 sm:flex-none">
                                        All
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="year" className="flex-1 sm:flex-none">
                                        Year
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="month" className="flex-1 sm:flex-none">
                                        Month
                                    </ToggleGroupItem>
                                </ToggleGroup>

                                <PeriodComboButton
                                    viewPeriod={viewPeriod}
                                    availableYears={availableYears}
                                    onViewPeriodChange={onViewPeriodChange}
                                />
                            </>
                        )}
                    </div>
                </div>
            }
        >
            {selectedActivity ? (
                <Suspense fallback={<ModalFallback />}>
                    <RunDetails
                        activity={selectedActivity}
                        allActivities={activities}
                        shoes={allShoes}
                        onClose={() => onSelectActivity(null)}
                        onSelect={onSelectActivity}
                    />
                </Suspense>
            ) : null}

            <div className="mx-auto max-w-[1720px] space-y-5">
                {dashboardWorkspace === 'overview' ? (
                    <OverviewWorkspace
                        activities={activities}
                        filteredActivities={filteredActivities}
                        viewPeriod={viewPeriod}
                        mostRecentActivityId={mostRecentActivityId}
                        maxHR={maxHR}
                    />
                ) : null}

                {dashboardWorkspace === 'training' ? (
                    <TrainingWorkspaceSection
                        activities={activities}
                        filteredActivities={filteredActivities}
                        runActivities={runActivities}
                        allShoes={allShoes}
                        selectedShoeId={selectedShoeId}
                        onSelectShoe={onSelectShoe}
                        trainingWorkspace={trainingWorkspace}
                        onTrainingWorkspaceChange={onTrainingWorkspaceChange}
                        viewPeriod={viewPeriod}
                        maxHR={maxHR}
                        mostRecentActivityId={mostRecentActivityId}
                    />
                ) : null}

                {dashboardWorkspace === 'race' ? (
                    <RaceWorkspace
                        activities={activities}
                        viewPeriod={viewPeriod}
                        maxHR={maxHR}
                        mostRecentActivityId={mostRecentActivityId}
                    />
                ) : null}

                {dashboardWorkspace === 'logbook' ? (
                    <LogbookWorkspace
                        filteredActivities={filteredActivities}
                        runActivities={runActivities}
                        allShoes={allShoes}
                        selectedActivity={selectedActivity}
                        selectedShoeId={selectedShoeId}
                        selectedShoeName={selectedShoeName}
                        viewPeriod={viewPeriod}
                        maxHR={maxHR}
                        onSelectActivity={onSelectActivity}
                        onSelectShoe={onSelectShoe}
                        onClearShoeFilter={onClearShoeFilter}
                    />
                ) : null}

                {dashboardWorkspace === 'heatmap' ? (
                    <Suspense fallback={<ModalFallback />}>
                        <HeatmapWorkspace
                            runActivities={runActivities}
                            filteredActivities={filteredActivities}
                            allShoes={allShoes}
                        />
                    </Suspense>
                ) : null}

                {dashboardWorkspace === 'tools' ? <ToolsWorkspace /> : null}

                <footer className="border-t border-border px-1 py-4">
                    <div className="rv-mini-label flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span>RunViz analytics v5.0</span>
                        <span>Synced with the Strava API</span>
                        <a href="https://github.com/hwong103/runviz" className="transition hover:text-foreground">
                            Project source
                        </a>
                        <Link to="/privacy" className="transition hover:text-foreground">
                            Privacy
                        </Link>
                    </div>
                </footer>
            </div>
        </AppShell>
    );
}
