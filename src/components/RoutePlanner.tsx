import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { routes as routesApi, geocoding } from '../services/api';
import type { GeneratedRoute, RoutePoint } from '../types';

// Fix Leaflet marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
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
    if (!address) return 'Awaiting starting point';
    return address;
}

const RoutePlanner: React.FC = () => {
    const navigate = useNavigate();
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
        } else if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
                    setStartPoint(pos);
                },
                (geolocationError) => {
                    console.error('Error getting location:', geolocationError);
                }
            );
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
        } catch (err: any) {
            console.error('Failed to generate routes:', err);
            setError(err.message || 'Failed to generate routes. Please check your API configuration.');
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

    return (
        <div className="min-h-screen overflow-hidden bg-[#0a0f17] text-[#f5efe3] relative">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 right-[-6rem] h-72 w-72 rounded-full bg-[#4a7aff]/8 blur-3xl" />
                <div className="absolute bottom-[-8rem] left-[-6rem] h-80 w-80 rounded-full bg-[#d9b36a]/8 blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-[1680px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <header className="mb-5 rounded-[2rem] border border-[#d9b36a]/15 bg-[#131a25]/92 shadow-[0_24px_120px_rgba(0,0,0,0.35)] backdrop-blur-md">
                    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                        <button
                            onClick={() => navigate('/')}
                            className="group inline-flex items-center gap-3 self-start rounded-full border border-[#d9b36a]/15 bg-black/20 px-4 py-3 text-left transition-all hover:border-[#d9b36a]/35 hover:bg-white/5"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d9b36a]/15 bg-[#d9b36a]/10 text-[#f5efe3] transition-transform group-hover:-translate-x-0.5">
                                ←
                            </span>
                            <span>
                                <span className="block text-[10px] font-black uppercase tracking-[0.35em] text-white/40">Back to dashboard</span>
                                <span className="block text-xs font-black uppercase tracking-[0.24em] text-[#f5efe3]">Route Planner</span>
                            </span>
                        </button>

                        <div className="min-w-0 text-left sm:text-center">
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.4em] text-[#d9b36a]">Route Planner</div>
                            <h1 className="font-['Instrument_Serif'] text-[clamp(2.2rem,4vw,4.6rem)] italic leading-none tracking-[-0.05em] text-[#f5efe3]">
                                Plan a route that feels intentional
                            </h1>
                            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.34em] text-[#f5efe3]/35 sm:text-xs">
                                Pick a start, set the distance, export the route.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <div className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-right">
                                <div className="text-[9px] font-black uppercase tracking-[0.35em] text-white/35">Start</div>
                                <div className="max-w-[16rem] truncate text-xs font-black text-[#f6f2f1]">
                                    {summarizeAddress(resolvedAddress)}
                                </div>
                            </div>
                            <button
                                onClick={useCurrentLocation}
                                className="inline-flex h-12 items-center gap-2 rounded-full border border-[#4a7aff]/28 bg-[#4a7aff]/12 px-4 text-[10px] font-black uppercase tracking-[0.32em] text-[#f5efe3] transition-all hover:border-[#4a7aff]/60 hover:bg-[#4a7aff]/18 active:scale-[0.98]"
                                title="Use current location"
                            >
                                <span className="text-base">◎</span>
                                Current Location
                            </button>
                        </div>
                    </div>
                </header>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
                    <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
                        <div className="rounded-[2rem] border border-[#d9b36a]/12 bg-[#131a25]/94 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.22)] sm:p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.45em] text-[#d9b36a]">Route Configuration</div>
                                    <div className="text-xs font-black uppercase tracking-[0.28em] text-white/45">
                                        Search and set the effort
                                    </div>
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">{generatedRoutes.length} routes</div>
                            </div>

                            <div className="space-y-4" ref={suggestionRef}>
                                <div className="relative">
                                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.35em] text-white/35">
                                        Starting point
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search location..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full rounded-[1.35rem] border border-[#d9b36a]/12 bg-black/25 px-4 py-4 pr-24 text-sm text-[#f5efe3] outline-none transition-all placeholder:text-white/20 focus:border-[#4a7aff]/60 focus:bg-black/35"
                                        />
                                        <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={useCurrentLocation}
                                                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-white/60 transition-all hover:border-[#d9b36a]/40 hover:text-[#d9b36a] active:scale-95"
                                                title="Use current location"
                                            >
                                                ◎
                                            </button>
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/30">
                                                {searching ? (
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[#4a7aff]" />
                                                ) : (
                                                    <span className="text-base">⌕</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-[1001] mt-2 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#062030]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                                            {suggestions.map((suggestion, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => selectSuggestion(suggestion)}
                                                    className="w-full border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5"
                                                >
                                                    <div className="text-xs font-black uppercase tracking-[0.12em] text-[#f6f2f1] line-clamp-1">
                                                        {suggestion.display_name.split(',')[0]}
                                                    </div>
                                                    <div className="mt-1 text-[10px] font-medium text-white/40 line-clamp-1">
                                                        {suggestion.display_name.split(',').slice(1).join(',')}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {resolvedAddress && !showSuggestions && (
                                        <div className="mt-3 rounded-2xl border border-[#d9b36a]/20 bg-[#d9b36a]/8 px-4 py-3 text-[10px] font-black uppercase tracking-[0.32em] text-[#d9b36a]">
                                            {resolvedAddress}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                                    <div className="mb-4 flex items-end justify-between gap-3">
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Target distance</div>
                                            <div className="mt-2 text-[clamp(1.85rem,3vw,2.8rem)] font-black italic leading-none tracking-[-0.05em] text-[#f6f2f1]">
                                                {targetDistance.toFixed(1)}
                                                <span className="ml-2 text-sm not-italic tracking-[0.28em] text-[#d9b36a]">KM</span>
                                            </div>
                                        </div>
                                        <div className="inline-flex items-center gap-2">
                                            <button
                                                onClick={() => adjustDistance(-1)}
                                                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-2xl font-light text-white/70 transition-all hover:border-white/20 hover:bg-white/10 active:scale-95"
                                            >
                                                -
                                            </button>
                                            <button
                                                onClick={() => adjustDistance(1)}
                                                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-2xl font-light text-white/70 transition-all hover:border-white/20 hover:bg-white/10 active:scale-95"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative h-2 overflow-hidden rounded-full bg-white/6">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#0093d6] via-[#10b981] to-[#fff917]"
                                            style={{ width: `${(targetDistance / 100) * 100}%` }}
                                        />
                                    </div>
                                    <div className="mt-3 flex justify-between text-[9px] font-black uppercase tracking-[0.32em] text-white/25">
                                        <span>1 km</span>
                                        <span>100 km</span>
                                    </div>
                                </div>

                                {error && (
                                    <div className="rounded-[1.35rem] border border-[#ff6b6b]/30 bg-[#ff6b6b]/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#ffb4b4]">
                                        {error}
                                    </div>
                                )}

                                <button
                                    onClick={generateRoutes}
                                    disabled={loading || !startPoint}
                                    className={`group inline-flex w-full items-center justify-center gap-3 rounded-full px-5 py-4 text-[11px] font-black uppercase tracking-[0.34em] transition-all ${loading || !startPoint
                                        ? 'cursor-not-allowed border border-white/10 bg-white/5 text-white/25'
                                        : 'border border-[#fff917]/20 bg-[#0093d6] text-[#f6f2f1] shadow-[0_18px_50px_rgba(0,147,214,0.35)] hover:-translate-y-0.5 hover:border-[#fff917]/40 hover:shadow-[0_24px_70px_rgba(0,147,214,0.45)]'
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

                        <div className="grid grid-cols-3 gap-3">
                            {routeSummary.map((item) => (
                                <div key={item.label} className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                                    <div className="text-[9px] font-black uppercase tracking-[0.34em] text-white/30">{item.label}</div>
                                    <div className="mt-3 text-sm font-black uppercase tracking-[0.08em] text-[#f6f2f1]">{item.value}</div>
                                </div>
                            ))}
                        </div>

                        {generatedRoutes.length > 0 && (
                            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_80px_rgba(0,0,0,0.18)] sm:p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.42em] text-[#fff917]">Route Library</div>
                                        <div className="mt-2 text-xs font-black uppercase tracking-[0.28em] text-white/35">
                                            Select a route to preview
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">{selectedRoute ? 'Active' : 'None'}</div>
                                </div>

                                <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[34rem]">
                                    {sortedRoutes.map((route) => {
                                        const isSelected = selectedRouteId === route.id;
                                        return (
                                            <button
                                                key={route.id}
                                                onClick={() => setSelectedRouteId(route.id)}
                                                className={`group w-full rounded-[1.35rem] border p-4 text-left transition-all ${isSelected
                                                    ? 'border-[#0093d6]/70 bg-[#0093d6]/12 shadow-[0_16px_50px_rgba(0,147,214,0.18)]'
                                                    : 'border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/5'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-black uppercase tracking-[0.1em] text-[#f6f2f1]">{route.name}</div>
                                                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-white/35">
                                                            <span>{formatDistance(route.distance / 1000)}</span>
                                                            <span>{formatTime(route.estimatedTime)}</span>
                                                            {route.elevationGain > 0 && <span>{Math.round(route.elevationGain)} m gain</span>}
                                                        </div>
                                                    </div>
                                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isSelected ? 'border-[#fff917]/40 bg-[#fff917]/15 text-[#fff917]' : 'border-white/10 bg-white/5 text-white/40'}`}>
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
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#fff917]/20 bg-[#fff917] px-4 py-3 text-[10px] font-black uppercase tracking-[0.34em] text-[#041723] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(255,249,23,0.2)] active:scale-[0.99]"
                                        >
                                            <span>↓</span>
                                            Export GPX
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </aside>

                    <section className="lg:col-span-8 xl:col-span-9 space-y-4">
                        <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-2 shadow-[0_24px_120px_rgba(0,0,0,0.25)] sm:p-3">
                            <div className="relative h-[45svh] min-h-[330px] overflow-hidden rounded-[2rem] sm:h-[60vh] lg:h-[760px]">
                                <MapContainer
                                    center={startPoint || [-33.8688, 151.2093]}
                                    zoom={13}
                                    style={{ height: '100%', width: '100%' }}
                                    className="z-0"
                                >
                                    <TileLayer
                                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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

                                <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-full border border-white/10 bg-[#041723]/65 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.34em] text-white/60 sm:left-5 sm:top-5">
                                    Click anywhere to set the start point
                                </div>

                                {!startPoint && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#041723]/25 backdrop-blur-[2px]">
                                        <div className="max-w-md rounded-[1.75rem] border border-white/10 bg-[#041723]/85 px-6 py-5 text-center shadow-[0_20px_80px_rgba(0,0,0,0.4)]">
                                            <div className="text-[10px] font-black uppercase tracking-[0.45em] text-[#0093d6]">Route input needed</div>
                                            <div className="mt-3 text-sm font-medium leading-relaxed text-white/75">
                                                Search for a place or click the map to lock in your start point, then generate a route.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_80px_rgba(0,0,0,0.18)] sm:p-5">
                            <div className="mb-4 text-[10px] font-black uppercase tracking-[0.42em] text-white/35">Map states</div>
                            <div className="flex flex-wrap gap-3">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/75">
                                        <span className="h-3 w-3 rounded-full bg-[#10b981] shadow-[0_0_18px_rgba(16,185,129,0.45)]" />
                                        Active Path
                                    </span>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/75">
                                        <span className="h-0 w-0 border-l-[7px] border-r-[7px] border-t-[12px] border-l-transparent border-r-transparent border-t-[#fff917]" />
                                        High Gradient Zone
                                    </span>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/75">
                                        <span className="h-3 w-3 rounded-full bg-[#0093d6]" />
                                        Start Marker
                                    </span>
                            </div>
                        </div>
                    </section>
                </section>
            </div>
        </div>
    );
};

export default RoutePlanner;
