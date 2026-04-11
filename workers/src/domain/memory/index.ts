export type {
    ActivityRecord,
    RunProfile,
    SimilarActivity,
    SimilarWeek,
    WeekSummary,
} from './types';

export { activityToEmbeddingText, weekToEmbeddingText } from './embeddingText';
export { classifyRunProfile } from './runProfile';
export {
    findSimilarActivities,
    findSimilarActivitiesFallback,
    formatSimilarActivitiesContext,
    getLastIndexedDate,
    hasIndexedActivities,
    indexActivities,
} from './similarActivities';
export {
    buildWeekSummaries,
    findSimilarWeeks,
    formatSimilarWeeksContext,
    indexWeeks,
} from './weekSummaries';
