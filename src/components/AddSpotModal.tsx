import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Compass, Wind, Waves, Navigation, Sparkles, Share2, Check, Locate } from 'lucide-react';
import { SurfSpot } from '../types';

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSpot: (spotData: {
    name: string;
    lat: number;
    lng: number;
    type: 'beachbreak' | 'pointbreak' | 'reefbreak';
    bestWind: string[];
    bestSwell: string[];
    coastlineAngle: number;
    isPublic: boolean;
  }) => Promise<void> | void;
  initialCoords?: { lat: number; lng: number } | null;
  isLoggedIn?: boolean;
}

const REGION_PRESETS = [
  {
    name: 'Zuid-Holland',
    sub: 'bijv. Katwijk, Monster, Kijkduin',
    sampleLat: 52.05,
    sampleLng: 4.22,
    angle: 305,
    wind: ['O', 'ZO', 'NO'],
    swell: ['NW', 'WNW', 'W'],
    type: 'beachbreak' as const
  },
  {
    name: 'Noord-Holland',
    sub: 'bijv. Zandvoort, Bloemendaal, IJmuiden',
    sampleLat: 52.38,
    sampleLng: 4.53,
    angle: 300,
    wind: ['O', 'ZO'],
    swell: ['NW', 'WNW', 'W'],
    type: 'beachbreak' as const
  },
  {
    name: 'Zeeland',
    sub: 'bijv. Brouwersdam, Vrouwenpolder',
    sampleLat: 51.75,
    sampleLng: 3.84,
    angle: 320,
    wind: ['ZO', 'Z', 'O'],
    swell: ['NW', 'N'],
    type: 'beachbreak' as const
  },
  {
    name: 'Waddeneilanden',
    sub: 'bijv. Texel Paal 17, Terschelling',
    sampleLat: 53.08,
    sampleLng: 4.72,
    angle: 315,
    wind: ['Z', 'ZO', 'O'],
    swell: ['NW', 'N', 'WNW'],
    type: 'beachbreak' as const
  }
];

const WIND_DIRECTIONS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
const SWELL_DIRECTIONS = ['N', 'NNW', 'NW', 'WNW', 'W', 'ZW'];

