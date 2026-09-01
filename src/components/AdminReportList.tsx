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
  const isAdmin = auth.currentUser?.email && ADMIN_EMAILS.includes(auth.currentUser.email.toLowerCase());

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 font-tactical">
            <MessageSquare className="w-5 h-5 text-cyan-600" />
            {isAdmin ? 'Field Intelligence Feed' : 'Mijn Meldingen'}
          </h3>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5 font-bold">
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
                "bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden group",
                report.isBeta ? "bg-cyan-50/20 border-cyan-300" : ""
              )}
            >
              {report.isBeta && (
                <div className="absolute top-0 right-0 p-3">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-100 rounded-full border border-cyan-200">
                    <Zap className="w-2.5 h-2.5 text-cyan-700" />
                    <span className="text-[8px] font-mono text-cyan-800 uppercase font-bold">Beta Analysis</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] font-mono font-medium">
                        {format(parseISO(report.timestamp), 'd MMM HH:mm', { locale: nl })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-cyan-700">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">{report.spotName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 truncate flex-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] font-mono truncate">{report.userName || 'Analyst'} ({report.userEmail || 'Anon'})</span>
                      {report.userSkillLevel && (
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[8px] border border-slate-200 uppercase tracking-widest text-slate-700 font-bold">{report.userSkillLevel}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                       <button
                        onClick={() => setSelectedReport(report)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200 cursor-pointer"
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
                            className="p-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-lg transition-colors border border-cyan-200 cursor-pointer"
                            title="Tweak forecast"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleAccept(report)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200 cursor-pointer"
                            title="Accepteer report (log insight)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(report.id as string)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors border border-rose-200 cursor-pointer"
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
                      className="bg-slate-50 p-4 rounded-xl border border-cyan-200 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono text-cyan-800 uppercase font-bold">Apply Forecast Tweak</p>
                        <button onClick={() => setTweakingId(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] font-mono text-slate-500 uppercase font-bold">Wave Multiplier</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={multiplier}
                            onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold text-sm focus:border-cyan-600 outline-none"
                          />
                        </div>
                        <button 
                          onClick={() => handleApplyTweak(report)}
                          className="px-4 py-2 bg-cyan-600 text-white font-bold rounded-lg text-xs flex items-center gap-2 hover:bg-cyan-700 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Apply
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed italic">
                        Dit past een multiplier toe op de wave height voorspelling voor {report.spotName}. 
                        Current: {report.forecastAtTime.waveHeight}m → New: {(report.forecastAtTime.waveHeight * multiplier).toFixed(2)}m
                      </p>
                    </motion.div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                        <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Observed H</p>
                        <p className="text-xs font-bold text-slate-900 tracking-tight">{report.analysis.waveHeight}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                        <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Forecast H</p>
                        <p className="text-xs font-bold text-slate-700 tracking-tight">{report.forecastAtTime.waveHeight}m</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                        <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Wind Cond.</p>
                        <p className="text-xs font-bold text-slate-900 tracking-tight">{report.analysis.windCondition}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Match</p>
                          <Gauge className="w-3 h-3 text-cyan-600" />
                        </div>
                        <p className="text-xs font-bold text-cyan-700">{report.analysis.matchScore}/10</p>
                      </div>
                    </div>
                  )}

                  {report.userNote && (
                    <div className="bg-cyan-50/50 border border-cyan-200 p-3 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3.5 h-3.5 text-cyan-700" />
                        <span className="text-[9px] font-mono text-cyan-800 uppercase font-bold">Field Note</span>
                      </div>
                      <p className="text-xs text-slate-800">{report.userNote}</p>
                    </div>
                  )}

                  <div className="relative">
                    <p className="text-xs leading-relaxed text-slate-600 italic border-l-2 border-slate-200 pl-3 line-clamp-2">
                      {report.analysis.interpretation}
                    </p>
                    {report.analysis.isMismatched && (
                      <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 bg-rose-50 rounded-lg border border-rose-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-[9px] font-mono text-rose-700 uppercase font-bold">Mismatch Gedetecteerd</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {reports.length === 0 && (
          <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Geen rapporten beschikbaar</p>
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
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm modal-backdrop"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white modal-dialog rounded-3xl border border-slate-200 overflow-hidden shadow-2xl z-10"
            >
              <header className="modal-header p-6 sm:p-7 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <div className="flex items-center gap-2 text-cyan-700 mb-1">
                    <Zap className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest">Advanced Analysis Recon</span>
                  </div>
                  <h2 className="modal-title text-2xl font-black uppercase text-slate-900 leading-none font-tactical">{selectedReport.spotName}</h2>
                </div>
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="modal-close-btn p-2 bg-white hover:bg-slate-200 rounded-full transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </header>

              <div className="modal-body p-6 sm:p-7 space-y-6 overflow-y-auto max-h-[70vh] custom-scroll">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="modal-subcard bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-mono text-slate-400 uppercase mb-1 font-bold">Observed Height</p>
                    <p className="text-base font-black text-slate-900">{selectedReport.analysis.waveHeight}</p>
                  </div>
                  <div className="modal-subcard bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-mono text-slate-400 uppercase mb-1 font-bold">Wind Status</p>
                    <p className="text-base font-black text-slate-900">{selectedReport.analysis.windCondition}</p>
                  </div>
                  <div className="modal-subcard bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-mono text-slate-400 uppercase mb-1 font-bold">Match Accuracy</p>
                    <p className="text-base font-black text-cyan-700">{selectedReport.analysis.matchScore}/10</p>
                  </div>
                  <div className="modal-subcard bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-mono text-slate-400 uppercase mb-1 font-bold">Protocol</p>
                    <p className="text-base font-black text-slate-700 uppercase">{selectedReport.isBeta ? 'Beta' : 'Std'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 border-b border-slate-100 pb-2">Full AI Interpretation</h4>
                  <div className="modal-subcard bg-slate-50 p-5 rounded-2xl border border-slate-200 relative">
                    <p className="text-sm leading-relaxed text-slate-800 italic">
                      "{selectedReport.analysis.interpretation}"
                    </p>
                  </div>
                </div>

                {selectedReport.userNote && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 border-b border-slate-100 pb-2">User Field Note</h4>
                    <div className="p-5 rounded-2xl border border-cyan-200 bg-cyan-50/50">
                      <p className="text-sm leading-relaxed text-slate-900 font-medium">
                        {selectedReport.userNote}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 border-b border-slate-100 pb-2">Metadata context</h4>
                  <div className="grid grid-cols-2 gap-4 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Analyst</p>
                      <p className="text-xs text-slate-700">
                        {selectedReport.userName || 'System'} ({selectedReport.userEmail || 'Private'})
                        {selectedReport.userSkillLevel && <span className="ml-2 px-1.5 py-0.5 bg-white rounded text-[9px] border border-slate-200 uppercase tracking-wider font-bold">{selectedReport.userSkillLevel}</span>}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Timestamp</p>
                      <p className="text-xs text-slate-700">{format(parseISO(selectedReport.timestamp), 'eeee d MMMM yyyy HH:mm', { locale: nl })}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Coordinates</p>
                      <p className="text-xs text-slate-700 font-mono">{selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold">Forecast Model height</p>
                      <p className="text-xs text-slate-700">{selectedReport.forecastAtTime.waveHeight}m</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-5 bg-slate-50 border-t border-slate-200 flex gap-3">
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="flex-1 py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl border border-slate-200 transition-all cursor-pointer text-xs uppercase font-mono"
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
                      className="px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase font-mono"
                    >
                      Tweak Spot
                    </button>
                    <button 
                      onClick={() => {
                        handleAccept(selectedReport);
                        setSelectedReport(null);
                      }}
                      className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase font-mono"
                    >
                      Accept
                    </button>
                    <button 
                      onClick={() => {
                        handleDelete(selectedReport.id as string);
                        setSelectedReport(null);
                      }}
                      className="px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase font-mono"
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
