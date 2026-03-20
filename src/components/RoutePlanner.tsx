import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { routes as routesApi, geocoding } from '../services/api';
import type { GeneratedRoute, RoutePoint } from '../types';
import { useTheme } from '../hooks/useTheme';

// Fix Leaflet marker icon issue
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

function summarizeAddress(address?: string | null) {
    if (!address) return 'No starting point selected';
    return address;
}

const RoutePlanner: React.FC = () => {
    const navigate = useNavigate();
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
                { label: 'Status', value: startPoint ? 'Ready to generate' : 'Choose a start point' },
                { label: 'Target', value: formatDistance(targetDistance) },
                { label: 'Routes', value: generatedRoutes.length.toString() },
            ];
        }

        return [
            { label: 'Distance', value: formatDistance(selectedRoute.distance / 1000) },
            { label: 'Elevation', value: `${Math.round(selectedRoute.elevationGain)} m` },
            { label: 'Time', value: formatTime(selectedRoute.estimatedTime) },
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
                    setError('Could not get your location.');
                    setSearching(false);
                }
            );
        }
    };

    const adjustDistance = (delta: number) => {
        setTargetDistance((prev) => {
            const next = prev + delta;
            return Math.max(1, Math.min(100, next));
        });
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
            setError(err instanceof Error ? err.message : 'Failed to generate routes. Please check your API configuration.');
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
        <div className="rv-page-surface rv-route-planner min-h-screen overflow-hidden">
            <main className="relative mx-auto max-w-[1680px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <header className="rv-shell-card mb-5">
                    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                        <button
                            onClick={() => navigate('/')}
                            className="group inline-flex w-full items-center gap-3 self-start rounded-full border border-[var(--rv-yellow)]/15 bg-black/20 px-4 py-3 text-left transition-all hover:border-[var(--rv-yellow)]/35 hover:bg-white/5 sm:w-auto"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--rv-yellow)]/15 bg-[var(--rv-yellow)]/10 text-[var(--rv-text)] transition-transform group-hover:-translate-x-0.5">
                                ←
                            </span>
                            <span>
                                <span className="rv-mini-label block text-white/40">Back to dashboard</span>
                                <span className="rv-mini-label block text-[var(--rv-text)]">Route Planner</span>
                            </span>
                        </button>

                        <div className="min-w-0 text-left sm:text-center">
                            <div className="rv-kicker mb-2">Route Planner</div>
                            <h1 className="rv-metric text-[clamp(2.2rem,4vw,4.6rem)]">
                                Plan a route for your next run
                            </h1>
                            <p className="rv-mini-label mt-2 sm:text-[0.78rem]">
                                Choose a start point, set the distance, and export the route.
                            </p>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            <div className="rv-button-secondary px-4 py-3 text-left sm:text-right">
                                <div className="rv-quiet-label">Start</div>
                                <div className="max-w-[16rem] truncate text-sm font-semibold text-[var(--rv-text)]">
                                    {summarizeAddress(resolvedAddress)}
                                </div>
                            </div>
                            <button
                                onClick={useCurrentLocation}
                                className="rv-stat-badge rv-pill-label inline-flex h-12 w-full justify-center border-[var(--rv-blue)]/25 px-4 hover:border-[var(--rv-blue)]/60 hover:bg-[var(--rv-blue)]/18 active:scale-[0.98] sm:w-auto"
                                data-tone="blue"
                                title="Use current location"
                            >
                                <span className="text-base">◎</span>
                                Current Location
                            </button>
                        </div>
                    </div>
                </header>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
                    <aside className="order-2 space-y-4 lg:order-1 lg:col-span-4 xl:col-span-3">
                        <div className="rv-shell-card p-4 sm:p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <div className="rv-kicker mb-2">Route Configuration</div>
                                    <div className="rv-quiet-label">
                                        Search for a start point and target distance
                                    </div>
                                </div>
                                <div className="rv-quiet-label">{generatedRoutes.length} routes</div>
                            </div>

                            <div className="space-y-4" ref={suggestionRef}>
                                <div className="relative">
                                    <label htmlFor="route-search" className="rv-quiet-label mb-2 block">
                                        Starting point
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="route-search"
                                            name="routeSearch"
                                            type="text"
                                            placeholder="Search location..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            autoComplete="off"
                                            className="rv-field w-full px-4 py-4 pr-24 text-sm"
                                        />
                                        <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={useCurrentLocation}
                                                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-[var(--rv-text-dim)] transition-all hover:border-[var(--rv-yellow)]/40 hover:text-[var(--rv-yellow)] active:scale-95"
                                                title="Use current location"
                                                aria-label="Use current location"
                                            >
                                                ◎
                                            </button>
                                            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/30" aria-hidden="true">
                                                {searching ? (
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[#4a7aff]" />
                                                ) : (
                                                    <span className="text-base">⌕</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-[1001] mt-2 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[color-mix(in_srgb,var(--rv-bg-deep)_92%,transparent)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                                            {suggestions.map((suggestion, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => selectSuggestion(suggestion)}
                                                    className="w-full border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5"
                                                >
                                                    <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--rv-text)] line-clamp-1">
                                                        {suggestion.display_name.split(',')[0]}
                                                    </div>
                                                    <div className="mt-1 text-[0.78rem] font-medium text-[var(--rv-text-faint)] line-clamp-1">
                                                        {suggestion.display_name.split(',').slice(1).join(',')}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {resolvedAddress && !showSuggestions && (
                                        <div className="rv-inline-note rv-pill-label mt-3 px-4 py-3" data-tone="warn">
                                            {resolvedAddress}
                                        </div>
                                    )}
                                </div>

                                <div className="rv-subtle-card p-4">
                                    <div className="mb-4 flex items-end justify-between gap-3">
                                        <div>
                                            <div className="rv-quiet-label">Target distance</div>
                                            <div className="rv-metric mt-2 text-[clamp(1.85rem,3vw,2.8rem)] not-italic">
                                                {targetDistance.toFixed(1)}
                                                <span className="rv-mini-label ml-2 not-italic text-[var(--rv-yellow)]">KM</span>
                                            </div>
                                        </div>
                                        <div className="inline-flex items-center gap-2 self-start">
                                            <button
                                                type="button"
                                                onClick={() => adjustDistance(-1)}
                                                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-2xl font-light text-white/70 transition-all hover:border-white/20 hover:bg-white/10 active:scale-95"
                                                aria-label="Decrease target distance by 1 kilometer"
                                            >
                                                -
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => adjustDistance(1)}
                                                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-2xl font-light text-white/70 transition-all hover:border-white/20 hover:bg-white/10 active:scale-95"
                                                aria-label="Increase target distance by 1 kilometer"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative h-2 overflow-hidden rounded-full bg-white/6">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--rv-blue)] via-[var(--rv-green)] to-[var(--rv-yellow)]"
                                            style={{ width: `${(targetDistance / 100) * 100}%` }}
                                        />
                                    </div>
                                    <div className="rv-mini-label mt-3 flex justify-between">
                                        <span>1 km</span>
                                        <span>100 km</span>
                                    </div>
                                </div>

                                {error && (
                                    <div className="rv-inline-note rv-pill-label rounded-[1.35rem] px-4 py-3" data-tone="danger">
                                        {error}
                                    </div>
                                )}

                                <button
                                    onClick={generateRoutes}
                                    disabled={loading || !startPoint}
                                    className={`group inline-flex w-full items-center justify-center gap-3 px-5 py-4 ${loading || !startPoint
                                        ? 'cursor-not-allowed border border-white/10 bg-white/5 text-white/25'
                                        : 'rv-button-primary shadow-[0_18px_50px_rgba(74,122,255,0.35)] hover:border-[#d9b36a]/38 hover:shadow-[0_24px_70px_rgba(74,122,255,0.45)]'
                                        }`}
                                >
                                    {loading ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                                    ) : (
                                        <span className="text-base">✦</span>
                                    )}
                                    Generate Routes
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {routeSummary.map((item) => (
                                <div key={item.label} className="rv-subtle-card p-4">
                                    <div className="rv-quiet-label">{item.label}</div>
                                    <div className="mt-3 text-base font-semibold tracking-[-0.02em] text-[var(--rv-text)]">{item.value}</div>
                                </div>
                            ))}
                        </div>

                        {generatedRoutes.length > 0 && (
                            <div className="rv-panel p-4 sm:p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <div className="rv-kicker">Route Library</div>
                                        <div className="rv-mini-label mt-2">
                                            Select a route to preview on the map
                                        </div>
                                    </div>
                                    <div className="rv-mini-label">{selectedRoute ? 'Active' : 'None'}</div>
                                </div>

                                <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[34rem]">
                                    {sortedRoutes.map((route) => {
                                        const isSelected = selectedRouteId === route.id;
                                        return (
                                            <button
                                                key={route.id}
                                                onClick={() => setSelectedRouteId(route.id)}
                                                className={`rv-card-interactive group w-full p-4 text-left ${isSelected
                                                    ? 'border-[var(--rv-blue)]/70 bg-[var(--rv-blue)]/12 shadow-[0_16px_50px_rgba(74,122,255,0.18)]'
                                                    : 'bg-black/15'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--rv-text)]">{route.name}</div>
                                                        <div className="rv-mini-label mt-2 flex flex-wrap gap-2">
                                                            <span>{formatDistance(route.distance / 1000)}</span>
                                                            <span>{formatTime(route.estimatedTime)}</span>
                                                            {route.elevationGain > 0 && <span>{Math.round(route.elevationGain)} m gain</span>}
                                                        </div>
                                                    </div>
                                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isSelected ? 'border-[var(--rv-yellow)]/40 bg-[var(--rv-yellow)]/15 text-[var(--rv-yellow)]' : 'border-white/10 bg-white/5 text-[var(--rv-text-faint)]'}`}>
                                                        {isSelected ? '✓' : '→'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedRoute && (
                                    <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/25 p-3">
                                        <button
                                            onClick={() => downloadGPX(selectedRoute)}
                                            className="rv-pill-label inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--rv-yellow)]/20 bg-[var(--rv-yellow)] px-4 py-3 text-[var(--rv-bg-elevated)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(217,179,106,0.2)] active:scale-[0.99]"
                                        >
                                            <span>↓</span>
                                            Export GPX
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </aside>

                    <section className="order-1 space-y-4 lg:order-2 lg:col-span-8 xl:col-span-9">
                        <div className="rv-panel overflow-hidden rounded-[2.5rem] p-2 shadow-[0_24px_120px_rgba(0,0,0,0.25)] sm:p-3">
                            <div className="relative h-[38svh] min-h-[300px] overflow-hidden rounded-[2rem] sm:h-[60vh] lg:h-[760px]">
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

                                <div className="rv-pill-label pointer-events-none absolute left-1/2 top-4 z-[500] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full border border-white/10 bg-[color-mix(in_srgb,var(--rv-bg-deep)_65%,transparent)] px-4 py-2.5 text-center text-[var(--rv-text-dim)] sm:left-5 sm:w-auto sm:max-w-none sm:-translate-x-0 sm:text-left">
                                    Click anywhere to set the start point
                                </div>

                                {!startPoint && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_srgb,var(--rv-bg-deep)_25%,transparent)] backdrop-blur-[2px]">
                                        <div className="max-w-md rounded-[1.75rem] border border-white/10 bg-[color-mix(in_srgb,var(--rv-bg-deep)_85%,transparent)] px-6 py-5 text-center shadow-[0_20px_80px_rgba(0,0,0,0.4)]">
                                            <div className="rv-kicker">Route input needed</div>
                                            <div className="rv-body-copy-sm mt-3">
                                                Search for a place or click the map to choose your starting point, then generate routes.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rv-panel p-4 sm:p-5">
                            <div className="rv-kicker mb-4">Map legend</div>
                            <div className="grid gap-3 sm:flex sm:flex-wrap">
                                    <span className="rv-stat-badge rv-pill-label w-full justify-start sm:w-auto">
                                        <span className="h-3 w-3 rounded-full bg-[var(--rv-green)] shadow-[0_0_18px_rgba(87,198,154,0.45)]" />
                                        Active Path
                                    </span>
                                    <span className="rv-stat-badge rv-pill-label w-full justify-start sm:w-auto">
                                        <span className="h-0 w-0 border-l-[7px] border-r-[7px] border-t-[12px] border-l-transparent border-r-transparent border-t-[var(--rv-yellow)]" />
                                        High Gradient Zone
                                    </span>
                                    <span className="rv-stat-badge rv-pill-label w-full justify-start sm:w-auto">
                                        <span className="h-3 w-3 rounded-full bg-[var(--rv-blue)]" />
                                        Start Marker
                                    </span>
                            </div>
                        </div>
                    </section>
                </section>
            </main>
        </div>
    );
};

export default RoutePlanner;
