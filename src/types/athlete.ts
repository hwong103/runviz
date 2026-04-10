import type { Gear } from './gear';

export interface Athlete {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    profile: string;
    profile_medium: string;
    shoes?: Gear[];
    bikes?: Gear[];
    gear?: Gear[];
}

export interface AthleteStats {
    all_run_totals: {
        count: number;
        distance: number;
        moving_time: number;
        elapsed_time: number;
        elevation_gain: number;
    };
    ytd_run_totals: {
        count: number;
        distance: number;
        moving_time: number;
        elapsed_time: number;
        elevation_gain: number;
    };
    recent_run_totals: {
        count: number;
        distance: number;
        moving_time: number;
        elapsed_time: number;
        elevation_gain: number;
    };
}

export interface AuthState {
    isAuthenticated: boolean;
    athlete: Athlete | null;
    loading: boolean;
    error: string | null;
}
