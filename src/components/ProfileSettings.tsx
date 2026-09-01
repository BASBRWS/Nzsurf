import React, { useState, useEffect } from 'react';
import { UserProfile, Board, Wetsuit, SkillLevel, SurfSpot, ForecastData, SpotReport as SpotReportType } from '../types';
import { SpotReport } from './SpotReport';
import { AdminPanel } from './AdminPanel';
import { auth, db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Settings, Camera, Shield, User, Waves, MapPin, Plus, Trash2, Share2, ChevronRight, History, AlertTriangle, RefreshCw, Thermometer, Ruler, CheckCircle2, Database, X } from 'lucide-react';
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

// Placeholder-silhouet als er (nog) geen productfoto is.
function BoardSilhouette() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7 text-cyan-600/70" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c2.4 3 3.4 6.6 3.4 10S14.4 19 12 22C9.6 19 8.6 15.4 8.6 12S9.6 5 12 2Z" />
      <line x1="12" y1="4.5" x2="12" y2="19.5" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

// Thumbnail voor een board: toont de productfoto, met nette fallback naar een
// surfboard-silhouet als er geen afbeelding is of de afbeelding niet laadt.
function BoardThumb({ imageUrl, name }: { imageUrl?: string; name?: string }) {
  const [errored, setErrored] = useState(false);
  const showImg = !!imageUrl && !errored;
  return (
    <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
      {showImg ? (
        <img
          src={imageUrl}
          alt={name || 'board'}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <BoardSilhouette />
      )}
    </div>
  );
}

