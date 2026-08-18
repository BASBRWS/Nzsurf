import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, query, orderBy, onSnapshot, limit, handleFirestoreError, OperationType, deleteDoc, doc, setDoc, auth, addDoc } from '../lib/firebase';
import { SpotReport, SurfSpot } from '../types';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { MessageSquare, Calendar, MapPin, Gauge, ShieldCheck, Zap, AlertTriangle, Trash2, Settings2, Check, X, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ExtendedSpotReport extends SpotReport {
  isBeta?: boolean;
}

export function AdminReportList() {
  const [reports, setReports] = useState<ExtendedSpotReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [tweakingId, setTweakingId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [selectedReport, setSelectedReport] = useState<ExtendedSpotReport | null>(null);

  const ADMIN_EMAILS = ['sebastiaan.boom2@gmail.com', 'sebastiaan.boom@gmail.com'];
  const isAdmin = auth.currentUser?.email && ADMIN_EMAILS.includes(auth.currentUser.email);

  useEffect(() => {
    const q = query(
      collection(db, 'spotReports'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtendedSpotReport));
      setReports(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'spotReports');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAccept = async (report: ExtendedSpotReport) => {
    try {
      // Verzamel je alle goed input in een log
      await addDoc(collection(db, 'acceptedInsights'), {
        ...report,
        acceptedAt: new Date().toISOString(),
        acceptedBy: auth.currentUser?.email || 'Admin',
      });
      // Daarna verwijderen we het report (net als bij delete)
      await deleteDoc(doc(db, 'spotReports', report.id as string));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'acceptedInsights');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Weet je zeker dat je dit report wilt verwijderen?')) {
      try {
        await deleteDoc(doc(db, 'spotReports', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'spotReports');
      }
    }
  };

  const handleApplyTweak = async (report: ExtendedSpotReport) => {
    try {
      const spotRef = doc(db, 'spots', report.spotId);
      await setDoc(spotRef, {
        correction: {
          waveMultiplier: multiplier,
          lastUpdated: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'Admin'
        }
      }, { merge: true });
      setTweakingId(null);
      alert(`Correctie van ${multiplier}x toegepast op ${report.spotName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `spots/${report.spotId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-accent" />
            {isAdmin ? 'Field Intelligence Feed' : 'Mijn Meldingen'}
          </h3>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] mt-1">
            {isAdmin ? 'Geverifieerde meldingen & Beta Nodes' : 'Overzicht van jouw AI scans'}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {reports.map((report) => (
            <motion.div
              key={report.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "glass rounded-2xl p-5 border border-white/5 relative overflow-hidden group",
                report.isBeta ? "bg-accent/[0.03] border-accent/20" : "bg-black/20"
              )}
            >
              {report.isBeta && (
                <div className="absolute top-0 right-0 p-3">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent/20 rounded-full border border-accent/30">
                    <Zap className="w-2.5 h-2.5 text-accent" />
                    <span className="text-[8px] font-mono text-accent uppercase font-bold">Beta Analysis</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-white/60">
                      <Calendar className="w-3 h-3" />
                      <span className="text-[10px] font-mono">
                        {format(parseISO(report.timestamp), 'd MMM HH:mm', { locale: nl })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-accent">
                      <MapPin className="w-3 h-3" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">{report.spotName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/30 truncate flex-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span className="text-[10px] font-mono truncate">{report.userName || 'Analyst'} ({report.userEmail || 'Anon'})</span>
                      {report.userSkillLevel && (
                        <span className="px-1.5 py-0.5 bg-white/5 rounded text-[8px] border border-white/10 uppercase tracking-widest">{report.userSkillLevel}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                       <button
                        onClick={() => setSelectedReport(report)}
                        className="p-1.5 glass bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-lg transition-colors border border-white/10"
                        title="Open analyse"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => {
                              setTweakingId(report.id as string);
                              const observedStr = report.analysis.waveHeight.match(/[\d.]+/);
                              if (observedStr && report.forecastAtTime.waveHeight > 0) {
                                const observed = parseFloat(observedStr[0]);
                                setMultiplier(parseFloat((observed / report.forecastAtTime.waveHeight).toFixed(2)));
                              }
                            }}
                            className="p-1.5 glass bg-accent/10 hover:bg-accent/20 text-accent/70 hover:text-accent rounded-lg transition-colors border border-accent/20"
                            title="Tweak forecast"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleAccept(report)}
                            className="p-1.5 glass bg-green-500/10 hover:bg-green-500/20 text-green-500/70 hover:text-green-500 rounded-lg transition-colors border border-green-500/20"
                            title="Accepteer report (log insight)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(report.id as string)}
                            className="p-1.5 glass bg-red-500/10 hover:bg-red-500/20 text-red-500/70 hover:text-red-500 rounded-lg transition-colors border border-red-500/20"
                            title="Verwijder report"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {tweakingId === report.id ? (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-dark p-4 rounded-xl border border-accent/30 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono text-accent uppercase font-bold">Apply Forecast Tweak</p>
                        <button onClick={() => setTweakingId(null)} className="text-white/30 hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-1">
                          <label className="text-[8px] font-mono text-white/30 uppercase">Wave Multiplier</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={multiplier}
                            onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-bold text-sm focus:border-accent/50 outline-none"
                          />
                        </div>
                        <button 
                          onClick={() => handleApplyTweak(report)}
                          className="px-4 py-2 bg-accent text-marine-950 font-bold rounded-lg text-xs flex items-center gap-2 hover:scale-[1.02] transition-transform"
                        >
                          <Check className="w-3 h-3" />
                          Apply
                        </button>
                      </div>
                      <p className="text-[9px] text-white/40 leading-relaxed italic">
                        Dit past een multiplier toe op de wave height voorspelling voor {report.spotName}. 
                        Current: {report.forecastAtTime.waveHeight}m → New: {(report.forecastAtTime.waveHeight * multiplier).toFixed(2)}m
                      </p>
                    </motion.div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="glass-dark p-3 rounded-xl border border-white/5 space-y-1">
                        <p className="text-[8px] font-mono text-white/20 uppercase">Observed H</p>
                        <p className="text-xs font-bold text-white tracking-tight">{report.analysis.waveHeight}</p>
                      </div>
                      <div className="glass-dark p-3 rounded-xl border border-white/5 space-y-1">
                        <p className="text-[8px] font-mono text-white/20 uppercase">Forecast H</p>
                        <p className="text-xs font-bold text-white/60 tracking-tight">{report.forecastAtTime.waveHeight}m</p>
                      </div>
                      <div className="glass-dark p-3 rounded-xl border border-white/5 space-y-1">
                        <p className="text-[8px] font-mono text-white/20 uppercase">Wind Cond.</p>
                        <p className="text-xs font-bold text-white tracking-tight">{report.analysis.windCondition}</p>
                      </div>
                      <div className="glass-dark p-3 rounded-xl border border-white/5 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[8px] font-mono text-white/20 uppercase">Match</p>
                          <Gauge className="w-2.5 h-2.5 text-accent opacity-50" />
                        </div>
                        <p className="text-xs font-bold text-accent">{report.analysis.matchScore}/10</p>
                      </div>
                    </div>
                  )}

                  {report.userNote && (
                    <div className="glass-dark border border-accent/20 bg-accent/5 p-3 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3 h-3 text-accent" />
                        <span className="text-[8px] font-mono text-accent uppercase font-bold">Field Note</span>
                      </div>
                      <p className="text-xs text-white/80">{report.userNote}</p>
                    </div>
                  )}

                  <div className="relative">
                    <p className="text-[11px] leading-relaxed text-white/50 italic border-l border-white/10 pl-3 line-clamp-2">
                      {report.analysis.interpretation}
                    </p>
                    {report.analysis.isMismatched && (
                      <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-red-500/10 rounded-lg border border-red-500/20">
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                        <span className="text-[9px] font-mono text-red-400 uppercase">Mismatch Gedetecteerd</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {reports.length === 0 && (
          <div className="py-20 text-center glass rounded-3xl border border-white/5">
            <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Geen rapporten beschikbaar</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedReport && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReport(null)}
              className="absolute inset-0 bg-marine-950/90 backdrop-blur-md modal-backdrop"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass modal-dialog rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
            >
              <header className="modal-header p-6 sm:p-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <div className="flex items-center gap-2 text-accent mb-1">
                    <Zap className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.3em]">Advanced Analysis Recon</span>
                  </div>
                  <h2 className="modal-title text-2xl font-black italic uppercase text-white leading-none">{selectedReport.spotName}</h2>
                </div>
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="modal-close-btn p-2 glass hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </header>

              <div className="modal-body p-6 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto max-h-[70vh] custom-scroll">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="modal-subcard glass-dark p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-mono text-white/30 uppercase mb-1">Observed Height</p>
                    <p className="text-lg font-black text-white italic">{selectedReport.analysis.waveHeight}</p>
                  </div>
                  <div className="modal-subcard glass-dark p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-mono text-white/30 uppercase mb-1">Wind Status</p>
                    <p className="text-lg font-black text-white italic">{selectedReport.analysis.windCondition}</p>
                  </div>
                  <div className="modal-subcard glass-dark p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-mono text-white/30 uppercase mb-1">Match Accuracy</p>
                    <p className="text-lg font-black text-accent italic">{selectedReport.analysis.matchScore}/10</p>
                  </div>
                  <div className="modal-subcard glass-dark p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-mono text-white/30 uppercase mb-1">Protocol</p>
                    <p className="text-lg font-black text-white/60 italic uppercase">{selectedReport.isBeta ? 'Beta' : 'Std'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 border-b border-white/5 pb-2">Full AI Interpretation</h4>
                  <div className="modal-subcard glass-dark p-6 rounded-2xl border border-white/5 relative">
                    <p className="text-sm leading-relaxed text-white/80 italic">
                      "{selectedReport.analysis.interpretation}"
                    </p>
                    <div className="absolute top-2 right-4 text-white/5">
                       <MessageSquare className="w-12 h-12" />
                    </div>
                  </div>
                </div>

                {selectedReport.userNote && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 border-b border-white/5 pb-2">User Field Note</h4>
                    <div className="glass-dark p-6 rounded-2xl border border-accent/20 bg-accent/5 relative">
                      <p className="text-sm leading-relaxed text-white">
                        {selectedReport.userNote}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30 border-b border-white/5 pb-2">Metadata context</h4>
                  <div className="grid grid-cols-2 gap-6 p-2">
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-white/20 uppercase">Analyst</p>
                      <p className="text-xs text-white/60">
                        {selectedReport.userName || 'System'} ({selectedReport.userEmail || 'Private'})
                        {selectedReport.userSkillLevel && <span className="ml-2 px-1.5 py-0.5 bg-white/5 rounded text-[10px] border border-white/10 uppercase tracking-widest">{selectedReport.userSkillLevel}</span>}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-white/20 uppercase">Timestamp</p>
                      <p className="text-xs text-white/60">{format(parseISO(selectedReport.timestamp), 'eeee d MMMM yyyy HH:mm', { locale: nl })}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-white/20 uppercase">Coordinates</p>
                      <p className="text-xs text-white/60 font-mono">{selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-white/20 uppercase">Forecast Model height</p>
                      <p className="text-xs text-white/60">{selectedReport.forecastAtTime.waveHeight}m</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-8 bg-white/[0.02] border-t border-white/5 flex gap-4">
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="flex-1 py-4 glass hover:bg-white/10 text-white font-bold rounded-2xl transition-all"
                >
                  Close Analysis
                </button>
                {isAdmin && (
                  <>
                    <button 
                      onClick={() => {
                        const id = tweakingId === selectedReport.id ? null : selectedReport.id;
                        setTweakingId(id as string);
                        if (id) {
                          const observedStr = selectedReport.analysis.waveHeight.match(/[\d.]+/);
                          if (observedStr && selectedReport.forecastAtTime.waveHeight > 0) {
                            const observed = parseFloat(observedStr[0]);
                            setMultiplier(parseFloat((observed / selectedReport.forecastAtTime.waveHeight).toFixed(2)));
                          }
                          setSelectedReport(null);
                        }
                      }}
                      className="px-6 py-4 bg-accent/20 text-accent font-bold rounded-2xl transition-all hover:scale-[1.02] hover:bg-accent/30"
                    >
                      Tweak Spot
                    </button>
                    <button 
                      onClick={() => {
                        handleAccept(selectedReport);
                        setSelectedReport(null);
                      }}
                      className="px-6 py-4 bg-green-500/20 text-green-500 font-bold rounded-2xl transition-all hover:scale-[1.02] hover:bg-green-500/30"
                    >
                      Accept
                    </button>
                    <button 
                      onClick={() => {
                        handleDelete(selectedReport.id as string);
                        setSelectedReport(null);
                      }}
                      className="px-6 py-4 bg-red-500/20 text-red-500 font-bold rounded-2xl transition-all hover:scale-[1.02] hover:bg-red-500/30"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
