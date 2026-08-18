import React, { useState, useEffect } from 'react';
import { UserProfile, Board, Wetsuit, SkillLevel, SurfSpot, ForecastData, SpotReport as SpotReportType } from '../types';
import { SpotReport } from './SpotReport';
import { AdminPanel } from './AdminPanel';
import { auth, db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Settings, Camera, Shield, User, Waves, MapPin, Plus, Trash2, Share2, ChevronRight, History, AlertTriangle, RefreshCw, Thermometer, Ruler, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface ProfileSettingsProps {
  user: UserProfile;
  onUpdate: (user: UserProfile) => void;
  allSpots: SurfSpot[];
  currentForecast: ForecastData | null;
  onShareSpot: (spot: SurfSpot) => void;
}

export function ProfileSettings({ user, onUpdate, allSpots, currentForecast, onShareSpot }: ProfileSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'report' | 'activity' | 'admin' | 'beta'>('settings');
  const [userReports, setUserReports] = useState<SpotReportType[]>([]);
  
  useEffect(() => {
    if (!auth.currentUser) return;
    
    const q = query(
      collection(db, 'spotReports'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SpotReportType[];
      setUserReports(data);
    });
    
    return () => unsubscribe();
  }, []);

  const mismatchedReports = userReports.filter(r => r.analysis.isMismatched);

  const updateWeight = (weight: number) => onUpdate({ ...user, weight });
  const updateSkill = (skillLevel: SkillLevel) => onUpdate({ ...user, skillLevel });

  const isAdmin = auth.currentUser?.email === 'sebastiaan.boom2@gmail.com' || auth.currentUser?.email === 'sebastiaan.boom@gmail.com';

  const addBoard = () => {
    const newBoard: Board = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Nieuw Board',
      type: 'shortboard',
      volume: 32,
      length: "6'0\""
    };
    const updatedBoards = [...(user.boards || []), newBoard];
    onUpdate({ 
      ...user, 
      boards: updatedBoards,
      selectedBoardId: user.selectedBoardId || newBoard.id
    });
  };

  const removeBoard = (id: string) => {
    const remainingBoards = (user.boards || []).filter(b => b.id !== id);
    const newSelected = user.selectedBoardId === id 
      ? (remainingBoards.length > 0 ? remainingBoards[0].id : undefined)
      : user.selectedBoardId;
    onUpdate({ 
      ...user, 
      boards: remainingBoards,
      selectedBoardId: newSelected
    });
  };

  const addWetsuit = () => {
    const newWetsuit: Wetsuit = {
      id: Math.random().toString(36).substr(2, 9),
      thickness: '4/3',
      hasHood: false,
      hasBoots: false,
      hasGloves: false
    };
    onUpdate({ ...user, wetsuits: [...(user.wetsuits || []), newWetsuit] });
  };

  const removeWetsuit = (id: string) => {
    onUpdate({ ...user, wetsuits: (user.wetsuits || []).filter(w => w.id !== id) });
  };

  return (
    <div className="space-y-8 pb-32">
      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 glass rounded-2xl border border-white/5">
        <button 
          onClick={() => setActiveSubTab('settings')}
          className={cn(
            "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all",
            activeSubTab === 'settings' ? 'bg-white text-marine-950 shadow-xl' : 'text-white/40 hover:text-white/60'
          )}
        >
          <Settings className="w-3 h-3" />
          Setup
        </button>
        <button 
          onClick={() => setActiveSubTab('activity')}
          className={cn(
            "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all relative",
            activeSubTab === 'activity' ? 'bg-white text-marine-950 shadow-xl' : 'text-white/40 hover:text-white/60'
          )}
        >
          <History className="w-3 h-3" />
          Sessies
          {mismatchedReports.length > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </button>
        <button 
          onClick={() => setActiveSubTab('report')}
          className={cn(
            "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all",
            activeSubTab === 'report' ? 'bg-white text-marine-950 shadow-xl' : 'text-white/40 hover:text-white/60'
          )}
        >
          <Camera className="w-3 h-3" />
          Report
        </button>
        {isAdmin && (
          <>
            <button 
              onClick={() => setActiveSubTab('admin')}
              className={cn(
                "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all",
                activeSubTab === 'admin' ? 'bg-accent text-marine-950 shadow-xl' : 'text-white/40 hover:text-white/60'
              )}
            >
              <Shield className="w-3 h-3" />
              Admin
            </button>
            <button 
              onClick={() => setActiveSubTab('beta')}
              className={cn(
                "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all",
                activeSubTab === 'beta' ? 'bg-purple-500 text-white shadow-xl' : 'text-white/40 hover:text-white/60'
              )}
            >
              <Plus className="w-3 h-3" />
              Beta
            </button>
          </>
        )}
      </div>

      {activeSubTab === 'activity' && (
        <div className="space-y-6">
          {mismatchedReports.length > 0 && (
            <div className="glass border-red-500/30 p-6 rounded-[2rem] bg-red-500/5 space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-black uppercase tracking-widest">Tactical Mismatch Gedetecteerd</h3>
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Een of meerdere van jouw recente spot reports bevatten gegevens die niet overeenkomen met onze satelliet- en sensor data. 
                De tactical oversight vraagt om verduidelijking of een re-submit voor de volgende sessies:
              </p>
              <div className="space-y-3">
                {mismatchedReports.map(report => (
                  <div key={report.id} className="glass p-4 rounded-xl border border-red-500/10 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">{report.spotName}</h4>
                      <p className="text-[9px] font-mono text-white/30 uppercase">{format(new Date(report.timestamp), 'd MMM HH:mm', { locale: nl })}</p>
                    </div>
                    <button 
                      onClick={() => setActiveSubTab('report')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Re-submit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 ml-2">Recente Activiteit</h3>
            {userReports.length === 0 ? (
              <p className="text-[10px] font-mono text-white/20 italic uppercase tracking-widest text-center py-12">Nog geen sessies geregistreerd.</p>
            ) : (
              userReports.map(report => (
                <div key={report.id} className="glass p-5 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center border",
                      report.analysis.isMismatched ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-white/5 border-white/10 text-white/40"
                    )}>
                      {report.analysis.isMismatched ? <AlertTriangle className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{report.spotName}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-mono text-white/30 uppercase">{format(new Date(report.timestamp), 'd MMM HH:mm', { locale: nl })}</span>
                        <div className="h-1 w-1 rounded-full bg-white/10" />
                        <span className="text-[9px] font-mono text-accent uppercase">Match {report.analysis.matchScore}/10</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/10" />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'report' && (
        <SpotReport 
          spots={allSpots} 
          currentForecasts={currentForecast ? { [allSpots[0].id]: currentForecast } : {}} 
          user={user}
        />
      )}

      {activeSubTab === 'beta' && isAdmin && (
        <div className="glass rounded-3xl p-8 border border-purple-500/20 bg-purple-500/5">
           <h3 className="text-xl font-black italic uppercase text-white mb-6">Beta Laboratory</h3>
           <p className="text-sm text-white/60 mb-8 leading-relaxed">
             Activeer experimentele functies zoals Live Wave Calibration. Deze tools gebruiken direct de camera en Gemini Vision voor real-time spot analyse.
           </p>
           <button 
            onClick={() => {
              // This is a bit of a hack to trigger the app-level tab change if needed, 
              // but for now we'll just advise using the main nav or I could implement a callback.
              // Given the structure, let's assume the user wants the content here or I'll add a link.
              window.dispatchEvent(new CustomEvent('switchTab', { detail: 'beta' }));
            }}
            className="w-full py-4 bg-purple-500 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform shadow-lg shadow-purple-500/20"
           >
             <Plus className="w-5 h-5" />
             Open Live Video Lab
           </button>
        </div>
      )}

      {activeSubTab === 'admin' && isAdmin && (
        <AdminPanel />
      )}

      {activeSubTab === 'settings' && (
        <div className="space-y-10">
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center">
                <User className="w-4 h-4 text-accent" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/50">Jouw Gegevens</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label htmlFor="weight" className="text-[10px] font-mono uppercase tracking-widest text-white/30 ml-1">Gewicht (KG)</label>
                <div className="relative">
                  <input 
                    id="weight" 
                    type="number" 
                    value={user.weight} 
                    onChange={(e) => updateWeight(Number(e.target.value))}
                    className="w-full glass rounded-xl border border-white/5 bg-transparent px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/20">KG</div>
                </div>
              </div>
              <div className="space-y-3">
                <label htmlFor="skill" className="text-[10px] font-mono uppercase tracking-widest text-white/30 ml-1">Niveau</label>
                <select 
                  id="skill"
                  value={user.skillLevel} 
                  onChange={(e) => updateSkill(e.target.value as SkillLevel)}
                  className="w-full glass rounded-xl border border-white/5 bg-transparent px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors appearance-none"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="pro">Professional</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center">
                  <Waves className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/70">Mijn Boards (Quiver)</h3>
                  <p className="text-[10px] font-mono text-white/40">Beheer je quiver voor golf- en volumematching</p>
                </div>
              </div>
              <button 
                onClick={addBoard}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-accent text-marine-950 text-[10px] font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Board Toevoegen
              </button>
            </div>

            <div className="space-y-3">
              {(!user.boards || user.boards.length === 0) ? (
                <div className="p-6 rounded-2xl glass border border-white/5 text-center space-y-3">
                  <Waves className="w-8 h-8 text-white/20 mx-auto" />
                  <p className="text-xs font-mono text-white/50 uppercase tracking-widest">
                    Geen boards in je quiver
                  </p>
                  <p className="text-[11px] text-white/40 max-w-sm mx-auto">
                    Voeg je surfplanken toe om hydrodynamische golf- en gear-matches specifiek voor jouw profiel te berekenen.
                  </p>
                  <button 
                    onClick={addBoard}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-marine-950 text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-4 h-4" />
                    Eerste Board Toevoegen
                  </button>
                </div>
              ) : (
                user.boards.map((board, index) => {
                  const isSelected = user.selectedBoardId === board.id || (!user.selectedBoardId && index === 0);
                  return (
                    <div 
                      key={board.id} 
                      className={cn(
                        "p-4 sm:p-5 rounded-2xl glass border transition-all space-y-4 group",
                        isSelected ? "border-accent/40 bg-accent/[0.03]" : "border-white/5 hover:border-white/20"
                      )}
                    >
                      {/* Top Row: Board Name, Active Toggle & Delete Button */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 block mb-1">
                            Naam / Model
                          </label>
                          <input 
                            value={board.name} 
                            placeholder="Naam van board (bijv. Pyzel Ghost, Torq 7'6)"
                            onChange={(e) => {
                              const newBoards = user.boards.map(b => b.id === board.id ? { ...b, name: e.target.value } : b);
                              onUpdate({ ...user, boards: newBoards });
                            }}
                            className="bg-transparent border-b border-white/10 px-0 py-1 text-sm font-bold text-white focus:outline-none focus:border-accent w-full transition-colors"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => onUpdate({ ...user, selectedBoardId: board.id })}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all",
                              isSelected 
                                ? "bg-accent text-marine-950 font-bold shadow-sm" 
                                : "bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border border-white/10"
                            )}
                            title={isSelected ? "Huidig actief board" : "Stel in als actief board"}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {isSelected ? 'Actief' : 'Kies'}
                          </button>

                          <button 
                            type="button"
                            onClick={() => removeBoard(board.id)} 
                            title={`Verwijder ${board.name || 'board'} uit quiver`}
                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom Grid: Type, Lengte & Volume */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        {/* Type Shape */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 block">
                            Type Shape
                          </label>
                          <select 
                            value={board.type} 
                            onChange={(e) => {
                              const newBoards = user.boards.map(b => b.id === board.id ? { ...b, type: e.target.value as any } : b);
                              onUpdate({ ...user, boards: newBoards });
                            }}
                            className="w-full bg-marine-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-accent transition-colors"
                          >
                            <option value="shortboard">Shortboard</option>
                            <option value="fish">Fish</option>
                            <option value="hybrid">Hybrid</option>
                            <option value="funboard">Funboard</option>
                            <option value="longboard">Longboard</option>
                            <option value="softtop">Softtop</option>
                          </select>
                        </div>

                        {/* Lengte van het board */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 flex items-center gap-1">
                            <Ruler className="w-3 h-3 text-accent" />
                            Lengte
                          </label>
                          <div className="relative">
                            <input 
                              type="text"
                              value={board.length || ''} 
                              placeholder='bv. 6&apos;0", 7&apos;2" of 190cm'
                              onChange={(e) => {
                                const newBoards = user.boards.map(b => b.id === board.id ? { ...b, length: e.target.value } : b);
                                onUpdate({ ...user, boards: newBoards });
                              }}
                              className="w-full bg-marine-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-medium text-white focus:outline-none focus:border-accent transition-colors"
                            />
                          </div>
                        </div>

                        {/* Volume */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 flex items-center gap-1">
                            <Waves className="w-3 h-3 text-accent" />
                            Volume (L)
                          </label>
                          <div className="relative">
                            <input 
                              type="number" 
                              step="0.5"
                              value={board.volume || ''} 
                              placeholder="bv. 32"
                              onChange={(e) => {
                                const newBoards = user.boards.map(b => b.id === board.id ? { ...b, volume: Number(e.target.value) } : b);
                                onUpdate({ ...user, boards: newBoards });
                              }}
                              className="w-full bg-marine-950 border border-white/10 rounded-xl px-3 py-2 pr-12 text-xs font-mono font-medium text-white focus:outline-none focus:border-accent transition-colors"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/30 pointer-events-none">
                              Liter
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Mijn Wetsuits & Gear */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center">
                  <Thermometer className="w-4 h-4 text-accent" />
                </div>
                <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/50">Mijn Wetsuits & Gear</h3>
              </div>
              <button 
                onClick={addWetsuit}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all"
              >
                <Plus className="w-3 h-3" />
                Wetsuit Toevoegen
              </button>
            </div>

            <div className="space-y-3">
              {(!user.wetsuits || user.wetsuits.length === 0) ? (
                <p className="text-[10px] font-mono text-white/30 italic uppercase tracking-widest text-center py-8">Geen wetsuits ingesteld.</p>
              ) : (
                user.wetsuits.map((wetsuit) => (
                  <div key={wetsuit.id} className="p-4 rounded-2xl glass border border-white/5 group hover:border-white/20 transition-all space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <label className="text-[10px] font-mono uppercase text-white/40">Dikte:</label>
                        <select
                          value={wetsuit.thickness}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, thickness: e.target.value } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="bg-marine-950 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none"
                        >
                          <option value="6/5/4">6/5/4 mm (Winter)</option>
                          <option value="5/4">5/4 mm (Koud)</option>
                          <option value="4/3">4/3 mm (Lente/Herfst)</option>
                          <option value="3/2">3/2 mm (Zomer)</option>
                          <option value="2/2">2/2 mm / Shorty</option>
                        </select>
                      </div>

                      <button 
                        type="button"
                        onClick={() => removeWetsuit(wetsuit.id)} 
                        title="Verwijder wetsuit"
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Accessories Checkboxes */}
                    <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/5">
                      <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wetsuit.hasHood}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, hasHood: e.target.checked } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        <span>Hood (Capuchon)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wetsuit.hasBoots}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, hasBoots: e.target.checked } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        <span>Boots (Schoentjes)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wetsuit.hasGloves}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, hasGloves: e.target.checked } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        <span>Gloves (Handschoenen)</span>
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-accent" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/50">Opgeslagen Locaties</h3>
            </div>

            <div className="space-y-3">
              {(!user.savedSpots || user.savedSpots.length === 0) ? (
                <p className="text-[10px] font-mono text-white/30 italic uppercase tracking-widest text-center py-8">Geen locaties opgeslagen.</p>
              ) : (
                user.savedSpots.map((spot) => (
                  <div key={spot.id} className="flex items-center gap-4 p-4 rounded-2xl glass border border-white/5 group hover:border-white/20 transition-all">
                    <div className="flex-1 space-y-1">
                      <input 
                        value={spot.name} 
                        onChange={(e) => {
                          const newSpots = user.savedSpots?.map(s => s.id === spot.id ? { ...s, name: e.target.value } : s);
                          onUpdate({ ...user, savedSpots: newSpots });
                        }}
                        className="bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0 w-full"
                      />
                      <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                        LOC: {spot.lat.toFixed(4)}N / {spot.lng.toFixed(4)}E
                      </div>
                    </div>
                      <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => onShareSpot(spot)}
                          className="p-2 text-white/60 md:text-white/40 hover:text-accent transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const newSpots = user.savedSpots?.filter(s => s.id !== spot.id);
                            onUpdate({ ...user, savedSpots: newSpots });
                          }}
                          className="p-2 text-white/60 md:text-white/40 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    <ChevronRight className="w-4 h-4 text-white/10" />
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
