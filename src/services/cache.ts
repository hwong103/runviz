// IndexedDB caching layer for activities

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Activity, ActivityStreams } from '../types';

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
}

let db: IDBPDatabase<RunVizDB> | null = null;

async function getDB(): Promise<IDBPDatabase<RunVizDB>> {
    if (db) return db;

    db = await openDB<RunVizDB>('runviz', 1, {
        upgrade(database) {
            // Activities store
            const activityStore = database.createObjectStore('activities', {
                keyPath: 'id',
            });
            activityStore.createIndex('by-date', 'start_date_local');

            // Streams store
            database.createObjectStore('streams', {
                keyPath: 'activityId',
            });

            // Meta store for sync state
            database.createObjectStore('meta', {
                keyPath: 'key',
            });
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
}
