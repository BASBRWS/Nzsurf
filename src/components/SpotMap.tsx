import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SurfSpot } from '../types';
import { Locate, MapPin, Eye, Wind } from 'lucide-react';
import { cn } from '../lib/utils';
import { isOuddorpNoordwegKiteZone } from '../utils/kiteAlertUtils';

// Fix for default marker icons in Leaflet with React
const customIcon = new L.DivIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-6 h-6 bg-accent/20 rounded-full animate-ping"></div>
      <div class="w-4 h-4 bg-accent rounded-full border-2 border-marine-950 shadow-xl flex items-center justify-center">
      </div>
    </div>
  `,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const selectedIcon = new L.DivIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-10 h-10 bg-white/20 rounded-full animate-ping"></div>
      <div class="w-6 h-6 bg-white rounded-full border-4 border-marine-950 shadow-2xl flex items-center justify-center ring-2 ring-accent">
      </div>
    </div>
  `,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

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
        ${isSelected ? '<div class="absolute w-12 h-12 bg-accent/20 rounded-full animate-ping"></div>' : ''}
        <div class="group relative flex flex-col items-center">
          ${forecast ? `
            <div class="absolute -top-10 bg-marine-900 border border-white/20 rounded-full px-2 py-0.5 text-[8px] font-black text-accent shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              ${forecast.waveHeight}m • ${forecast.swellPeriod}s
            </div>
          ` : ''}
          <div class="w-5 h-5 ${isSelected ? 'bg-white' : 'bg-accent'} rounded-full border-2 border-marine-950 shadow-xl flex items-center justify-center transition-transform ${isSelected ? 'scale-125 ring-2 ring-accent ring-offset-2 ring-offset-marine-950' : 'hover:scale-110'}">
            ${isSelected ? '<div class="w-1.5 h-1.5 bg-accent rounded-full"></div>' : ''}
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
        <div className="p-4 min-w-[200px] glass-dark rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3 text-accent" />
              <h4 className="text-xs font-black text-white uppercase tracking-wider">{spot.name}</h4>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {isOuddorpNoordwegKiteZone(spot) && forecast && (forecast.windSpeed || 0) >= 12 && (
                <span className="text-[7px] font-mono bg-amber-500/20 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5">
                  <Wind className="w-2 h-2" /> Veel Kiters
                </span>
              )}
              {(spot.id.startsWith('custom-') || spot.id.startsWith('shared-')) && (
                <span className="text-[7px] font-mono bg-white/10 px-1.5 py-0.5 rounded uppercase text-white/40">Draggable</span>
              )}
            </div>
          </div>
          
          {forecast && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-white/5 p-2 rounded-xl text-center">
                <p className="text-[7px] font-mono text-white/30 uppercase mb-1">Golven</p>
                <p className="text-xs font-bold">{forecast.waveHeight}m</p>
              </div>
              <div className="bg-white/5 p-2 rounded-xl text-center">
                <p className="text-[7px] font-mono text-white/30 uppercase mb-1">Wind</p>
                <p className="text-xs font-bold">{forecast.windSpeed}kn</p>
              </div>
            </div>
          )}

          <button 
            onClick={() => onSelect(spot.id)}
            className="w-full bg-accent text-marine-950 text-[10px] py-2 rounded-xl font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-accent/20"
          >
            Analyseer Deze Spot
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
        <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-xl"></div>
      </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center">
            <Locate className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/50">Tactical Map</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-white/20 italic">
          <Eye className="w-3 h-3" />
          Coastline Surveillance
        </div>
      </div>

      <div className="h-[500px] md:h-[600px] w-full rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl relative z-10 glass-dark">
        {/* Floating Quick Select Drawer (Top Right) - Hidden on mobile for cleaner UX */}
        <div className="absolute top-6 right-6 z-[1000] hidden md:flex flex-col gap-2 max-h-[70%] overflow-y-auto no-scrollbar scrollbar-hide">
          {spots.map(spot => (
            <button
              key={spot.id}
              onClick={() => onSelectSpot(spot.id)}
              className={cn(
                "px-4 py-2 rounded-full text-[9px] font-mono uppercase tracking-widest border transition-all shadow-xl whitespace-nowrap text-right flex items-center gap-3 justify-end group backdrop-blur-2xl",
                selectedSpotId === spot.id 
                  ? "bg-accent/90 text-marine-950 border-accent shadow-accent/20" 
                  : "bg-marine-950/40 text-white/40 border-white/5 hover:border-white/20 hover:text-white"
              )}
            >
              <span className={cn(
                "transition-all",
                selectedSpotId === spot.id ? "font-black" : "font-medium"
              )}>{spot.name}</span>
              <div className={cn(
                "w-2 h-2 rounded-full",
                selectedSpotId === spot.id ? "bg-marine-950" : "bg-white/10"
              )} />
            </button>
          ))}
        </div>

        {/* Info Legend (Bottom Left) */}
        <div className="absolute bottom-16 left-6 z-[1000] glass-dark p-4 rounded-3xl border border-white/5 shadow-2xl max-w-xs pointer-events-none hidden md:block">
          <p className="text-[10px] font-black uppercase text-accent mb-2">Operationeel Overview</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[8px] font-mono uppercase text-white/40">
              <div className="w-2 h-2 bg-accent rounded-full" />
              <span>Scherpe offshore wind op 70% van de spots</span>
            </div>
            <div className="flex items-center gap-2 text-[8px] font-mono uppercase text-white/40">
              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
              <span>Swell influx verwacht morgen om 09:00</span>
            </div>
          </div>
        </div>

        <MapContainer 
          center={center} 
          zoom={8} 
          scrollWheelZoom={false}
          className="h-full w-full grayscale contrast-125 invert brightness-75 hue-rotate-180" // Technical map look
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
                  <p className="text-[10px] font-black uppercase text-blue-500">Jouw Positie</p>
                </div>
              </Popup>
            </Marker>
          )}

          <MapEvents onCustomSpot={onCustomSpot} />
        </MapContainer>
        
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-6 py-2 bg-marine-950/80 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl max-md:hidden">
          <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest text-center whitespace-nowrap">
            Versleep <span className="text-accent underline font-bold px-1 italic">custom nodes</span> • Hover markers voor live data
          </p>
        </div>

        {/* Mobile Spot Picker (Bottom) */}
        <div className="absolute bottom-4 left-4 right-4 z-[1000] md:hidden">
          <div className="flex gap-2 overflow-x-auto no-scrollbar scrollbar-hide pb-2">
            {spots.map(spot => (
              <button
                key={spot.id}
                onClick={() => onSelectSpot(spot.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap backdrop-blur-3xl",
                  selectedSpotId === spot.id 
                    ? "bg-accent/90 text-marine-950 border-accent shadow-xl shadow-accent/20" 
                    : "bg-marine-950/60 text-white/40 border-white/10"
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
