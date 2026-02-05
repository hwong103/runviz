import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { routes as routesApi } from '../services/api';
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
    const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

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
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${startPoint[0]}&lon=${startPoint[1]}`)
                .then(res => res.json())
                .then(data => {
                    if (data.display_name) {
                        setResolvedAddress(data.display_name.split(',').slice(0, 3).join(','));
                    }
                })
                .catch(err => console.error("Geocoding error:", err));
        }
    }, [startPoint]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setSearching(true);
        setError(null);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
            const data = await res.json();
            if (data && data.length > 0) {
                const pos: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                handlePickStart(pos);
                setSearchQuery('');
            } else {
                setError('Location not found');
            }
        } catch (err) {
            console.error("Search error:", err);
            setError('Search failed');
        } finally {
            setSearching(false);
        }
    };

    const handlePickStart = useCallback((pos: [number, number]) => {
        setStartPoint(pos);
        localStorage.setItem('runviz_last_start_point', JSON.stringify(pos));
    }, []);

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
        } catch (err) {
            console.error('Failed to generate routes:', err);
            setError('Failed to generate routes. Please check your API configuration.');
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
            <div className="max-w-[1600px] mx-auto px-6 py-8">
                <header className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform font-bold text-xl">←</span>
                        <span className="text-xs font-black uppercase tracking-widest leading-none">Back</span>
                    </button>
                    <h1 className="text-2xl font-black italic tracking-tighter">
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            ROUTE PLANNER
                        </span>
                    </h1>
                    <div className="w-20" />
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Controls Panel */}
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-white/5 rounded-[2rem] p-6 border border-white/10 shadow-2xl backdrop-blur-xl">
                            <form onSubmit={handleSearch} className="mb-6">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search location..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors pr-10"
                                    />
                                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                                        {searching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🔍'}
                                    </button>
                                </div>
                                {resolvedAddress && (
                                    <div className="mt-2 text-[10px] font-bold text-emerald-400/70 uppercase tracking-wider line-clamp-1">
                                        📍 {resolvedAddress}
                                    </div>
                                )}
                            </form>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                                            Distance
                                        </label>
                                        <span className="text-xl font-black text-white italic">{targetDistance}km</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1"
                                        max="50"
                                        step="0.5"
                                        value={targetDistance}
                                        onChange={(e) => setTargetDistance(parseFloat(e.target.value))}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-400 text-[10px] font-bold">
                                        {error}
                                    </div>
                                )}

                                <button
                                    onClick={generateRoutes}
                                    disabled={loading || !startPoint}
                                    className={`w-full py-3.5 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-xs ${loading || !startPoint
                                        ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                                        : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98]'
                                        }`}
                                >
                                    {loading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <><span>✨</span> GENERATE</>
                                    )}
                                </button>
                            </div>
                        </div>

                        {generatedRoutes.length > 0 && (
                            <div className="bg-white/5 rounded-[2rem] p-6 border border-white/10 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h2 className="text-sm font-black text-white mb-4 uppercase tracking-widest opacity-50">Options</h2>
                                <div className="space-y-2">
                                    {generatedRoutes.map((route) => (
                                        <button
                                            key={route.id}
                                            onClick={() => setSelectedRouteId(route.id)}
                                            className={`w-full p-3 rounded-xl border transition-all text-left group ${selectedRouteId === route.id
                                                ? 'bg-emerald-500/10 border-emerald-500 text-white'
                                                : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-0.5">
                                                <div className="font-black text-xs uppercase tracking-tight">{route.name}</div>
                                                {selectedRouteId === route.id && (
                                                    <span className="text-emerald-400 text-xs">✓</span>
                                                )}
                                            </div>
                                            <div className="flex gap-4 text-[10px] font-bold text-gray-500">
                                                <span>📏 {(route.distance / 1000).toFixed(2)}km</span>
                                                <span>⏱️ {Math.round(route.estimatedTime / 60)} min</span>
                                                {route.elevationGain > 0 && (
                                                    <span>{Math.round(route.elevationGain)}m ⛰️</span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {selectedRoute && (
                                    <button
                                        onClick={() => downloadGPX(selectedRoute)}
                                        className="w-full mt-4 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-xs"
                                    >
                                        <span>💾</span> DOWNLOAD GPX
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Map Panel */}
                    <div className="lg:col-span-8">
                        <div className="bg-white/5 rounded-[3rem] p-3 border border-white/10 shadow-2xl h-[700px] relative overflow-hidden group">
                            <MapContainer
                                center={startPoint || [-33.8688, 151.2093]}
                                zoom={13}
                                style={{ height: '100%', width: '100%', borderRadius: '2.5rem' }}
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
                                    <div className="bg-[#0a0c10]/80 backdrop-blur-md px-8 py-4 rounded-2xl border border-white/10 text-white font-black uppercase tracking-widest animate-pulse">
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
