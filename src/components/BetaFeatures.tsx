import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Zap, Shield, Navigation, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { SurfSpot, ForecastData } from '../types';
import { analyzeWaveVideo } from '../services/geminiService';
import { cn } from '../lib/utils';
import { db, collection, addDoc, handleFirestoreError, OperationType, updateDoc, doc } from '../lib/firebase';
import { AdminReportList } from './AdminReportList';

interface BetaFeaturesProps {
  spots: SurfSpot[];
  forecasts: Record<string, ForecastData>;
  userCoords: { lat: number, lng: number } | null;
  userEmail: string;
  selectedSpotId: string;
  onSelectSpot: (id: string) => void;
}

export function BetaFeatures({ spots, forecasts, userCoords, userEmail, selectedSpotId, onSelectSpot }: BetaFeaturesProps) {
  const [isLive, setIsLive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [userNote, setUserNote] = useState('');
  const [reportDocId, setReportDocId] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proximityStatus, setProximityStatus] = useState<'checking' | 'verified' | 'failed'>('checking');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const selectedSpot = spots.find(s => s.id === selectedSpotId);
  const currentForecast = forecasts[selectedSpotId];

  // Calculate distance
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (!userCoords || !selectedSpot) {
      setProximityStatus('failed');
      return;
    }
    const dist = calculateDistance(userCoords.lat, userCoords.lng, selectedSpot.lat, selectedSpot.lng);
    setProximityStatus(dist < 2 ? 'verified' : 'failed'); // Within 2km
  }, [userCoords, selectedSpotId]);

  const startCamera = async () => {
    setError(null);
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Je browser ondersteunt geen cameratoegang. Gebruik een moderne browser.");
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' },
          audio: false 
        });
      } catch (e) {
        console.warn("Environmental camera failed, trying default:", e);
        // Fallback to any video device
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: false 
        });
      }
      
      streamRef.current = stream;
      setIsLive(true);
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Cameratoegang geweigerd of niet beschikbaar. Controleer of je browser toestemming heeft.");
    }
  };

  useEffect(() => {
    if (isLive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }
  });

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsLive(false);
  };

  const captureFrames = async () => {
    if (!videoRef.current || !canvasRef.current) {
        setError("Camera componenten niet gereed.");
        return;
    }
    
    if (!selectedSpot || !currentForecast) {
        setError("Wacht op spot data...");
        return;
    }
    
    setIsCapturing(true);
    setError(null);
    const frames: string[] = [];
    const context = canvasRef.current.getContext('2d');
    
    if (!context) {
        setError("Kon geen canvas context verkrijgen.");
        return;
    }

    // Set canvas dimensions to match video
    canvasRef.current.width = videoRef.current.videoWidth || 640;
    canvasRef.current.height = videoRef.current.videoHeight || 480;

    for (let i = 0; i < 4; i++) {
        if (!videoRef.current) break;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const frame = canvasRef.current.toDataURL('image/jpeg', 0.8);
        frames.push(frame);
        setCapturedFrames([...frames]);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      const result = await analyzeWaveVideo(frames, selectedSpot, currentForecast);
      setAnalysis(result);
      
      // Save report auto
      const docRef = await addDoc(collection(db, 'spotReports'), {
        userId: userEmail === 'sebastiaan.boom2@gmail.com' ? 'admin' : (userEmail || 'anonymous'),
        userEmail,
        userName: userEmail === 'sebastiaan.boom2@gmail.com' ? 'Admin' : (userEmail.split('@')[0]),
        spotId: selectedSpot.id,
        spotName: selectedSpot.name,
        timestamp: new Date().toISOString(),
        location: userCoords,
        forecastAtTime: currentForecast,
        analysis: result,
        isBeta: true
      });

      setReportDocId(docRef.id);

    } catch (err) {
      setError("AI Analyse mislukt. Probeer het opnieuw.");
    } finally {
      setIsCapturing(false);
      stopCamera();
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="glass rounded-[2rem] p-8 border border-accent/20 bg-accent/5">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-black italic uppercase text-white tracking-tighter">
                {userEmail === 'sebastiaan.boom2@gmail.com' ? 'Admin Beta Lounge' : 'AI Field Intelligence'}
              </h2>
              <p className="text-[10px] font-mono text-accent tracking-[0.3em] uppercase">Live AI Field Calibration</p>
            </div>
          </div>
          <div className="px-4 py-2 glass rounded-xl flex items-center gap-2 border border-accent/20">
            {userEmail === 'sebastiaan.boom2@gmail.com' ? (
              <>
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] font-mono text-emerald-400 uppercase">Admin Verified</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-accent" />
                <span className="text-[9px] font-mono text-accent uppercase">Beta Analyst</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-mono uppercase text-white/30 tracking-widest block">Selecteer Focus Spot</label>
              <select 
                value={selectedSpotId}
                onChange={(e) => onSelectSpot(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white focus:ring-accent outline-none"
              >
                {spots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="p-6 rounded-2xl glass-dark border border-white/5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-white/60">Systeem Check</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-3 h-3 text-white/20" />
                    <span className="text-[11px] text-white/40">Locatie Verificatie</span>
                  </div>
                  {proximityStatus === 'verified' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : proximityStatus === 'checking' ? (
                    <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                {proximityStatus === 'failed' && (
                  <p className="text-[10px] text-amber-500/80 leading-relaxed italic">
                    Je bevindt je niet binnen het 2km bereik van {selectedSpot?.name}. Live kalibratie is alleen mogelijk op locatie.
                  </p>
                )}
              </div>
            </div>

            {!isLive && !analysis && (
              <button
                onClick={startCamera}
                className={cn(
                  "w-full py-4 font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform shadow-lg",
                  proximityStatus === 'verified' 
                    ? "bg-accent text-marine-950 shadow-accent/20" 
                    : "bg-white/10 text-white/40 border border-white/10"
                )}
              >
                <Camera className="w-5 h-5" />
                {proximityStatus === 'verified' ? 'Start Live Feed' : 'Start Feed (Unverified)'}
              </button>
            )}
          </div>

          <div className="relative aspect-video glass rounded-2xl overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center">
            {isLive ? (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-500 rounded-full animate-pulse">
                  <div className="w-2 h-2 bg-white rounded-full" />
                  <span className="text-[9px] font-bold text-white uppercase tracking-widest">Live</span>
                </div>
                {!isCapturing && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full px-6">
                    <button
                      onClick={captureFrames}
                      className="w-full py-3 bg-white text-marine-950 font-black rounded-xl uppercase text-[11px] tracking-[0.2em] shadow-2xl"
                    >
                      Analyseer Nu (4s)
                    </button>
                  </div>
                )}
              </>
            ) : analysis ? (
              <div className="p-8 space-y-6 w-full h-full overflow-y-auto no-scrollbar">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-accent" />
                  <h4 className="text-xl font-bold text-white uppercase italic">AI Deep Scan Resultaat</h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 glass-dark border border-white/5 rounded-xl">
                    <p className="text-[9px] font-mono text-white/30 uppercase mb-1">Visual Height</p>
                    <p className="text-lg font-bold text-accent">{analysis.waveHeight}</p>
                  </div>
                  <div className="p-4 glass-dark border border-white/5 rounded-xl">
                    <p className="text-[9px] font-mono text-white/30 uppercase mb-1">Visual Wind</p>
                    <p className="text-lg font-bold text-white">{analysis.windCondition}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono text-white/30 uppercase">Data Match Score</span>
                    <span className="text-[9px] font-mono text-accent">{analysis.matchScore}/10</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${analysis.matchScore * 10}%` }}
                      className="h-full bg-accent"
                    />
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-white/60 italic border-l-2 border-accent/30 pl-4 py-1">
                  "{analysis.interpretation}"
                </p>

                <div className="space-y-3 pt-4 border-t border-white/5">
                   <label className="text-[10px] font-mono uppercase text-white/30 tracking-widest block">Eigen Opmerking / Ops</label>
                   <div className="relative">
                     <textarea 
                       value={userNote}
                       onChange={(e) => setUserNote(e.target.value)}
                       placeholder="Bijv: 'Iets holler dan voorspeld', 'Aflandige wind trekt aan'..."
                       className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-accent/50 min-h-[80px] resize-none"
                     />
                     {reportDocId && (
                       <button
                        onClick={async () => {
                          if (!reportDocId) return;
                          setIsSavingNote(true);
                          try {
                            await updateDoc(doc(db, 'spotReports', reportDocId), {
                              userNote: userNote
                            });
                          } catch (err) {
                            console.error("Error saving note:", err);
                          } finally {
                            setIsSavingNote(false);
                          }
                        }}
                        disabled={isSavingNote}
                        className="absolute bottom-3 right-3 p-2 bg-accent text-marine-950 rounded-lg disabled:opacity-50"
                       >
                         {isSavingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                       </button>
                     )}
                   </div>
                </div>

                <button
                  onClick={() => { 
                    setAnalysis(null); 
                    setCapturedFrames([]); 
                    setUserNote('');
                    setReportDocId(null);
                  }}
                  className="w-full py-3 glass rounded-xl text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >
                  Nieuwe Scan
                </button>
              </div>
            ) : isCapturing ? (
              <div className="text-center space-y-4">
                <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto" />
                <p className="text-[11px] font-mono text-white/40 uppercase tracking-widest">Frames synchroniseren & analyseren...</p>
                <div className="flex justify-center gap-1">
                  {[0,1,2,3].map(i => (
                    <div 
                      key={i} 
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors duration-500",
                        capturedFrames.length > i ? "bg-accent" : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 opacity-40">
                <Camera className="w-12 h-12 mx-auto mb-2" />
                <p className="text-[11px] font-mono uppercase tracking-widest px-8">Wacht op camerastart...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} width={640} height={480} className="hidden" />

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      <div className="pt-12 border-t border-white/5">
        <AdminReportList />
      </div>
    </div>
  );
}
