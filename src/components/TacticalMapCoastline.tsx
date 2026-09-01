import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Navigation, 
  Compass, 
  Layers, 
  Crosshair, 
  Plus, 
  Minus, 
  Wind, 
  Waves, 
  ChevronRight, 
  Radio, 
  ShieldAlert, 
  CheckCircle2,
  Sparkles,
  Maximize2
} from 'lucide-react';
import { SurfSpot, ForecastData } from '../types';

interface TacticalMapCoastlineProps {
  spots: SurfSpot[];
  selectedSpotId: string;
  onSelectSpot: (id: string) => void;
  forecasts?: Record<string, ForecastData>;
  onOpenLiveDashboard?: () => void;
}

// Tactical map coordinates mapped to SVG relative percentages
const MAP_COORDINATES: Record<string, { x: number; y: number; label: string; score: number; status: 'POOR' | 'FAIR' | 'GOOD' | 'ACTIVE' }> = {
  'scheveningen': { x: 48, y: 44, label: 'Den Haag', score: 4.5, status: 'POOR' },
  'ouddorp': { x: 38, y: 62, label: 'Ouddorp', score: 4.7, status: 'POOR' },
  'ouddorp-p-noordweg': { x: 36, y: 64, label: 'Ouddorp NW', score: 4.2, status: 'POOR' },
  'maasvlakte': { x: 42, y: 55, label: 'Rotterdam', score: 3.8, status: 'POOR' },
  'wijk-aan-zee': { x: 56, y: 28, label: 'Wijk aan Zee', score: 5.4, status: 'FAIR' },
  'domburg': { x: 28, y: 74, label: 'Domburg', score: 6.8, status: 'GOOD' },
  'lette-blanche': { x: 22, y: 88, label: 'Lette Blanche', score: 7.5, status: 'GOOD' },
  'soulac-sandaya': { x: 24, y: 82, label: 'Soulac Plage', score: 7.2, status: 'GOOD' }
};

