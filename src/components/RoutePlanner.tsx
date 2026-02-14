import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
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

// Component to handle map clicks for setting start point
const MapPicker: React.FC<{ onPick: (pos: [number, number]) => void }> = ({ onPick }) => {
    useMapEvents({
        click(e) {
            onPick([e.latlng.lat, e.latlng.lng]);
        },
    });
    return null;
};

// Component to recenter map when route is selected
const MapRecenter: React.FC<{ points: RoutePoint[] }> = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [points, map]);
    return null;
};

// Component to recenter map when startPoint is set or changed
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

const RoutePlanner: React.FC = () => {
    const navigate = useNavigate();
    const [targetDistance, setTargetDistance] = useState(5); // Default 5km
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

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load recent start point from local storage or detect location
    useEffect(() => {
        const saved = localStorage.getItem('runviz_last_start_point');
        if (saved) {
            setStartPoint(JSON.parse(saved));
        } else if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
                    setStartPoint(pos);
                },
                (error) => {
                    console.error("Error getting location:", error);
                }
            );
        }
    }, []);

    // Reverse geocode when startPoint changes
    useEffect(() => {
        if (startPoint) {
            setSearching(true);
            geocoding.reverse(startPoint[0], startPoint[1])
                .then(data => {
                    if (data.display_name) {
                        setResolvedAddress(data.display_name.split(',').slice(0, 3).join(','));
                    }
                })
                .catch(err => console.error("Geocoding error:", err))
                .finally(() => setSearching(false));
        }
    }, [startPoint]);

    // Handle typing in search bar (Autocomplete)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.length > 2) {
                setSearching(true);
                try {
                    const data = await geocoding.search(searchQuery);
                    setSuggestions(data);
                    setShowSuggestions(true);
                } catch (err) {
                    console.error("Autocomplete error:", err);
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

    const selectSuggestion = (s: Suggestion) => {
        const pos: [number, number] = [parseFloat(s.lat), parseFloat(s.lon)];
        handlePickStart(pos);
        setSearchQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
        setResolvedAddress(s.display_name.split(',').slice(0, 3).join(','));
    };

    const handlePickStart = useCallback((pos: [number, number]) => {
        setStartPoint(pos);
        localStorage.setItem('runviz_last_start_point', JSON.stringify(pos));
    }, []);

    const useCurrentLocation = () => {
        if ("geolocation" in navigator) {
            setSearching(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
                    handlePickStart(pos);
                    setSearching(false);
                },
                (error) => {
                    console.error("Error getting location:", error);
                    setError("Could not get your location.");
                    setSearching(false);
                }
            );
        }
    };

    const adjustDistance = (delta: number) => {
        setTargetDistance(prev => {
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
                targetDistanceMeters: targetDistance * 1000
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

    const selectedRoute = generatedRoutes.find(r => r.id === selectedRouteId);

    const downloadGPX = (route: GeneratedRoute) => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunViz" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${route.name}</name>
  </metadata>
  <trk>
    <name>${route.name}</name>
    <trkseg>
      ${route.points.map(p => `<trkpt lat="${p.lat}" lon="${p.lng}">${p.elevation ? `<ele>${p.elevation}</ele>` : ''}</trkpt>`).join('\n      ')}
    </trkseg>
  </trk>
</gpx>`;

        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${route.name.replace(/\s+/g, '_')}.gpx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-[#0a0c10] text-gray-200">
            <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-6 sm:pb-8">
                <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mb-6 sm:mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform font-bold text-xl">←</span>
                        <span className="text-xs font-black uppercase tracking-widest leading-none">Back</span>
                    </button>
                    <h1 className="text-lg sm:text-2xl font-black italic tracking-tighter text-center truncate">
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            ROUTE PLANNER
                        </span>
                    </h1>
                    <div className="w-8 sm:w-20" />
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Controls Panel */}
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-white/5 rounded-[2rem] p-4 sm:p-6 border border-white/10 shadow-2xl backdrop-blur-xl relative">
                            <div className="mb-6" ref={suggestionRef}>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search location..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors pr-24"
                                    />
                                    <div className="absolute right-3 inset-y-0 flex items-center gap-2 pointer-events-none">
                                        <button
                                            type="button"
                                            onClick={useCurrentLocation}
                                            className="text-gray-500 hover:text-emerald-400 transition-colors w-8 h-8 flex items-center justify-center active:scale-95 pointer-events-auto"
                                            title="Use current location"
                                        >
                                            <span className="text-lg leading-none">🎯</span>
                                        </button>
                                        <div className="text-gray-500 flex items-center justify-center w-8 h-8 opacity-40">
                                            {searching ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <span className="text-lg leading-none">🔍</span>
                                            )}
                                        </div>
                                    </div>

                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1c22] border border-white/10 rounded-xl overflow-hidden z-[1001] shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
                                            {suggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="w-full px-4 py-3 text-left text-xs text-gray-400 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0"
                                                >
                                                    <div className="font-bold truncate">{s.display_name.split(',')[0]}</div>
                                                    <div className="text-[10px] opacity-50 truncate">{s.display_name.split(',').slice(1).join(',')}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {resolvedAddress && !showSuggestions && (
                                    <div className="mt-2 text-[10px] font-bold text-emerald-400/70 uppercase tracking-wider line-clamp-1">
                                        📍 {resolvedAddress}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                                            Target Distance
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => adjustDistance(-1)}
                                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-xl font-bold transition-all active:scale-95"
                                            >-</button>
                                            <span className="text-xl font-black text-white italic min-w-[3rem] text-center">{targetDistance}<span className="text-[10px] font-bold not-italic ml-0.5">KM</span></span>
                                            <button
                                                onClick={() => adjustDistance(1)}
                                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-xl font-bold transition-all active:scale-95"
                                            >+</button>
                                        </div>
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-400 text-[10px] font-bold">
                                        {error}
                                    </div>
                                )}

                                <button
                                    onClick={generateRoutes}
                                    disabled={loading || !startPoint}
                                    className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-xs ${loading || !startPoint
                                        ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                                        : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98]'
                                        }`}
                                >
                                    {loading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <><span>✨</span> GENERATE ROUTES</>
                                    )}
                                </button>
                            </div>
                        </div>

                        {generatedRoutes.length > 0 && (
                            <div className="bg-white/5 rounded-[2rem] p-4 sm:p-6 border border-white/10 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500 max-h-[42vh] sm:max-h-[500px] overflow-y-auto custom-scrollbar">
                                <h2 className="text-sm font-black text-white mb-4 uppercase tracking-widest opacity-50 sticky top-0 py-1 z-10 bg-[#11141b]/95 backdrop-blur-sm">
                                    Routes
                                </h2>
                                <div className="space-y-2 pb-16">
                                    {[...generatedRoutes].sort((a, b) => a.elevationGain - b.elevationGain).map((route) => (
                                        <button
                                            key={route.id}
                                            onClick={() => setSelectedRouteId(route.id)}
                                            className={`w-full p-3 rounded-xl border transition-all text-left group ${selectedRouteId === route.id
                                                ? 'bg-emerald-500/10 border-emerald-500 text-white'
                                                : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-0.5">
                                                <div className="font-black text-xs uppercase tracking-tight line-clamp-1">{route.name}</div>
                                                {selectedRouteId === route.id && (
                                                    <span className="text-emerald-400 text-xs">✓</span>
                                                )}
                                            </div>
                                            <div className="flex gap-3 text-[10px] font-bold text-gray-500">
                                                <span>📏 {(route.distance / 1000).toFixed(2)}km</span>
                                                <span>⏱️ {Math.round(route.estimatedTime / 60)}m</span>
                                                {route.elevationGain > 0 && (
                                                    <span>⛰️ {Math.round(route.elevationGain)}m</span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {selectedRoute && (
                                    <button
                                        onClick={() => downloadGPX(selectedRoute)}
                                        className="w-full mt-4 py-3.5 rounded-xl bg-[#1a1d24]/95 hover:bg-[#1f232d]/95 border border-white/10 text-white font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-xs sticky bottom-0 z-10 backdrop-blur-sm"
                                    >
                                        <span>💾</span> DOWNLOAD GPX
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Map Panel */}
                    <div className="lg:col-span-8">
                        <div className="bg-white/5 rounded-[2rem] sm:rounded-[3rem] p-2 sm:p-3 border border-white/10 shadow-2xl h-[44svh] min-h-[280px] sm:h-[55vh] sm:min-h-[360px] lg:h-[700px] relative overflow-hidden group">
                            <MapContainer
                                center={startPoint || [-33.8688, 151.2093]}
                                zoom={13}
                                style={{ height: '100%', width: '100%', borderRadius: '2rem' }}
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
                                            pathOptions={{ color: '#10b981', weight: 6, opacity: 0.8 }}
                                            positions={selectedRoute.points.map(p => [p.lat, p.lng])}
                                        />
                                        <MapRecenter points={selectedRoute.points} />
                                    </>
                                )}
                            </MapContainer>
                            {!startPoint && (
                                <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                                    <div className="bg-[#0a0c10]/80 backdrop-blur-md px-4 sm:px-8 py-3 sm:py-4 rounded-2xl border border-white/10 text-white text-[10px] sm:text-sm font-black uppercase tracking-widest animate-pulse text-center">
                                        Click map to set start point
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoutePlanner;
