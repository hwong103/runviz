import { lazyWithRetry } from '@/lib/lazyWithRetry';

export const FitnessChart = lazyWithRetry(
    () => import('@/components/FitnessChart').then((module) => ({ default: module.FitnessChart })),
    'fitness-chart'
);

export const MileageTrendChart = lazyWithRetry(
    () => import('@/components/MileageTrendChart').then((module) => ({ default: module.MileageTrendChart })),
    'mileage-trend-chart'
);

export const YearOnYearChart = lazyWithRetry(
    () => import('@/components/YearOnYearChart').then((module) => ({ default: module.YearOnYearChart })),
    'year-on-year-chart'
);

export const RunDetails = lazyWithRetry(
    () => import('@/components/RunDetails').then((module) => ({ default: module.RunDetails })),
    'run-details'
);

export const ShoeTracker = lazyWithRetry(
    () => import('@/components/ShoeTracker').then((module) => ({ default: module.ShoeTracker })),
    'shoe-tracker'
);

export const VDOTPanel = lazyWithRetry(
    () => import('@/components/VDOTPanel').then((module) => ({ default: module.VDOTPanel })),
    'vdot-panel'
);

export const WeeklyRampChart = lazyWithRetry(
    () => import('@/components/WeeklyRampChart').then((module) => ({ default: module.WeeklyRampChart })),
    'weekly-ramp-chart'
);

export const CadenceTrendChart = lazyWithRetry(
    () => import('@/components/CadenceTrendChart').then((module) => ({ default: module.CadenceTrendChart })),
    'cadence-trend-chart'
);
