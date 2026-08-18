import React, { useState, useRef } from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2, Info, Aperture, MapPin, Eye } from 'lucide-react';
import { SurfSpot, ForecastData, UserProfile } from '../types';
import { analyzeSpotPhoto } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface SpotReportProps {
  spots: SurfSpot[];
  currentForecasts: Record<string, ForecastData>;
  initialSpotId?: string;
  onComplete?: () => void;
  user: UserProfile | null;
}

export function SpotReport({ spots, currentForecasts, initialSpotId, onComplete, user }: SpotReportProps) {
  const [selectedSpotId, setSelectedSpotId] = useState<string>(initialSpotId || '');
  const [userNote, setUserNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!auth.currentUser) {
    return (
      <div className="p-8 text-center glass-dark rounded-2xl border border-white/5 space-y-4">
        <AlertCircle className="w-8 h-8 text-white/40 mx-auto" />
        <h3 className="text-white font-bold">Inloggen Vereist</h3>
        <p className="text-white/60 text-sm">Je moet ingelogd zijn om een spot report achter te laten. Ga naar je profiel om in te loggen.</p>
      </div>
    );
  }

  // Sync with initialSpotId if it changes and we haven't selected one yet
  React.useEffect(() => {
    if (initialSpotId && !selectedSpotId) {
      setSelectedSpotId(initialSpotId);
    }
  }, [initialSpotId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedSpotId) return;

    const spot = spots.find(s => s.id === selectedSpotId);
    if (!spot) return;

    setIsUploading(true);
    setStatus({ type: 'info', message: 'Positie bepalen...' });

    try {
      // 1. Verify Location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      const distance = getDistance(
        position.coords.latitude,
        position.coords.longitude,
        spot.lat,
        spot.lng
      );

      // 2km threshold instead of 0.5km for better reliability
      if (distance > 2.0) {
        setStatus({ 
          type: 'error', 
          message: `Afstand overschrijdt de toegestane limiet voor ${spot.name} (${(distance).toFixed(1)}km). Authorization vereist <2km nabijheid voor verificatie.` 
        });
        setIsUploading(false);
        return;
      }

      setStatus({ type: 'info', message: 'Visuele data analyseren...' });

      // 2. Read file as base64
      const file = files[0];
      const base64 = await fileToBase64(file);

      // 3. Analyze with Gemini
      const forecast = currentForecasts[spot.id] || currentForecasts[Object.keys(currentForecasts)[0]];
      const analysis = await analyzeSpotPhoto(base64, spot, forecast);

      // 4. Save to Firestore
      const reportData: any = {
        userId: auth.currentUser?.uid,
        userName: auth.currentUser?.displayName,
        userEmail: auth.currentUser?.email,
        userSkillLevel: user?.skillLevel,
        userNote: userNote.trim() || null, // null is allowed, undefined is not! or better yet, strip undefineds
        spotId: spot.id,
        spotName: spot.name,
        timestamp: new Date().toISOString(),
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        },
        forecastAtTime: forecast,
        analysis,
        createdAt: serverTimestamp()
      };

      // Firestore SDK doesn't allow undefined values.
      Object.keys(reportData).forEach(key => {
        if (reportData[key] === undefined) {
          delete reportData[key];
        }
      });

      await addDoc(collection(db, 'spotReports'), reportData);

      setStatus({ 
        type: 'success', 
        message: 'Telemetry gesynchroniseerd. AI Match Score: ' + analysis.matchScore + '/10. Veld rapport opgeslagen.' 
      });
      
      if (onComplete) onComplete();
    } catch (error: any) {
      console.error(error);
      
      let errorMsg = 'Systeemfout tijdens analyse.';
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
            errorMsg = 'Locatietoegang geweigerd. Zet GPS aan en geef toestemming.';
        } else if (error.message.includes('timeout') || (error as any).code === 3) {
            errorMsg = 'Locatie bepalen duurde te lang. Controleer je GPS-signaal.';
        } else {
            errorMsg = `Fout: ${error.message}`;
        }
      } else if (error && typeof error === 'object' && 'code' in error && (error as any).code) { // GeolocationPositionError
         if (error.code === 1) errorMsg = 'Locatietoegang geweigerd.';
         else if (error.code === 2) errorMsg = 'Locatie onbekend (GPS error).';
         else if (error.code === 3) errorMsg = 'Locatie bepalen duurde te lang (Timeout).';
      }
      
      setStatus({ type: 'error', message: errorMsg });
      handleFirestoreError(error, OperationType.WRITE, 'spotReports');
    } finally {
      setIsUploading(false);
    }
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div className="glass p-6 rounded-[2rem] border border-white/5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center">
            <Aperture className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/50">Spot Report Insturen</h3>
          </div>
        </div>
        <button 
          onClick={() => setShowInstructions(!showInstructions)}
          className="p-2 glass rounded-full hover:bg-white/10 transition-colors"
        >
          <Info className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {showInstructions && (
        <div className="glass p-4 rounded-xl text-[10px] font-mono uppercase tracking-widest text-white/40 space-y-3 border border-white/10 leading-relaxed">
          <p className="font-bold text-accent">Protocol voor optimale data:</p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-accent rounded-full" /> Houd de horizon recht</li>
            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-accent rounded-full" /> Identificeer vaste herkenningspunten</li>
            <li className="flex items-center gap-2"><div className="w-1 h-1 bg-accent rounded-full" /> Focus op de branding zone</li>
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-white/30 ml-2">Selecteer Spot</label>
          <div className="relative">
            <select 
              value={selectedSpotId}
              onChange={(e) => setSelectedSpotId(e.target.value)}
              className="w-full glass rounded-2xl border border-white/5 bg-transparent px-4 py-3 text-sm text-white focus:outline-none appearance-none"
            >
              <option value="" className="bg-marine-950">--- Selecteer Spot ---</option>
              {spots.map(s => (
                <option key={s.id} value={s.id} className="bg-marine-950">{s.name}</option>
              ))}
            </select>
            <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-white/30 ml-2">Extra opmerkingen (optioneel)</label>
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Bijv: 'De stroming is sterker dan verwacht' of 'Goede golven maar wel druk'"
            className="w-full glass rounded-2xl border border-white/5 bg-transparent px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none resize-none h-24"
          />
        </div>

        <button
          disabled={!selectedSpotId || isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-14 flex items-center justify-center gap-3 bg-white text-marine-950 rounded-2xl font-display font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:scale-100 transition-all shadow-xl"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          Report Insturen
        </button>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {status && (
        <div className={cn(
          "p-4 rounded-xl flex items-start gap-4 text-[10px] font-mono uppercase tracking-widest border transition-all",
          status.type === 'success' ? 'glass border-emerald-500/20 text-emerald-400' :
          status.type === 'error' ? 'glass border-red-500/20 text-red-400' :
          'glass border-accent/20 text-accent'
        )}>
          {status.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {status.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {status.type === 'info' && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
          <p className="leading-relaxed">{status.message}</p>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 py-2 opacity-30">
        <div className="h-px w-8 bg-white" />
        <Eye className="w-3 h-3 text-white" />
        <div className="h-px w-8 bg-white" />
      </div>

      <p className="text-[8px] font-mono text-white/20 text-center uppercase tracking-widest">
        Visuele data wordt real-time verwerkt. Alleen de analyse wordt opgeslagen.
      </p>
    </div>
  );
}