export function AddSpotModal({
  isOpen,
  onClose,
  onAddSpot,
  initialCoords,
  isLoggedIn = false
}: AddSpotModalProps) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [type, setType] = useState<'beachbreak' | 'pointbreak' | 'reefbreak'>('beachbreak');
  const [bestWind, setBestWind] = useState<string[]>(['O', 'ZO']);
  const [bestSwell, setBestSwell] = useState<string[]>(['NW', 'WNW', 'W']);
  const [coastlineAngle, setCoastlineAngle] = useState<number>(300);
  const [isPublic, setIsPublic] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initial coordinates when modal opens or coordinates change
  useEffect(() => {
    if (initialCoords) {
      setLat(initialCoords.lat.toFixed(4));
      setLng(initialCoords.lng.toFixed(4));
    } else if (isOpen && !lat && !lng) {
      // Default to central Dutch coast if empty
      setLat('52.1100');
      setLng('4.2700');
    }
  }, [initialCoords, isOpen]);

  const handleApplyPreset = (preset: typeof REGION_PRESETS[0]) => {
    setCoastlineAngle(preset.angle);
    setBestWind(preset.wind);
    setBestSwell(preset.swell);
    setType(preset.type);
    if (!initialCoords) {
      setLat(preset.sampleLat.toFixed(4));
      setLng(preset.sampleLng.toFixed(4));
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocatie wordt niet ondersteund door je browser.');
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4));
        setLng(pos.coords.longitude.toFixed(4));
        setIsLocating(false);
      },
      (err) => {
        setError('Kon huidige locatie niet ophalen. Voer de coördinaten handmatig in.');
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const toggleWind = (dir: string) => {
    setBestWind(prev => 
      prev.includes(dir) ? prev.filter(d => d !== dir) : [...prev, dir]
    );
  };

  const toggleSwell = (dir: string) => {
    setBestSwell(prev => 
      prev.includes(dir) ? prev.filter(d => d !== dir) : [...prev, dir]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (!name.trim()) {
      setError('Vul een herkenbare naam in voor de surfspot (bijv. "Katwijk Noord").');
      return;
    }

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setError('Vul een geldige breedtegraad (Latitude) in tussen -90 en 90.');
      return;
    }

    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setError('Vul een geldige lengtegraad (Longitude) in tussen -180 en 180.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddSpot({
        name: name.trim(),
        lat: parsedLat,
        lng: parsedLng,
        type,
        bestWind: bestWind.length > 0 ? bestWind : ['O', 'ZO'],
        bestSwell: bestSwell.length > 0 ? bestSwell : ['NW', 'WNW'],
        coastlineAngle: Number(coastlineAngle) || 300,
        isPublic
      });
      // Reset form
      setName('');
      onClose();
    } catch (err: any) {
      console.error('Error adding spot:', err);
      setError(err?.message || 'Er is een fout opgetreden bij het toevoegen van de spot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-10 my-auto text-slate-800"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 shadow-xs">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black font-tactical uppercase tracking-wider text-slate-900">
                  Nieuwe Surfspot Aanmaken
                </h3>
                <p className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
                  Live voorspelling & AI-advies voor jouw locatie
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Sluiten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Quick Regional Presets */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Snelle Regio Presets (Optioneel)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {REGION_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-300 text-left transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-cyan-700">
                      {preset.name}
                    </div>
                    <div className="text-[9px] text-slate-400 line-clamp-1 mt-0.5 font-mono">
                      Offshore: {preset.wind.join('/')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Spot Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Spot Naam *</span>
                <span className="text-[10px] font-mono font-normal text-slate-400">bijv. Katwijk Noord, Maasvlakte Slufter</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Naam van jouw spot..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-all shadow-xs"
              />
            </div>

            {/* Coordinates Lat / Lng */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  GPS Coördinaten (WGS84) *
                </label>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={isLocating}
                  className="text-[10px] font-mono font-bold text-cyan-600 hover:text-cyan-700 flex items-center gap-1 cursor-pointer bg-cyan-50 hover:bg-cyan-100 px-2 py-1 rounded-lg border border-cyan-200 transition-colors"
                >
                  <Locate className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? 'GPS Bepalen...' : 'Mijn GPS Positie'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Latitude (N)</span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="52.1234"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-mono text-slate-900 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Longitude (E)</span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="4.2345"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-mono text-slate-900 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Spot Type & Coastline Angle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Type Bodem / Break</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-500"
                >
                  <option value="beachbreak">Beachbreak (Zandbanken - Noordzee)</option>
                  <option value="pointbreak">Pointbreak (Pier / Hoofd)</option>
                  <option value="reefbreak">Reefbreak (Rotsen / Kunstmatig rif)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Kusthoek (Facing)</span>
                  <span className="text-[10px] font-mono text-slate-400">{coastlineAngle}°</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="180"
                    max="360"
                    step="5"
                    value={coastlineAngle}
                    onChange={(e) => setCoastlineAngle(parseInt(e.target.value))}
                    className="flex-1 accent-cyan-600"
                  />
                  <span className="text-[11px] font-mono font-bold text-slate-700 w-12 text-right">
                    {coastlineAngle >= 290 && coastlineAngle <= 320 ? 'NW' : coastlineAngle < 290 ? 'W' : 'N'}
                  </span>
                </div>
              </div>
            </div>

            {/* Optimal Wind Directions */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Optimale Windrichting (Offshore / Cross-off)</span>
                <span className="text-[10px] font-mono text-slate-400">Geselecteerd: {bestWind.join(', ') || 'Geen'}</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {WIND_DIRECTIONS.map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => toggleWind(dir)}
                    className={`
                      px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer
                      ${bestWind.includes(dir)
                        ? 'bg-cyan-500 text-slate-950 shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                    `}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* Optimal Swell Directions */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Optimale Swellrichting</span>
                <span className="text-[10px] font-mono text-slate-400">Geselecteerd: {bestSwell.join(', ') || 'Geen'}</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SWELL_DIRECTIONS.map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => toggleSwell(dir)}
                    className={`
                      px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer
                      ${bestSwell.includes(dir)
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                    `}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* Public Community Sharing Option */}
            {isLoggedIn && (
              <div className="p-3.5 rounded-2xl bg-cyan-50/70 border border-cyan-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Share2 className="w-4 h-4 text-cyan-700 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Deel openbaar met de community</div>
                    <div className="text-[10px] text-slate-500">Andere surfers kunnen deze spot ook op de kaart zien</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-300"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-tactical uppercase tracking-wider transition-colors cursor-pointer"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-2/3 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black font-tactical uppercase text-xs tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Spot Aanmaken...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Spot Aanmaken & Openen</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
