import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    Crosshair,
    MapPin,
    Loader2,
    Route,
    ChevronRight,
    Check,
    Download,
    Navigation,
    Mountain,
    Clock,
} from 'lucide-react';
import { routes as routesApi, geocoding } from '../services/api';
import type { GeneratedRoute, RoutePoint } from '../types';
import { useTheme } from '../hooks/useTheme';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/Badge';
import { cn } from '@/lib/utils';

delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapPicker: React.FC<{ onPick: (pos: [number, number]) => void }> = ({ onPick }) => {
    useMapEvents({
        click(e) {
            onPick([e.latlng.lat, e.latlng.lng]);
        },
    });
    return null;
};

const MapRecenter: React.FC<{ points: RoutePoint[] }> = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [points, map]);
    return null;
};

const MapCenterer: React.FC<{ center: [number, number] | null }> = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.setView(center, 13);
        }
    }, [center, map]);
    return null;
};

interface Suggestion {
    display_name: string;
    lat: string;
    lon: string;
}

function formatDistance(distanceKm: number) {
    return `${distanceKm.toFixed(1)} km`;
}

function formatTime(seconds: number) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainder = mins % 60;
    return `${hours}h ${remainder.toString().padStart(2, '0')}m`;
}

const RoutePlanner: React.FC = () => {
    const { resolved } = useTheme();
    const [targetDistance, setTargetDistance] = useState(5);
    const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
    const [generatedRoutes, setGeneratedRoutes] = useState<GeneratedRoute[]>([]);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

    const suggestionRef = useRef<HTMLDivElement>(null);

    const sortedRoutes = useMemo(
        () => [...generatedRoutes].sort((a, b) => a.elevationGain - b.elevationGain),
        [generatedRoutes],
    );

    const selectedRoute = useMemo(
        () => generatedRoutes.find((r) => r.id === selectedRouteId) ?? null,
        [generatedRoutes, selectedRouteId],
    );

    const routeSummary = useMemo(() => {
        if (!selectedRoute) {
            return [
                { label: 'Status', value: startPoint ? 'Ready to generate' : 'Choose a start point', icon: Navigation },
                { label: 'Target', value: formatDistance(targetDistance), icon: Route },
                { label: 'Routes', value: generatedRoutes.length.toString(), icon: MapPin },
            ];
        }

        return [
            { label: 'Distance', value: formatDistance(selectedRoute.distance / 1000), icon: Route },
            { label: 'Elevation', value: `${Math.round(selectedRoute.elevationGain)} m`, icon: Mountain },
            { label: 'Est. Time', value: formatTime(selectedRoute.estimatedTime), icon: Clock },
        ];
    }, [generatedRoutes.length, selectedRoute, startPoint, targetDistance]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('runviz_last_start_point');
        if (saved) {
            setStartPoint(JSON.parse(saved));
        }
    }, []);

    useEffect(() => {
        if (startPoint) {
            setSearching(true);
            geocoding.reverse(startPoint[0], startPoint[1])
                .then((data) => {
                    if (data.display_name) {
                        setResolvedAddress(data.display_name.split(',').slice(0, 3).join(','));
                    }
                })
                .catch((err) => console.error('Geocoding error:', err))
                .finally(() => setSearching(false));
        }
    }, [startPoint]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.length > 2) {
                setSearching(true);
                try {
                    const data = await geocoding.search(searchQuery);
                    setSuggestions(data);
                    setShowSuggestions(true);
                } catch (err) {
                    console.error('Autocomplete error:', err);
                } finally {
                    setSearching(false);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handlePickStart = useCallback((pos: [number, number]) => {
        setStartPoint(pos);
        localStorage.setItem('runviz_last_start_point', JSON.stringify(pos));
    }, []);

    const selectSuggestion = (suggestion: Suggestion) => {
        const pos: [number, number] = [parseFloat(suggestion.lat), parseFloat(suggestion.lon)];
        handlePickStart(pos);
        setSearchQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
        setResolvedAddress(suggestion.display_name.split(',').slice(0, 3).join(','));
    };

    const useCurrentLocation = () => {
        if ('geolocation' in navigator) {
            setSearching(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
                    handlePickStart(pos);
                    setSearching(false);
                },
                (geolocationError) => {
                    console.error('Error getting location:', geolocationError);
                    setError('Could not get your location. Please check your browser settings.');
                    setSearching(false);
                }
            );
        }
    };

    const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTargetDistance(Math.max(1, Math.min(100, parseInt(e.target.value, 10))));
    };

    const generateRoutes = async () => {
        if (!startPoint) {
            setError('Please select a starting point on the map.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const results = await routesApi.generate({
                startLat: startPoint[0],
                startLng: startPoint[1],
                targetDistanceMeters: targetDistance * 1000,
            });
            setGeneratedRoutes(results);
            if (results.length > 0) {
                setSelectedRouteId(results[0].id);
            }
        } catch (err: unknown) {
            console.error('Failed to generate routes:', err);
            setError(err instanceof Error ? err.message : 'Failed to generate routes. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const downloadGPX = (route: GeneratedRoute) => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunViz" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${route.name}</name>
  </metadata>
  <trk>
    <name>${route.name}</name>
    <trkseg>
      ${route.points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lng}">${p.elevation ? `<ele>${p.elevation}</ele>` : ''}</trkpt>`).join('\n      ')}
    </trkseg>
  </trk>
</gpx>`;

        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${route.name.replace(/\s+/g, '_')}.gpx`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const tileUrl = resolved === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    return (
        <div className="flex flex-col gap-6">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <aside className="order-2 space-y-6 lg:order-1 lg:col-span-4 xl:col-span-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Route settings</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Search for a start point and set your target distance
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4" ref={suggestionRef}>
                            <div className="relative">
                                <label htmlFor="route-search" className="text-sm font-medium text-foreground">
                                    Starting point
                                </label>
                                <div className="relative mt-1.5">
                                    <Input
                                        id="route-search"
                                        name="routeSearch"
                                        type="text"
                                        placeholder="Search location..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        autoComplete="off"
                                        className="pr-24 h-10 text-sm"
                                    />
                                    <div className="absolute inset-y-0 right-1 flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={useCurrentLocation}
                                            className="h-8 w-8"
                                            title="Use current location"
                                            aria-label="Use current location"
                                        >
                                            <Crosshair className="h-4 w-4" />
                                        </Button>
                                        {searching ? (
                                            <div className="flex h-8 w-8 items-center justify-center">
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : (
                                            <div className="flex h-8 w-8 items-center justify-center text-muted-foreground">
                                                <MapPin className="h-4 w-4" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full z-[1001] mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                                        {suggestions.map((suggestion, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => selectSuggestion(suggestion)}
                                                className="w-full border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted"
                                            >
                                                <div className="text-sm font-medium text-foreground line-clamp-1">
                                                    {suggestion.display_name.split(',')[0]}
                                                </div>
                                                <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                                                    {suggestion.display_name.split(',').slice(1).join(',')}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {resolvedAddress && !showSuggestions && (
                                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{resolvedAddress}</span>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-border bg-muted/40 p-4">
                                <div className="mb-3 flex items-end justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-medium text-muted-foreground">Target distance</div>
                                        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                                            {targetDistance.toFixed(1)}
                                            <span className="ml-1.5 text-sm font-medium text-muted-foreground">km</span>
                                        </div>
                                    </div>
                                </div>

                                <input
                                    type="range"
                                    min={1}
                                    max={100}
                                    value={targetDistance}
                                    onChange={handleDistanceChange}
                                    className="range-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none"
                                    aria-label="Target distance in kilometers"
                                />
                                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                    <span>1 km</span>
                                    <span>100 km</span>
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                                    {error}
                                </div>
                            )}

                            <Button
                                onClick={generateRoutes}
                                disabled={loading || !startPoint}
                                className="w-full h-10"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating routes...
                                    </>
                                ) : (
                                    <>
                                        <Route className="h-4 w-4" />
                                        Generate Routes
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                        {routeSummary.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Card key={item.label} size="sm">
                                    <CardContent className="flex items-center gap-3 py-2">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs text-muted-foreground">{item.label}</div>
                                            <div className="text-sm font-medium text-foreground truncate">{item.value}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {generatedRoutes.length > 0 && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Route library</CardTitle>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Select a route to preview on the map
                                        </p>
                                    </div>
                                    <Badge tone={selectedRoute ? 'blue' : 'neutral'} size="sm">
                                        {selectedRoute ? 'Active' : 'None'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[34rem]">
                                    {sortedRoutes.map((route) => {
                                        const isSelected = selectedRouteId === route.id;
                                        return (
                                            <button
                                                key={route.id}
                                                onClick={() => setSelectedRouteId(route.id)}
                                                className={cn(
                                                    'w-full rounded-lg border p-3 text-left transition-all',
                                                    isSelected
                                                        ? 'border-primary/50 bg-primary/10 shadow-sm'
                                                        : 'border-border bg-card hover:bg-muted/50',
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium text-foreground">{route.name}</div>
                                                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                            <span>{formatDistance(route.distance / 1000)}</span>
                                                            <span>{formatTime(route.estimatedTime)}</span>
                                                            {route.elevationGain > 0 && <span>{Math.round(route.elevationGain)} m gain</span>}
                                                        </div>
                                                    </div>
                                                    <div className={cn(
                                                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                                                        isSelected
                                                            ? 'border-primary/40 bg-primary/15 text-primary'
                                                            : 'border-border bg-muted text-muted-foreground',
                                                    )}>
                                                        {isSelected ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedRoute && (
                                    <div className="pt-2">
                                        <Button
                                            onClick={() => downloadGPX(selectedRoute)}
                                            variant="outline"
                                            className="w-full"
                                        >
                                            <Download className="h-4 w-4" />
                                            Export GPX
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </aside>

                <section className="order-1 space-y-4 lg:order-2 lg:col-span-8 xl:col-span-9">
                    <div className="overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-sm sm:p-2">
                        <div className="relative h-[38svh] min-h-[300px] overflow-hidden rounded-lg sm:h-[60vh] lg:h-[760px]">
                            <MapContainer
                                center={startPoint || [-33.8688, 151.2093]}
                                zoom={13}
                                style={{ height: '100%', width: '100%' }}
                                className="z-0"
                            >
                                <TileLayer
                                    url={tileUrl}
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                />
                                <MapPicker onPick={handlePickStart} />
                                <MapCenterer center={startPoint} />
                                {startPoint && <Marker position={startPoint} />}
                                {selectedRoute && (
                                    <>
                                        <Polyline
                                            pathOptions={{ color: '#10b981', weight: 6, opacity: 0.9 }}
                                            positions={selectedRoute.points.map((p) => [p.lat, p.lng])}
                                        />
                                        <MapRecenter points={selectedRoute.points} />
                                    </>
                                )}
                            </MapContainer>

                            {!startPoint && (
                                <div className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm sm:left-4 sm:translate-x-0">
                                    Click anywhere on the map to set a start point
                                </div>
                            )}

                            {startPoint && (
                                <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
                                    <MapPin className="mr-1 inline h-3 w-3" />
                                    Start point set
                                </div>
                            )}
                        </div>
                    </div>

                    <Card size="sm">
                        <CardContent className="py-3">
                            <div className="text-xs font-medium text-muted-foreground mb-2">Map legend</div>
                            <div className="flex flex-wrap gap-3">
                                <Badge tone="emerald" size="md" className="gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                    Active route
                                </Badge>
                                <Badge tone="blue" size="md" className="gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                                    Start point
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </section>
        </div>
    );
};

export default RoutePlanner;
