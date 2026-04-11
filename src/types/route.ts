export interface RoutePoint {
    lat: number;
    lng: number;
    elevation?: number;
}

export interface GeneratedRoute {
    id: string;
    name: string;
    distance: number;
    elevationGain: number;
    estimatedTime: number;
    points: RoutePoint[];
    polyline: string;
}

export interface RouteGenerationRequest {
    startLat: number;
    startLng: number;
    targetDistanceMeters: number;
}
