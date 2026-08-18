import React from 'react';
import { SurfSpot } from '../types';
import { Trash2, Star, MapPin, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface SpotManagerProps {
  spots: SurfSpot[];
  favoriteSpotId?: string;
  onDeleteSpot: (id: string) => void;
  onSetFavorite: (id: string) => void;
  onSelectSpot: (id: string) => void;
  selectedSpotId: string;
  onAddSpot?: (name: string, lat: number, lng: number) => void;
}

export function SpotManager({ 
  spots, 
  favoriteSpotId, 
  onDeleteSpot, 
  onSetFavorite,
  onSelectSpot,
  selectedSpotId,
  onAddSpot
}: SpotManagerProps) {
  const [isAdding, setIsAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newLat, setNewLat] = React.useState('');
  const [newLng, setNewLng] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName && newLat && newLng && onAddSpot) {
      onAddSpot(newName, parseFloat(newLat), parseFloat(newLng));
      setIsAdding(false);
      setNewName('');
      setNewLat('');
      setNewLng('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-tight">Node Beheer</h2>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">Systeem Locaties & Custom Nodes</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
            isAdding ? "bg-white text-marine-950" : "glass hover:bg-white/10 text-white/60"
          )}
        >
          <Plus className={cn("w-3 h-3 transition-transform", isAdding && "rotate-45")} />
          {isAdding ? 'Annuleren' : 'Node Toevoegen'}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleSubmit}
            className="glass p-6 rounded-[2rem] border border-accent/20 overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase text-white/30 ml-2">Spot Naam</label>
                <input 
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Bijv. Maasvlakte"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-accent outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase text-white/30 ml-2">Latitude</label>
                <input 
                  required
                  type="number"
                  step="any"
                  value={newLat}
                  onChange={(e) => setNewLat(e.target.value)}
                  placeholder="51.98"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-accent outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase text-white/30 ml-2">Longitude</label>
                <input 
                  required
                  type="number"
                  step="any"
                  value={newLng}
                  onChange={(e) => setNewLng(e.target.value)}
                  placeholder="3.98"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-accent outline-none"
                />
              </div>
              <div className="flex items-end">
                <button 
                  type="submit"
                  className="w-full bg-accent text-marine-950 font-black uppercase text-[10px] py-2.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Confirm Node
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {spots.map((spot) => (
            <motion.div
              layout
              key={spot.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "glass-dark p-6 rounded-[2rem] border transition-all relative group overflow-hidden",
                selectedSpotId === spot.id ? "border-accent/40 bg-accent/5" : "border-white/5 hover:border-white/20"
              )}
            >
              <div className="flex justify-between items-start">
                <div 
                  className="space-y-2 cursor-pointer flex-1"
                  onClick={() => onSelectSpot(spot.id)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-black italic uppercase text-lg group-hover:text-accent transition-colors">
                      {spot.name}
                    </h3>
                    {favoriteSpotId === spot.id && (
                      <Star className="w-3 h-3 text-accent fill-accent" />
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                    {spot.lat.toFixed(4)}°N • {spot.lng.toFixed(4)}°E
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSetFavorite(spot.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      favoriteSpotId === spot.id 
                        ? "bg-accent/20 text-accent" 
                        : "bg-white/5 text-white/20 hover:text-accent hover:bg-accent/10"
                    )}
                    title="Stel in als standaard"
                  >
                    <Star className={cn("w-4 h-4", favoriteSpotId === spot.id && "fill-accent")} />
                  </button>
                  <button
                    onClick={() => onDeleteSpot(spot.id)}
                    className="p-2 rounded-xl bg-white/5 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="Verwijder node"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selectedSpotId === spot.id && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-[8px] font-mono uppercase text-accent">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Actieve Selectie
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {spots.length === 0 && (
        <div className="py-20 text-center glass rounded-[2rem] border border-dashed border-white/10">
          <p className="text-white/20 font-mono uppercase text-xs">Geen nodes geconfigureerd</p>
          <p className="text-[10px] text-white/10 mt-2">Klik op de kaart om een custom node toe te voegen</p>
        </div>
      )}
    </div>
  );
}
