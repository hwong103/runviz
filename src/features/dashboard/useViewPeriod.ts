import { useCallback, useMemo, useState } from 'react';

import type { ViewPeriod } from '@/lib/dashboard';

type FilterStyle = 'relative' | 'calendar';

export function useViewPeriod() {
    const now = useMemo(() => new Date(), []);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const [filterStyle, setFilterStyleState] = useState<FilterStyle>('relative');
    const [viewPeriod, setViewPeriod] = useState<ViewPeriod>({
        mode: '90d',
        year: currentYear,
        month: currentMonth,
    });

    const setFilterStyle = useCallback((style: FilterStyle) => {
        setFilterStyleState(style);

        if (style === 'relative') {
            setViewPeriod((previous) => ({
                mode: '90d',
                year: previous.year,
                month: previous.month,
            }));
            return;
        }

        setViewPeriod({
            mode: 'year',
            year: currentYear,
            month: currentMonth,
        });
    }, [currentMonth, currentYear]);

    return {
        filterStyle,
        setFilterStyle,
        viewPeriod,
        setViewPeriod,
    };
}
