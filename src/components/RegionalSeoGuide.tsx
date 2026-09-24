import React, { useState } from 'react';
import { SurfSpot } from '../types';
import { Compass, Waves, Wind, MapPin, ChevronDown, ChevronUp, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface RegionalSeoGuideProps {
  spots: SurfSpot[];
  selectedSpotId: string;
  onSelectSpot: (spotId: string) => void;
}

export function RegionalSeoGuide({ spots, selectedSpotId, onSelectSpot }: RegionalSeoGuideProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <footer className="mt-8 border border-slate-200/80 bg-white/70 backdrop-blur-md rounded-2xl p-4 sm:p-6 shadow-xs text-slate-700">
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-black font-tactical uppercase tracking-wider text-slate-900">
              Noordzee Surf Voorspelling per Regio & Spot
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Actuele golfhoogte, windrichting en getijden voor Nederlandse surfspots langs de Noordzeekust.
          </p>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-mono font-bold text-slate-800 transition-colors cursor-pointer"
        >
          <span>{isOpen ? 'Minder informatie' : 'Regio gids & spots'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-cyan-600" /> : <ChevronDown className="w-3.5 h-3.5 text-cyan-600" />}
        </button>
      </div>

      {/* Quick spot pills (always visible for easy navigation & internal SEO anchors) */}
      <div className="pt-3 flex flex-wrap gap-2 items-center">
        <span className="text-[11px] font-mono font-bold text-slate-500 uppercase">Direct naar spot:</span>
        {spots.map((spot) => {
          const isSelected = spot.id === selectedSpotId;
          return (
            <button
              key={spot.id}
              onClick={() => onSelectSpot(spot.id)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border",
                isSelected
                  ? "bg-cyan-600 text-white border-cyan-600 shadow-2xs font-bold"
                  : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
              )}
            >
              <MapPin className="w-3 h-3 opacity-70" />
              <span>{spot.name}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded SEO Guide & Deep Regional Information */}
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 text-xs leading-relaxed text-slate-600">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Zuid-Holland */}
            <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60 space-y-1.5">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <Waves className="w-3.5 h-3.5 text-cyan-600" />
                <span>Zuid-Holland & Delta</span>
              </h3>
              <p>
                <strong>Ouddorp (P Noordweg):</strong> Bekend om zijn brede zandbanken op Goeree-Overflakkee. Werkt uitstekend bij noordwestelijke tot noordelijke swell met oosten- of zuidoostenwind. Let op de actieve kitesurfzone bij &gt;12 knopen.
              </p>
              <p>
                <strong>Scheveningen (Noord & Haven):</strong> De surf-hoofdstad van Nederland. De pier en havenhoofden bieden vaak beschutting bij stevige winden.
              </p>
            </div>

            {/* Zeeland */}
            <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60 space-y-1.5">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <Wind className="w-3.5 h-3.5 text-blue-600" />
                <span>Zeeland</span>
              </h3>
              <p>
                <strong>Domburg:</strong> Een van de krachtigste beachbreaks van Nederland dankzij de diepere watergeul vlak voor de kust van Walcheren. Pakt swell snel op bij opkomend tij en houdt stand bij zuidelijke winden.
              </p>
              <p>
                <strong>Brouwersdam:</strong> Ideale opstapplaats voor zowel golfsurfers als kitesurfers en wingfoilers.
              </p>
            </div>

            {/* Noord-Holland */}
            <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60 space-y-1.5">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Noord-Holland</span>
              </h3>
              <p>
                <strong>Wijk aan Zee (Noordpier):</strong> De kilometerslange pier blokkeert zuidwestenwind en creëert cleanere golven als de rest van de kust verwaaid is.
              </p>
              <p>
                <strong>Zandvoort & Bloemendaal:</strong> Goed bereikbare beachbreaks die opbloeien bij noordwestelijke deining met aflandige wind.
              </p>
            </div>
          </div>

          {/* Forecast Tips & AI Surfcoach info */}
          <div className="bg-cyan-50/60 p-3.5 rounded-xl border border-cyan-200/60 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900 block text-xs">
                Hoe werkt de nzsurf voorspelling?
              </span>
              <p className="text-slate-600 text-[11px] mt-0.5">
                Onze voorspelling combineert realtime golfhoogtes en swellrichting van Rijkswaterstaat-boeien, de ECMWF/GFS weermodellen en lokale getijdencycli. De ingebouwde AI Surfcoach koppelt deze data direct aan jouw surfboards, wetsuit en surfervaring voor het ideale sessievenster.
              </p>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