function BoardDatabaseSelector({ onAdd, onCancel }: { onAdd: (b: Board) => void, onCancel: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedSizeId, setSelectedSizeId] = useState('');

  useEffect(() => {
    fetch('/surfboard-dataset-TOTAAL-1024.json')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error('Error loading board dataset:', e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-6 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Database laden...</div>;
  }

  if (!data || !data.dropdowns) {
    return <div className="p-6 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 border border-red-500/20 text-center text-xs text-red-400">Fout bij laden database.</div>;
  }

  const brands = data.dropdowns.brands || [];
  const models = selectedBrand ? (data.dropdowns.models_by_brand[selectedBrand] || []) : [];
  const sizes = (selectedBrand && selectedModel) ? (data.dropdowns.sizes_by_brand_model[selectedBrand]?.[selectedModel] || []) : [];

  const handleAdd = () => {
    const sizeData = sizes.find((s: any) => s.board_id === selectedSizeId);
    if (!sizeData) return;
    
    // Map to local Board type
    let boardType: Board['type'] = 'shortboard';
    const volume = sizeData.volume_l;
    
    if (sizeData.constructie === 'soft-top') boardType = 'softtop';
    else if (sizeData.lengte_cm > 270) boardType = 'longboard';
    else if (sizeData.lengte_cm > 210) boardType = 'funboard';
    
    // Productfoto (og:image) uit de verrijkte dataset, indien aanwezig.
    const imageUrl = sizeData.afbeelding_url || data.boards_by_id?.[sizeData.board_id]?.afbeelding_url;

    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      name: `${selectedBrand} ${selectedModel}`,
      type: boardType,
      volume: volume,
      length: sizeData.lengte_imperial || sizeData.maat_label,
      imageUrl
    });
  };

  return (
    <div className="p-5 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 border border-cyan-600/40 bg-cyan-600/[0.03] space-y-4 relative">
      <button onClick={onCancel} className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-cyan-600" />
        <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-900">Database Selector</h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block">Merk</label>
          <select 
            value={selectedBrand} 
            onChange={(e) => { setSelectedBrand(e.target.value); setSelectedModel(''); setSelectedSizeId(''); }}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600"
          >
            <option value="">-- Kies Merk --</option>
            {brands.map((b: string) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block">Model</label>
          <select 
            value={selectedModel} 
            onChange={(e) => { setSelectedModel(e.target.value); setSelectedSizeId(''); }}
            disabled={!selectedBrand}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600 disabled:opacity-50"
          >
            <option value="">-- Kies Model --</option>
            {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block">Maat (Volume)</label>
          <select 
            value={selectedSizeId} 
            onChange={(e) => setSelectedSizeId(e.target.value)}
            disabled={!selectedModel}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600 disabled:opacity-50"
          >
            <option value="">-- Kies Maat --</option>
            {sizes.map((s: any) => <option key={s.board_id} value={s.board_id}>{s.maat_label} ({s.volume_l}L)</option>)}
          </select>
        </div>
      </div>
      
      <div className="pt-2">
        <button 
          onClick={handleAdd}
          disabled={!selectedSizeId}
          className="w-full py-2.5 rounded-xl bg-cyan-600 text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Toevoegen aan Quiver
        </button>
      </div>
    </div>
  );
}

export function ProfileSettings({ user, onUpdate, allSpots, currentForecast, onShareSpot }: ProfileSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'report' | 'activity' | 'admin' | 'beta'>('settings');
  const [userReports, setUserReports] = useState<SpotReportType[]>([]);
  const [showBoardSelector, setShowBoardSelector] = useState(false);
  
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

  const currentUserEmail = auth.currentUser?.email?.toLowerCase() || user.email?.toLowerCase();
  const isAdmin = currentUserEmail === 'sebastiaan.boom@gmail.com' || currentUserEmail === 'sebastiaan.boom2@gmail.com';

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
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/90 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xs">
        <button 
          onClick={() => setActiveSubTab('settings')}
          className={cn(
            "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer",
            activeSubTab === 'settings' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          )}
        >
          <Settings className="w-3.5 h-3.5" />
          Setup
        </button>
        <button 
          onClick={() => setActiveSubTab('activity')}
          className={cn(
            "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all relative cursor-pointer",
            activeSubTab === 'activity' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          )}
        >
          <History className="w-3.5 h-3.5" />
          Sessies
          {mismatchedReports.length > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse ring-2 ring-white" />
          )}
        </button>
        <button 
          onClick={() => setActiveSubTab('report')}
          className={cn(
            "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer",
            activeSubTab === 'report' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          )}
        >
          <Camera className="w-3.5 h-3.5" />
          Report
        </button>
        {isAdmin && (
          <>
            <button 
              onClick={() => setActiveSubTab('admin')}
              className={cn(
                "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer",
                activeSubTab === 'admin' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </button>
            <button 
              onClick={() => setActiveSubTab('beta')}
              className={cn(
                "flex-auto sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer",
                activeSubTab === 'beta' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              Beta
            </button>
          </>
        )}
      </div>

      {activeSubTab === 'activity' && (
        <div className="space-y-6">
          {mismatchedReports.length > 0 && (
            <div className="bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 border-red-500/30 p-6 rounded-[2rem] bg-red-500/5 space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-black uppercase tracking-widest">Tactical Mismatch Gedetecteerd</h3>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Een of meerdere van jouw recente spot reports bevatten gegevens die niet overeenkomen met onze satelliet- en sensor data. 
                De tactical oversight vraagt om verduidelijking of een re-submit voor de volgende sessies:
              </p>
              <div className="space-y-3">
                {mismatchedReports.map(report => (
                  <div key={report.id} className="bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 p-4 rounded-xl border border-red-500/10 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{report.spotName}</h4>
                      <p className="text-[9px] font-mono text-slate-400 uppercase">{format(new Date(report.timestamp), 'd MMM HH:mm', { locale: nl })}</p>
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
            <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-400 ml-2">Recente Activiteit</h3>
            {userReports.length === 0 ? (
              <p className="text-[10px] font-mono text-slate-400 italic uppercase tracking-widest text-center py-12">Nog geen sessies geregistreerd.</p>
            ) : (
              userReports.map(report => (
                <div key={report.id} className="bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 p-5 rounded-2xl border border-slate-200 flex items-center justify-between group hover:border-slate-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center border",
                      report.analysis.isMismatched ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-slate-50 border-slate-200 text-slate-400"
                    )}>
                      {report.analysis.isMismatched ? <AlertTriangle className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{report.spotName}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-mono text-slate-400 uppercase">{format(new Date(report.timestamp), 'd MMM HH:mm', { locale: nl })}</span>
                        <div className="h-1 w-1 rounded-full bg-slate-100" />
                        <span className="text-[9px] font-mono text-cyan-600 uppercase">Match {report.analysis.matchScore}/10</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
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
        <div className="bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 rounded-3xl p-8 border border-purple-500/20 bg-purple-500/5">
           <h3 className="text-xl font-black italic uppercase text-slate-900 mb-6">Beta Laboratory</h3>
           <p className="text-sm text-slate-600 mb-8 leading-relaxed">
             Activeer experimentele functies zoals Live Wave Calibration. Deze tools gebruiken direct de camera en Gemini Vision voor real-time spot analyse.
           </p>
           <button 
            onClick={() => {
              // This is a bit of a hack to trigger the app-level tab change if needed, 
              // but for now we'll just advise using the main nav or I could implement a callback.
              // Given the structure, let's assume the user wants the content here or I'll add a link.
              window.dispatchEvent(new CustomEvent('switchTab', { detail: 'beta' }));
            }}
            className="w-full py-4 bg-purple-600 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform shadow-lg shadow-purple-500/20"
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
              <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center">
                <User className="w-4 h-4 text-cyan-600" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-500">Jouw Gegevens</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label htmlFor="weight" className="text-[10px] font-mono uppercase tracking-widest text-slate-400 ml-1">Gewicht (KG)</label>
                <div className="relative">
                  <input 
                    id="weight" 
                    type="number" 
                    value={user.weight} 
                    onChange={(e) => updateWeight(Number(e.target.value))}
                    className="w-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-cyan-600/50 transition-colors"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">KG</div>
                </div>
              </div>
              <div className="space-y-3">
                <label htmlFor="skill" className="text-[10px] font-mono uppercase tracking-widest text-slate-400 ml-1">Niveau</label>
                <select 
                  id="skill"
                  value={user.skillLevel} 
                  onChange={(e) => updateSkill(e.target.value as SkillLevel)}
                  className="w-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-cyan-600/50 transition-colors appearance-none"
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
                <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center">
                  <Waves className="w-4 h-4 text-cyan-600" />
                </div>
                <div>
                  <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-500">Mijn Boards (Setup)</h3>
                  <p className="text-[10px] font-mono text-slate-400">Beheer je boards voor golf- en volumematching</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowBoardSelector(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600 text-white text-[10px] font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-sm"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Kies uit Database</span>
                  <span className="sm:hidden">Database</span>
                </button>
                <button 
                  onClick={addBoard}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-slate-100 transition-all shadow-sm"
                  title="Handmatig Toevoegen"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {showBoardSelector && (
              <BoardDatabaseSelector 
                onCancel={() => setShowBoardSelector(false)}
                onAdd={(board) => {
                  const updatedBoards = [...(user.boards || []), board];
                  onUpdate({ 
                    ...user, 
                    boards: updatedBoards,
                    selectedBoardId: user.selectedBoardId || board.id
                  });
                  setShowBoardSelector(false);
                }}
              />
            )}

            <div className="space-y-3">
              {(!user.boards || user.boards.length === 0) ? (
                <div className="p-6 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 text-center space-y-3">
                  <Waves className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                    Geen boards in je setup
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Voeg je surfplanken toe om hydrodynamische golf- en gear-matches specifiek voor jouw profiel te berekenen.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
                    <button 
                      onClick={() => setShowBoardSelector(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
                    >
                      <Database className="w-4 h-4" />
                      Kies uit Database
                    </button>
                    <button 
                      onClick={addBoard}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-opacity w-full sm:w-auto justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Handmatig
                    </button>
                  </div>
                </div>
              ) : (
                user.boards.map((board, index) => {
                  const isSelected = user.selectedBoardId === board.id || (!user.selectedBoardId && index === 0);
                  return (
                    <div 
                      key={board.id} 
                      className={cn(
                        "p-4 sm:p-5 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 border transition-all space-y-4 group",
                        isSelected ? "border-cyan-600/40 bg-cyan-600/[0.03]" : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {/* Top Row: Thumbnail, Board Name, Active Toggle & Delete Button */}
                      <div className="flex items-center justify-between gap-3">
                        <BoardThumb imageUrl={board.imageUrl} name={board.name} />
                        <div className="flex-1 min-w-0">
                          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block mb-1">
                            Naam / Model
                          </label>
                          <input
                            value={board.name}
                            placeholder="Naam van board (bijv. Pyzel Ghost, Torq 7'6)"
                            onChange={(e) => {
                              const newBoards = user.boards.map(b => b.id === board.id ? { ...b, name: e.target.value } : b);
                              onUpdate({ ...user, boards: newBoards });
                            }}
                            className="bg-transparent border-b border-slate-200 px-0 py-1 text-sm font-bold text-slate-900 focus:outline-none focus:border-cyan-600 w-full transition-colors"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => onUpdate({ ...user, selectedBoardId: board.id })}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all",
                              isSelected 
                                ? "bg-cyan-600 text-white font-bold shadow-sm" 
                                : "bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
                            )}
                            title={isSelected ? "Huidig actief board" : "Stel in als actief board"}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {isSelected ? 'Actief' : 'Kies'}
                          </button>

                          <button 
                            type="button"
                            onClick={() => removeBoard(board.id)} 
                            title={`Verwijder ${board.name || 'board'} uit setup`}
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
                          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block">
                            Type Shape
                          </label>
                          <select 
                            value={board.type} 
                            onChange={(e) => {
                              const newBoards = user.boards.map(b => b.id === board.id ? { ...b, type: e.target.value as any } : b);
                              onUpdate({ ...user, boards: newBoards });
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
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
                          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
                            <Ruler className="w-3 h-3 text-cyan-600" />
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
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Volume */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
                            <Waves className="w-3 h-3 text-cyan-600" />
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
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 pr-12 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 pointer-events-none">
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
                <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center">
                  <Thermometer className="w-4 h-4 text-cyan-600" />
                </div>
                <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-500">Mijn Wetsuits & Gear</h3>
              </div>
              <button 
                onClick={addWetsuit}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-900 hover:bg-slate-50 transition-all"
              >
                <Plus className="w-3 h-3" />
                Wetsuit Toevoegen
              </button>
            </div>

            <div className="space-y-3">
              {(!user.wetsuits || user.wetsuits.length === 0) ? (
                <p className="text-[10px] font-mono text-slate-400 italic uppercase tracking-widest text-center py-8">Geen wetsuits ingesteld.</p>
              ) : (
                user.wetsuits.map((wetsuit) => (
                  <div key={wetsuit.id} className="p-4 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 group hover:border-slate-300 transition-all space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <label className="text-[10px] font-mono uppercase text-slate-400">Dikte:</label>
                        <select
                          value={wetsuit.thickness}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, thickness: e.target.value } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
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
                    <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-200">
                      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wetsuit.hasHood}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, hasHood: e.target.checked } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="rounded border-slate-300 bg-slate-50 text-cyan-600 focus:ring-accent"
                        />
                        <span>Hood (Capuchon)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wetsuit.hasBoots}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, hasBoots: e.target.checked } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="rounded border-slate-300 bg-slate-50 text-cyan-600 focus:ring-accent"
                        />
                        <span>Boots (Schoentjes)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wetsuit.hasGloves}
                          onChange={(e) => {
                            const newWetsuits = user.wetsuits?.map(w => w.id === wetsuit.id ? { ...w, hasGloves: e.target.checked } : w);
                            onUpdate({ ...user, wetsuits: newWetsuits });
                          }}
                          className="rounded border-slate-300 bg-slate-50 text-cyan-600 focus:ring-accent"
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
              <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-cyan-600" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-500">Opgeslagen Locaties</h3>
            </div>

            <div className="space-y-3">
              {(!user.savedSpots || user.savedSpots.length === 0) ? (
                <p className="text-[10px] font-mono text-slate-400 italic uppercase tracking-widest text-center py-8">Geen locaties opgeslagen.</p>
              ) : (
                user.savedSpots.map((spot) => (
                  <div key={spot.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 group hover:border-slate-300 transition-all">
                    <div className="flex-1 space-y-1">
                      <input 
                        value={spot.name} 
                        onChange={(e) => {
                          const newSpots = user.savedSpots?.map(s => s.id === spot.id ? { ...s, name: e.target.value } : s);
                          onUpdate({ ...user, savedSpots: newSpots });
                        }}
                        className="bg-transparent border-none p-0 text-sm font-bold text-slate-900 focus:ring-0 w-full"
                      />
                      <div className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                        LOC: {spot.lat.toFixed(4)}N / {spot.lng.toFixed(4)}E
                      </div>
                    </div>
                      <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => onShareSpot(spot)}
                          className="p-2 text-slate-600 md:text-slate-400 hover:text-cyan-600 transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const newSpots = user.savedSpots?.filter(s => s.id !== spot.id);
                            onUpdate({ ...user, savedSpots: newSpots });
                          }}
                          className="p-2 text-slate-600 md:text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
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
