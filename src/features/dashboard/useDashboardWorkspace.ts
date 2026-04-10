import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
    type DashboardWorkspace,
    isDashboardWorkspace,
} from '@/lib/dashboard';

function getWorkspaceFromParams(searchParams: URLSearchParams): DashboardWorkspace {
    const workspace = searchParams.get('workspace');
    return isDashboardWorkspace(workspace) ? workspace : 'overview';
}

export function useDashboardWorkspace() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [dashboardWorkspace, setDashboardWorkspace] = useState<DashboardWorkspace>(
        () => getWorkspaceFromParams(searchParams)
    );

    useEffect(() => {
        setDashboardWorkspace(getWorkspaceFromParams(searchParams));
    }, [searchParams]);

    const selectDashboardWorkspace = useCallback((workspace: DashboardWorkspace) => {
        setDashboardWorkspace(workspace);
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set('workspace', workspace);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    return {
        dashboardWorkspace,
        setDashboardWorkspace: selectDashboardWorkspace,
    };
}
