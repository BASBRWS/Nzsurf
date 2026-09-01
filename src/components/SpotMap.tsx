import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SurfSpot, ForecastData } from '../types';
import { Locate, MapPin, Eye, Wind, Waves, Navigation, Sparkles, Crosshair } from 'lucide-react';
import { cn } from '../lib/utils';
import { isOuddorpNoordwegKiteZone } from '../utils/kiteAlertUtils';

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

interface SpotMapProps {
  spots: SurfSpot[];
  selectedSpotId: string;
  onSelectSpot: (spotId: string) => void;
  onCustomSpot?: (lat: number, lng: number) => void;
  onUpdateSpotLocation?: (id: string, lat: number, lng: number) => void;
  forecasts?: Record<string, any>;
  userCoords?: { lat: number, lng: number } | null;
}

function DraggableMarker({ 
  spot, 
  isSelected, 
  onSelect, 
  onDrag,
  forecast 
}: { 
  key?: string;
  spot: SurfSpot; 
  isSelected: boolean; 
  onSelect: (id: string) => void;
  onDrag?: (id: string, lat: number, lng: number) => void;
  forecast?: any;
}) {
  const markerRef = React.useRef<L.Marker>(null);
  
  const eventHandlers = React.useMemo(() => ({
    dragend() {
      const marker = markerRef.current;
      if (marker != null && onDrag) {
        const { lat, lng } = marker.getLatLng();
        onDrag(spot.id, lat, lng);
      }
    },
  }), [onDrag, spot.id]);

  const iconWithData = new L.DivIcon({
    html: `
      <div class="relative flex items-center justify-center">
        ${isSelected ? '<div class="absolute w-12 h-12 bg-cyan-500/30 rounded-full animate-ping"></div>' : ''}
        <div class="group relative flex flex-col items-center">
          ${forecast ? `
            <div class="absolute -top-9 bg-slate-900/90 text-cyan-300 border border-cyan-400/30 rounded-full px-2.5 py-0.5 text-[9px] font-mono font-bold shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              ${forecast.waveHeight}m • ${forecast.swellPeriod}s
            </div>
          ` : ''}
          <div class="w-6 h-6 ${isSelected ? 'bg-cyan-500 text-white ring-4 ring-cyan-500/30' : 'bg-slate-900 text-white hover:bg-cyan-600'} rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-all ${isSelected ? 'scale-125' : 'hover:scale-110'}">
            <div class="w-2 h-2 ${isSelected ? 'bg-white' : 'bg-cyan-400'} rounded-full"></div>
          </div>
        </div>
      </div>
    `,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  return (
    <Marker
      draggable={spot.id.startsWith('custom-') || spot.id.startsWith('shared-')}
      eventHandlers={eventHandlers}
      position={[spot.lat, spot.lng]}
      icon={iconWithData}
      ref={markerRef}
    >
      <Popup className="custom-popup">
        <div className="p-4 min-w-[220px] bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-2xl text-slate-900">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-600" />
              <h4 className="text-sm font-black font-tactical text-slate-900 uppercase tracking-wider">{spot.name}</h4>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {isOuddorpNoordwegKiteZone(spot) && forecast && (forecast.windSpeed || 0) >= 12 && (
                <span className="text-[8px] font-mono bg-amber-50 border border-amber-300 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                  <Wind className="w-2.5 h-2.5" /> Kitezone
                </span>
              )}
            </div>
          </div>
          
          {forecast && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                <p className="text-[8px] font-mono text-slate-400 uppercase mb-0.5">Golven</p>
                <p className="text-xs font-bold text-slate-800">{forecast.waveHeight}m</p>
              </div>
              <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                <p className="text-[8px] font-mono text-slate-400 uppercase mb-0.5">Wind</p>
                <p className="text-xs font-bold text-slate-800">{forecast.windSpeed}kn</p>
              </div>
            </div>
          )}

          <button 
            onClick={() => onSelect(spot.id)}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs py-2 rounded-xl font-black font-tactical uppercase tracking-widest transition-all shadow-md cursor-pointer"
          >
            Selecteer Deze Spot
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

function MapEvents({ onCustomSpot }: { onCustomSpot?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onCustomSpot) {
        onCustomSpot(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export function SpotMap({ 
  spots, 
  selectedSpotId, 
  onSelectSpot, 
  onCustomSpot,
  onUpdateSpotLocation,
  forecasts,
  userCoords
}: SpotMapProps) {
  const center: [number, number] = userCoords ? [userCoords.lat, userCoords.lng] : [52.3, 4.5];

  const selectedSpot = React.useMemo(() => 
    spots.find(s => s.id === selectedSpotId)
  , [spots, selectedSpotId]);

  const userIcon = new L.DivIcon({
    html: `
      <div class="relative flex items-center justify-center">
        <div class="absolute w-8 h-8 bg-blue-500/20 rounded-full animate-ping"></div>
        <div class="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-xl"></div>
      </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <div className="space-y-3">
      {/* Header Info */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 shadow-sm">
            <Locate className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-slate-500">
              Interactieve Kustkaart
            </h3>
            <p className="text-sm font-black font-tactical uppercase text-slate-800 tracking-wide">
              Noordzee & Spot Locaties
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold bg-white/80 px-2.5 py-1 rounded-full border border-slate-200 shadow-sm">
          <Eye className="w-3.5 h-3.5 text-cyan-600" />
          <span>Realtime Kaart</span>
        </div>
      </div>

      {/* Map Container with Light Theming */}
      <div className="h-[480px] sm:h-[540px] md:h-[600px] w-full rounded-[2rem] overflow-hidden border border-slate-200/90 shadow-xl relative z-10 bg-slate-100">
        
        {/* Floating Quick Select Drawer (Top Right on desktop) */}
        <div className="absolute top-4 right-4 z-[1000] hidden sm:flex flex-col gap-1.5 max-h-[70%] overflow-y-auto no-scrollbar scrollbar-hide">
          {spots.map(spot => (
            <button
              key={spot.id}
              onClick={() => onSelectSpot(spot.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider border transition-all shadow-md whitespace-nowrap text-right flex items-center gap-2 justify-end backdrop-blur-xl cursor-pointer",
                selectedSpotId === spot.id 
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-cyan-500/20" 
                  : "bg-white/85 text-slate-700 border-slate-200/80 hover:bg-white hover:text-slate-900"
              )}
            >
              <span>{spot.name}</span>
              <div className={cn(
                "w-2 h-2 rounded-full",
                selectedSpotId === spot.id ? "bg-slate-950" : "bg-slate-300"
              )} />
            </button>
          ))}
        </div>

        <MapContainer 
          center={center} 
          zoom={8} 
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <ChangeView center={selectedSpot ? [selectedSpot.lat, selectedSpot.lng] : center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {spots.map((spot) => (
            <DraggableMarker 
              key={spot.id}
              spot={spot}
              isSelected={spot.id === selectedSpotId}
              onSelect={onSelectSpot}
              onDrag={onUpdateSpotLocation}
              forecast={forecasts?.[spot.id]}
            />
          ))}

          {userCoords && (
            <Marker position={[userCoords.lat, userCoords.lng]} icon={userIcon}>
              <Popup>
                <div className="p-2 text-center">
                  <p className="text-[10px] font-black uppercase text-blue-600">Jouw Positie</p>
                </div>
              </Popup>
            </Marker>
          )}

          <MapEvents onCustomSpot={onCustomSpot} />
        </MapContainer>
        
        {/* Spot selection bottom bar on mobile */}
        <div className="absolute bottom-3 left-3 right-3 z-[1000]">
          <div className="bg-white/90 backdrop-blur-xl p-2 rounded-2xl border border-slate-200/90 shadow-xl flex items-center gap-2 overflow-x-auto no-scrollbar scrollbar-hide">
            {spots.map(spot => (
              <button
                key={spot.id}
                onClick={() => onSelectSpot(spot.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-bold font-tactical uppercase tracking-wider border transition-all whitespace-nowrap shrink-0 cursor-pointer",
                  selectedSpotId === spot.id 
                    ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md" 
                    : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                )}
              >
                {spot.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
