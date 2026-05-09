import { lazyWithRetry } from '@/lib/lazyWithRetry';

export const FitnessChart = lazyWithRetry(
    () => import('@/features/dashboard/charts/FitnessChart').then((module) => ({ default: module.FitnessChart })),
    'fitness-chart'
);

export const MileageTrendChart = lazyWithRetry(
    () => import('@/features/dashboard/charts/MileageTrendChart').then((module) => ({ default: module.MileageTrendChart })),
    'mileage-trend-chart'
);

export const YearOnYearChart = lazyWithRetry(
    () => import('@/features/dashboard/charts/YearOnYearChart').then((module) => ({ default: module.YearOnYearChart })),
    'year-on-year-chart'
);

export const RunDetails = lazyWithRetry(
    () => import('@/features/run-details/RunDetailsModal').then((module) => ({ default: module.RunDetailsModal })),
    'run-details'
);

export const ShoeTracker = lazyWithRetry(
    () => import('@/features/gear/ShoeTracker').then((module) => ({ default: module.ShoeTracker })),
    'shoe-tracker'
);

export const HeatmapWorkspace = lazyWithRetry(
    () => import('@/features/heatmap/HeatmapWorkspace').then((module) => ({ default: module.HeatmapWorkspace })),
    'heatmap-workspace'
);

export const VDOTPanel = lazyWithRetry(
    () => import('@/features/dashboard/charts/VDOTPanel').then((module) => ({ default: module.VDOTPanel })),
    'vdot-panel'
);

export const WeeklyRampChart = lazyWithRetry(
    () => import('@/features/dashboard/charts/WeeklyRampChart').then((module) => ({ default: module.WeeklyRampChart })),
    'weekly-ramp-chart'
);

export const CadenceTrendChart = lazyWithRetry(
    () => import('@/features/dashboard/charts/CadenceTrendChart').then((module) => ({ default: module.CadenceTrendChart })),
    'cadence-trend-chart'
);
