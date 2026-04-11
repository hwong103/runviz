import { useMemo, useState } from 'react';

import { DashboardPage } from '@/app/DashboardPage';
import { SetupGate } from '@/app/SetupGate';
import { useDashboardWorkspace } from '@/features/dashboard/useDashboardWorkspace';
import { useViewPeriod } from '@/features/dashboard/useViewPeriod';
import { useGearLibrary } from '@/features/gear/useGearLibrary';
import { useActivities } from '@/hooks/useActivities';
import { useAuth } from '@/hooks/useAuth';
import { useMaxHR } from '@/hooks/useMaxHR';
import type { Activity } from '@/types/activity';
import { isRun } from '@/types/activity';
import type { TrainingWorkspace } from '@/lib/dashboard';
import { parseActivityLocalDate } from '@/utils/activityDate';

function App() {
    const auth = useAuth();
    const { activities, syncing, sync, lastSync } = useActivities();
    const { maxHR } = useMaxHR();
    const { dashboardWorkspace, setDashboardWorkspace } = useDashboardWorkspace();
    const { filterStyle, setFilterStyle, viewPeriod, setViewPeriod } = useViewPeriod();

    const [trainingWorkspace, setTrainingWorkspace] = useState<TrainingWorkspace>('health');
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
    const [selectedShoeId, setSelectedShoeId] = useState<string | null>(null);

    const { allShoes } = useGearLibrary({
        athleteId: auth.athlete?.id,
        athleteShoes: auth.athlete?.shoes,
        athleteGear: auth.athlete?.gear,
        activities,
    });

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        activities.forEach((activity) => {
            years.add(parseActivityLocalDate(activity.start_date_local).getFullYear());
        });
        if (years.size === 0) {
            years.add(new Date().getFullYear());
        }
        return Array.from(years).sort((a, b) => a - b);
    }, [activities]);

    const runActivities = useMemo(() => activities.filter(isRun), [activities]);

    const filteredActivities = useMemo(() => {
        return runActivities
            .filter((activity) => {
                const date = parseActivityLocalDate(activity.start_date_local);
                const year = date.getFullYear();
                const month = date.getMonth();

                if (viewPeriod.mode === 'all') return true;
                if (viewPeriod.mode === 'year') return year === viewPeriod.year;
                if (viewPeriod.mode === 'month') {
                    return year === viewPeriod.year && month === viewPeriod.month;
                }
                if (viewPeriod.mode === '30d') {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - 30);
                    cutoff.setHours(0, 0, 0, 0);
                    return date >= cutoff;
                }
                if (viewPeriod.mode === '90d') {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - 90);
                    cutoff.setHours(0, 0, 0, 0);
                    return date >= cutoff;
                }

                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 365);
                cutoff.setHours(0, 0, 0, 0);
                return date >= cutoff;
            })
            .filter((activity) => (selectedShoeId ? activity.gear_id === selectedShoeId : true));
    }, [runActivities, selectedShoeId, viewPeriod]);

    const selectedShoeName = useMemo(() => {
        if (!selectedShoeId) return undefined;
        return allShoes.find((shoe) => shoe.id === selectedShoeId)?.name;
    }, [allShoes, selectedShoeId]);

    const currentSummary = useMemo(() => {
        const totalDistanceKm = filteredActivities.reduce(
            (sum, activity) => sum + activity.distance,
            0
        ) / 1000;

        return {
            runCount: filteredActivities.length,
            totalDistanceKm,
        };
    }, [filteredActivities]);

    const mostRecentActivityId = useMemo(() => {
        if (activities.length === 0) return undefined;
        const sorted = [...activities].sort(
            (left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime()
        );
        return sorted[0]?.id;
    }, [activities]);

    const athleteLabel = auth.athlete
        ? `${auth.athlete.firstname} ${auth.athlete.lastname}`.trim()
        : 'Athlete';

    return (
        <SetupGate
            authLoading={auth.loading}
            isAuthenticated={auth.isAuthenticated}
            user={auth.user}
            needsStravaConnect={auth.needsStravaConnect}
            login={auth.login}
            connectStrava={auth.connectStrava}
            sendMagicLink={auth.sendMagicLink}
            logout={auth.logout}
        >
            <DashboardPage
                athleteName={athleteLabel}
                athleteImage={auth.athlete?.profile ?? null}
                dashboardWorkspace={dashboardWorkspace}
                onWorkspaceSelect={setDashboardWorkspace}
                syncing={syncing}
                onSync={() => sync({ forceFull: true })}
                onLogout={auth.logout}
                currentSummary={currentSummary}
                selectedShoeName={selectedShoeName}
                filterStyle={filterStyle}
                onFilterStyleChange={setFilterStyle}
                viewPeriod={viewPeriod}
                onViewPeriodChange={setViewPeriod}
                availableYears={availableYears}
                selectedActivity={selectedActivity}
                onSelectActivity={setSelectedActivity}
                activities={activities}
                filteredActivities={filteredActivities}
                runActivities={runActivities}
                allShoes={allShoes}
                trainingWorkspace={trainingWorkspace}
                onTrainingWorkspaceChange={setTrainingWorkspace}
                selectedShoeId={selectedShoeId}
                onSelectShoe={(id) => setSelectedShoeId((previous) => previous === id ? null : id)}
                onClearShoeFilter={() => setSelectedShoeId(null)}
                lastSync={lastSync}
                maxHR={maxHR}
                mostRecentActivityId={mostRecentActivityId}
            />
        </SetupGate>
    );
}

export default App;
