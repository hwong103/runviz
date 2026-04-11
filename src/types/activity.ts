import type { Gear } from './gear';

export interface Activity {
    id: number;
    name: string;
    type: string;
    sport_type: string;
    gear_id?: string;
    start_date: string;
    start_date_local: string;
    timezone: string;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    total_elevation_gain: number;
    average_speed: number;
    max_speed: number;
    average_heartrate?: number;
    max_heartrate?: number;
    average_cadence?: number;
    suffer_score?: number;
    calories?: number;
    kilojoules?: number;
    has_heartrate: boolean;
    map?: {
        id: string;
        summary_polyline: string;
        polyline?: string;
    };
    gear?: Gear;
    description?: string;
    streams?: ActivityStreams;
}

export interface ActivityStreams {
    time?: StreamData;
    distance?: StreamData;
    latlng?: StreamData;
    altitude?: StreamData;
    heartrate?: StreamData;
    cadence?: StreamData;
    velocity_smooth?: StreamData;
    grade_smooth?: StreamData;
}

export interface StreamData {
    data: number[];
    series_type: string;
    original_size: number;
    resolution: string;
}

export interface Split {
    distance: number;
    elapsed_time: number;
    moving_time: number;
    average_speed: number;
    average_heartrate?: number;
    pace_zone: number;
    split: number;
    elevation_difference: number;
}

export interface SyncState {
    lastSync: Date | null;
    isSyncing: boolean;
    progress: number;
    error: string | null;
}

export function isRun(activity: Activity): boolean {
    const runTypes = ['Run', 'TrailRun', 'VirtualRun'];
    return runTypes.includes(activity.type) || runTypes.includes(activity.sport_type);
}
