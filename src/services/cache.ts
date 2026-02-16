// IndexedDB caching layer for activities

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Activity, ActivityStreams, FormAnalysis } from '../types';

interface RunVizDB extends DBSchema {
    activities: {
        key: number;
        value: Activity;
        indexes: {
            'by-date': string;
        };
    };
    streams: {
        key: number;
        value: {
            activityId: number;
            streams: ActivityStreams;
        };
    };
    meta: {
        key: string;
        value: {
            key: string;
            value: string | number | Date;
        };
    };
    form_analyses: {
        key: string;
        value: FormAnalysis;
        indexes: {
            'by-activity': number;
        };
    };
}

let db: IDBPDatabase<RunVizDB> | null = null;

async function getDB(): Promise<IDBPDatabase<RunVizDB>> {
    if (db) return db;

    db = await openDB<RunVizDB>('runviz', 2, {
        upgrade(database, oldVersion) {
            if (oldVersion < 1) {
                // Activities store
                if (!database.objectStoreNames.contains('activities')) {
                    const activityStore = database.createObjectStore('activities', {
                        keyPath: 'id',
                    });
                    activityStore.createIndex('by-date', 'start_date_local');
                }

                // Streams store
                if (!database.objectStoreNames.contains('streams')) {
                    database.createObjectStore('streams', {
                        keyPath: 'activityId',
                    });
                }

                // Meta store for sync state
                if (!database.objectStoreNames.contains('meta')) {
                    database.createObjectStore('meta', {
                        keyPath: 'key',
                    });
                }
            }

            if (oldVersion < 2) {
                // Form Analysis store
                if (!database.objectStoreNames.contains('form_analyses')) {
                    const formStore = database.createObjectStore('form_analyses', {
                        keyPath: 'id',
                    });
                    formStore.createIndex('by-activity', 'activityId');
                }
            }
        },
    });

    return db;
}

// Activity operations
export async function cacheActivities(activities: Activity[]): Promise<void> {
    const database = await getDB();
    const tx = database.transaction('activities', 'readwrite');
    await Promise.all(activities.map((activity) => tx.store.put(activity)));
    await tx.done;
}

export async function getCachedActivities(): Promise<Activity[]> {
    const database = await getDB();
    const activities = await database.getAllFromIndex('activities', 'by-date');
    return activities.reverse(); // Most recent first
}

export async function getCachedActivity(id: number): Promise<Activity | undefined> {
    const database = await getDB();
    return database.get('activities', id);
}

export async function getActivityCount(): Promise<number> {
    const database = await getDB();
    return database.count('activities');
}

// Streams operations
export async function cacheStreams(activityId: number, streams: ActivityStreams): Promise<void> {
    const database = await getDB();
    await database.put('streams', { activityId, streams });
}

export async function getCachedStreams(activityId: number): Promise<ActivityStreams | undefined> {
    const database = await getDB();
    const result = await database.get('streams', activityId);
    return result?.streams;
}

// Meta operations
export async function setMeta(key: string, value: string | number | Date): Promise<void> {
    const database = await getDB();
    await database.put('meta', { key, value });
}

export async function getMeta(key: string): Promise<string | number | Date | undefined> {
    const database = await getDB();
    const result = await database.get('meta', key);
    return result?.value;
}

export async function getLastSyncDate(): Promise<Date | null> {
    const value = await getMeta('lastSync');
    return value ? new Date(value as string) : null;
}

export async function setLastSyncDate(date: Date): Promise<void> {
    await setMeta('lastSync', date.toISOString());
}

// Clear all data (for logout)
export async function clearCache(): Promise<void> {
    const database = await getDB();
    await database.clear('activities');
    await database.clear('streams');
    await database.clear('meta');
    await database.clear('form_analyses');
}

// Form Analysis operations
export async function saveFormAnalysis(analysis: FormAnalysis): Promise<void> {
    const database = await getDB();
    await database.put('form_analyses', analysis);
}

export async function getFormAnalysisByActivity(activityId: number): Promise<FormAnalysis | undefined> {
    const database = await getDB();
    return database.getFromIndex('form_analyses', 'by-activity', activityId);
}

export async function listFormAnalyses(): Promise<FormAnalysis[]> {
    const database = await getDB();
    return database.getAll('form_analyses');
}

export async function deleteFormAnalysis(id: string): Promise<void> {
    const database = await getDB();
    await database.delete('form_analyses', id);
}