export const TacticalMapCoastline: React.FC<TacticalMapCoastlineProps> = ({
  spots,
  selectedSpotId,
  onSelectSpot,
  forecasts = {},
  onOpenLiveDashboard
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(18);
  const [activeFilter, setActiveFilter] = useState<'all' | 'good' | 'northsea'>('all');
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null);
  const [radarAngle, setRadarAngle] = useState<number>(0);
  const [isLiveScanning, setIsLiveScanning] = useState<boolean>(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setRadarAngle((prev) => (prev + 2) % 360);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  const selectedSpot = spots.find((s) => s.id === selectedSpotId) || spots[0];
  const currentCoord = MAP_COORDINATES[selectedSpotId] || { x: 48, y: 44, label: selectedSpot.name, score: 4.7, status: 'POOR' };

  return (
    <div className="relative w-full h-full min-h-[580px] sm:min-h-[640px] bg-[#0A0E14] text-white rounded-3xl overflow-hidden border border-white/10 select-none flex flex-col justify-between shadow-2xl">
      
      {/* Background Coastal Tactical Satellite / Vector SVG Map */}
      <div className="absolute inset-0 z-0 bg-[#0B0F17] overflow-hidden">
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(0, 210, 255, 0.15) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0, 210, 255, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />

        {/* Monochromatic Dark Coastline Map SVG */}
        <svg 
          viewBox="0 0 800 1000" 
          className="w-full h-full object-cover opacity-80"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Radar gradient sweep */}
            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00D2FF" stopOpacity="0.25" />
              <stop offset="70%" stopColor="#00D2FF" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#00D2FF" stopOpacity="0" />
            </radialGradient>
            
            <linearGradient id="coastGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#172233" />
              <stop offset="100%" stopColor="#0E1622" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Sea Depth Bathymetry Contours */}
          <path 
            d="M 50 0 Q 200 250 350 400 T 250 1000 L 0 1000 L 0 0 Z" 
            fill="#080C12" 
            opacity="0.9" 
          />
          <path 
            d="M 120 0 Q 280 270 420 440 T 320 1000 L 0 1000 L 0 0 Z" 
            fill="#0D131C" 
            opacity="0.7" 
          />
          <path 
            d="M 220 0 Q 380 320 520 520 T 420 1000 L 800 1000 L 800 0 Z" 
            fill="url(#coastGradient)" 
            stroke="#1F2E44"
            strokeWidth="1.5"
          />

          {/* Detailed Dutch & Flanders Coastline Path */}
          <path
            d="M 680 0 
               C 620 60, 580 120, 540 180 
               C 500 240, 480 300, 460 380 
               C 440 430, 420 460, 390 520 
               C 360 580, 330 640, 300 700 
               C 270 760, 240 820, 200 900 
               L 180 1000"
            fill="none"
            stroke="#00D2FF"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#glow)"
            opacity="0.9"
          />

          {/* Secondary Coastal Road & Depth Lines */}
          <path
            d="M 720 20 C 650 100, 600 200, 560 320 C 530 420, 480 500, 450 620 C 420 720, 370 820, 320 1000"
            fill="none"
            stroke="#2A3C54"
            strokeWidth="1"
            strokeDasharray="4,4"
            opacity="0.5"
          />
          <path
            d="M 790 80 C 720 180, 670 280, 630 400 C 590 520, 540 620, 500 750 C 460 850, 410 950, 390 1000"
            fill="none"
            stroke="#1C2B3E"
            strokeWidth="1"
            opacity="0.4"
          />

          {/* Regional Cities & Island Outlines */}
          {/* Texel / Waddeneilanden */}
          <ellipse cx="640" cy="110" rx="35" ry="16" fill="#141E2B" stroke="#253549" strokeWidth="1" transform="rotate(-30 640 110)" />
          {/* Zeeland Delta islands */}
          <path d="M 330 620 Q 360 635 390 615 T 430 630" fill="none" stroke="#253549" strokeWidth="2" />
          <path d="M 290 690 Q 330 710 360 680 T 400 700" fill="none" stroke="#253549" strokeWidth="2" />

          {/* Tactical connecting route vectors between key spots */}
          <polyline
            points="540,180 460,380 390,520 330,640 260,760"
            fill="none"
            stroke="#00D2FF"
            strokeWidth="1"
            strokeDasharray="6,6"
            opacity="0.4"
          />

          {/* Central Sonar / Radar Sweep Area centered at Den Haag / Scheveningen */}
          <g transform="translate(460, 380)">
            {/* Concentric radar range rings */}
            <circle cx="0" cy="0" r="80" fill="none" stroke="#00D2FF" strokeWidth="0.8" opacity="0.3" strokeDasharray="3,3" />
            <circle cx="0" cy="0" r="160" fill="none" stroke="#00D2FF" strokeWidth="0.8" opacity="0.2" strokeDasharray="4,4" />
            <circle cx="0" cy="0" r="260" fill="none" stroke="#00D2FF" strokeWidth="0.6" opacity="0.15" />
            <circle cx="0" cy="0" r="380" fill="none" stroke="#00D2FF" strokeWidth="0.5" opacity="0.1" />

            {/* Crosshair grid lines */}
            <line x1="-380" y1="0" x2="380" y2="0" stroke="#00D2FF" strokeWidth="0.5" opacity="0.15" />
            <line x1="0" y1="-380" x2="0" y2="380" stroke="#00D2FF" strokeWidth="0.5" opacity="0.15" />

            {/* Rotating Radar Sweep Cone */}
            {isLiveScanning && (
              <g transform={`rotate(${radarAngle})`}>
                <path
                  d="M 0 0 L 380 -60 A 380 380 0 0 1 380 60 Z"
                  fill="url(#radarGlow)"
                  opacity="0.8"
                />
                <line x1="0" y1="0" x2="380" y2="0" stroke="#00D2FF" strokeWidth="1.5" opacity="0.8" />
              </g>
            )}
          </g>

          {/* City label nodes */}
          <g className="text-[11px] font-mono fill-white/40 font-bold uppercase tracking-widest pointer-events-none">
            <text x="660" y="80" fill="#6B7D96">Hoddorgo •</text>
            <text x="590" y="470" fill="#4B5E78">Krysz •</text>
            <text x="460" y="720" fill="#4B5E78">Wallidomus •</text>
            <text x="180" y="780" fill="#4B5E78">Pornier •</text>
          </g>
        </svg>

        {/* Spot Interactive Pins Overlay */}
        <div className="absolute inset-0 pointer-events-auto">
          {spots.map((spot) => {
            const coord = MAP_COORDINATES[spot.id] || { 
              x: 50 + (spot.lng - 4.3) * 15, 
              y: 50 - (spot.lat - 52.0) * 20, 
              label: spot.name, 
              score: 4.5, 
              status: 'POOR' 
            };
            const isSelected = selectedSpotId === spot.id;
            const isHovered = hoveredSpotId === spot.id;

            return (
              <div
                key={spot.id}
                style={{
                  left: `${coord.x}%`,
                  top: `${coord.y}%`,
                  transform: 'translate(-50%, -50%)'
                }}
                className="absolute z-20 cursor-pointer group"
                onClick={() => onSelectSpot(spot.id)}
                onMouseEnter={() => setHoveredSpotId(spot.id)}
                onMouseLeave={() => setHoveredSpotId(null)}
              >
                {/* Sonar pulse ring when selected or high score */}
                {isSelected && (
                  <>
                    <span className="absolute -inset-4 rounded-full border border-cyan-400 opacity-75 animate-ping pointer-events-none" />
                    <span className="absolute -inset-8 rounded-full border border-cyan-400/40 pointer-events-none" />
                  </>
                )}

                {/* Target marker pin */}
                <div className="relative flex items-center justify-center">
                  <div className={`
                    w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300
                    ${isSelected 
                      ? 'bg-cyan-500 text-black shadow-[0_0_20px_#00D2FF] scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0A0E14]' 
                      : 'bg-[#101926]/90 border border-cyan-500/40 text-white hover:border-cyan-400 hover:scale-105'}
                  `}>
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-300" />
                  </div>

                  {/* Spot Score Pill & Name Label */}
                  <div className={`
                    absolute left-9 sm:left-10 flex flex-col items-start transition-all duration-200 whitespace-nowrap
                    ${isSelected || isHovered ? 'opacity-100 translate-x-0' : 'opacity-85'}
                  `}>
                    <div className="flex items-center gap-1.5 bg-[#0D131C]/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 shadow-lg">
                      <span className="text-xs sm:text-sm font-bold font-tactical tracking-wider text-white">
                        {coord.label}
                      </span>
                      <span className={`
                        text-[10px] font-mono font-black px-1.5 py-0.5 rounded
                        ${coord.score >= 6 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-orange-500/20 text-orange-300 border border-orange-500/40'}
                      `}>
                        {coord.score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Tactical Header Bar */}
      <div className="relative z-30 p-4 sm:p-5 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenLiveDashboard}
            className="w-10 h-10 rounded-xl bg-[#131B26]/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg"
          >
            <Layers className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-base sm:text-lg font-black font-tactical tracking-[0.18em] uppercase text-white">
                TACTICAL MAP
              </h2>
            </div>
            <p className="text-[10px] font-mono tracking-[0.25em] uppercase text-cyan-400/80">
              COASTLINE SURVEILLANCE • NORTH SEA
            </p>
          </div>
        </div>

        {/* Live Status indicator & toggle radar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLiveScanning(!isLiveScanning)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest border transition-all
              ${isLiveScanning 
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300 shadow-[0_0_12px_rgba(0,210,255,0.2)]' 
                : 'bg-white/5 border-white/10 text-white/50'}
            `}
          >
            <Radio className={`w-3.5 h-3.5 ${isLiveScanning ? 'animate-spin' : ''}`} />
            <span>{isLiveScanning ? 'RADAR LIVE' : 'RADAR PAUZE'}</span>
          </button>
        </div>
      </div>

      {/* Floating Tactical Map Controls (Right & Left Bottom) */}
      <div className="relative z-30 p-4 sm:p-5 flex items-end justify-between pointer-events-auto">
        {/* Left Side: Scale & Zoom Controls */}
        <div className="space-y-3">
          {/* Zoom Pill (+ / 18m / -) */}
          <div className="flex flex-col items-center bg-[#131B26]/85 backdrop-blur-md rounded-2xl border border-white/10 p-1 shadow-2xl">
            <button 
              onClick={() => setZoomLevel((prev) => Math.min(prev + 2, 24))}
              className="p-2 text-white/70 hover:text-cyan-400 hover:bg-white/5 rounded-xl transition-colors"
              title="Inzoomen"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="py-1 text-[11px] font-mono font-bold text-cyan-400 tracking-wider">
              {zoomLevel}m
            </div>
            <button 
              onClick={() => setZoomLevel((prev) => Math.max(prev - 2, 10))}
              className="p-2 text-white/70 hover:text-cyan-400 hover:bg-white/5 rounded-xl transition-colors"
              title="Uitzoomen"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>

          {/* Distance Scale [ 0 | 200 km ] */}
          <div className="bg-[#131B26]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono text-white/50">0</span>
              <div className="w-12 h-0.5 bg-cyan-400/60 relative">
                <span className="absolute -top-1 left-0 w-0.5 h-2.5 bg-cyan-400" />
                <span className="absolute -top-1 right-0 w-0.5 h-2.5 bg-cyan-400" />
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold text-white/80">200 km</span>
          </div>
        </div>

        {/* Right Side: Re-center target & Active Selected Spot Quick Card */}
        <div className="flex flex-col items-end gap-3 max-w-[260px] sm:max-w-xs">
          {/* Compass / Location Re-Center Button */}
          <button 
            onClick={() => onSelectSpot('scheveningen')}
            className="w-11 h-11 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,210,255,0.4)] hover:scale-105 active:scale-95 transition-all"
            title="Centreren op Den Haag / Scheveningen"
          >
            <Navigation className="w-5 h-5 fill-current" />
          </button>

          {/* Selected Spot Quick Info HUD Card */}
          <div className="w-full bg-[#101722]/90 backdrop-blur-xl rounded-2xl border border-cyan-500/30 p-3.5 shadow-2xl space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest">
                  TARGET LOCK
                </span>
                <h3 className="text-sm sm:text-base font-black font-tactical uppercase tracking-wider text-white">
                  {selectedSpot.name}
                </h3>
              </div>
              <div className="text-right">
                <span className={`
                  text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border
                  ${currentCoord.score >= 6 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' 
                    : 'bg-orange-500/20 text-orange-300 border-orange-400/40'}
                `}>
                  {currentCoord.score.toFixed(1)} / 10
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-white/70">
                <Waves className="w-3.5 h-3.5 text-cyan-400" />
                <span>1.3m (5s)</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/70">
                <Wind className="w-3.5 h-3.5 text-cyan-400" />
                <span>25 kn (NNO)</span>
              </div>
            </div>

            {onOpenLiveDashboard && (
              <button
                onClick={onOpenLiveDashboard}
                className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-tactical uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg transition-all"
              >
                <span>OPEN DASHBOARD</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
