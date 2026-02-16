// Strava API Types

export interface Athlete {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    profile: string; // avatar URL
    profile_medium: string;
    shoes?: Gear[];
    bikes?: Gear[];
    gear?: Gear[];
}

export interface Gear {
    id: string;
    primary: boolean;
    name: string;
    distance: number; // meters
    brand_name?: string;
    model_name?: string;
    description?: string;
}

export interface Activity {
    id: number;
    name: string;
    type: string;
    sport_type: string;
    gear_id?: string;
    start_date: string;
    start_date_local: string;
    timezone: string;
    distance: number; // meters
    moving_time: number; // seconds
    elapsed_time: number; // seconds
    total_elevation_gain: number; // meters
    average_speed: number; // m/s
    max_speed: number; // m/s
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
    // Extended fields from streams
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

// Analytics Types

export interface HeartRateZone {
    name: string;
    min: number;
    max: number;
    color: string;
}

export interface HeartRateZoneAnalysis {
    zones: HeartRateZone[];
    timeInZones: number[]; // seconds in each zone
    percentageInZones: number[];
}

export interface PaceZone {
    name: string;
    minPace: number; // min/km
    maxPace: number;
    color: string;
}

export interface TrainingLoadMetrics {
    date: string;
    ctl: number; // Chronic Training Load (fitness)
    atl: number; // Acute Training Load (fatigue)
    tsb: number; // Training Stress Balance (form)
    trimp: number; // Training Impulse for that day
}

export interface PersonalRecord {
    distance: number; // standard distance in meters
    distanceLabel: string; // e.g., "5K", "Half Marathon"
    time: number; // seconds
    pace: number; // min/km
    activityId: number;
    date: string;
}

// App State Types

export interface AuthState {
    isAuthenticated: boolean;
    athlete: Athlete | null;
    loading: boolean;
    error: string | null;
}

export interface SyncState {
    lastSync: Date | null;
    isSyncing: boolean;
    progress: number;
    error: string | null;
}

// Route Planning Types

export interface RoutePoint {
    lat: number;
    lng: number;
    elevation?: number;
}

export interface GeneratedRoute {
    id: string;
    name: string;
    distance: number; // meters
    elevationGain: number; // meters
    estimatedTime: number; // seconds
    points: RoutePoint[];
    polyline: string;
}

export interface RouteGenerationRequest {
    startLat: number;
    startLng: number;
    targetDistanceMeters: number;
}

export function isRun(activity: Activity): boolean {
    const runTypes = ['Run', 'TrailRun', 'VirtualRun'];
    return (
        runTypes.includes(activity.type) ||
        runTypes.includes(activity.sport_type)
    );
}

export interface FormVideo {
    id: string;
    filename: string;
    mimeType: string;
    creationTime: string;
    durationSec: number;
    width: number;
    height: number;
    mediaItemId: string; // stable ID for re-fetching baseUrl later
    baseUrl: string; // short-lived, ~60 min expiry
}

export interface FormAnalysis {
    id: string;
    activityId?: number;
    videoId: string;
    clipStartSec: number;
    clipEndSec: number;
    createdAt: string;
    analysisVersion: string;
    modelVersion: string;
    metrics: {
        cadence: number;
        strideLength?: number;
        verticalOscillation: number;
        trunkLean: number;
        overstrideFlag: boolean;
    };
    series: {
        timestamp: number;
        cadence: number;
        verticalOscillation: number;
        trunkLean: number;
    }[];
    commentary: {
        tips: string[];
        baselineComparison: string;
        confidence: number;
    };
    lastWrittenAt?: string;
}
