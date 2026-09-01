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
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
        <h3 className="text-slate-900 font-bold text-lg">Inloggen Vereist</h3>
        <p className="text-slate-600 text-sm">Je moet ingelogd zijn om een spot report achter te laten. Ga naar je profiel om in te loggen.</p>
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
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700">
            <Aperture className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-mono uppercase tracking-widest text-cyan-700 font-bold">Field Intelligence</h3>
            <p className="text-lg font-black uppercase text-slate-900 font-tactical">Spot Report Insturen</p>
          </div>
        </div>
        <button 
          onClick={() => setShowInstructions(!showInstructions)}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors cursor-pointer"
          title="Instructies"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {showInstructions && (
        <div className="bg-slate-50 p-4 rounded-2xl text-xs font-mono text-slate-700 space-y-2 border border-slate-200 leading-relaxed">
          <p className="font-bold text-slate-900 uppercase">Protocol voor betrouwbare spotdata:</p>
          <ul className="space-y-1 text-slate-600">
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-cyan-600 rounded-full shrink-0" /> Houd de horizon zo recht mogelijk</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-cyan-600 rounded-full shrink-0" /> Identificeer vaste herkenningspunten (pieren, strandpalen)</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-cyan-600 rounded-full shrink-0" /> Focus op de branding / brekende golven</li>
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold ml-1">Selecteer Spot</label>
          <div className="relative">
            <select 
              value={selectedSpotId}
              onChange={(e) => setSelectedSpotId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-cyan-600 appearance-none font-medium"
            >
              <option value="" className="bg-white text-slate-500">--- Selecteer Spot ---</option>
              {spots.map(s => (
                <option key={s.id} value={s.id} className="bg-white text-slate-900">{s.name}</option>
              ))}
            </select>
            <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold ml-1">Extra opmerkingen (optioneel)</label>
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Bijv: 'De stroming trekt flink naar het noorden' of 'Goede golven, cleane sets!'"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 resize-none h-24"
          />
        </div>

        <button
          disabled={!selectedSpotId || isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-12 sm:h-14 flex items-center justify-center gap-2.5 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-wider hover:bg-cyan-700 disabled:opacity-40 transition-all shadow-md cursor-pointer text-xs sm:text-sm font-mono"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          Report met Foto Verzenden
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
          "p-4 rounded-xl flex items-start gap-3 text-xs font-mono border transition-all",
          status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          status.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-cyan-50 border-cyan-200 text-cyan-800'
        )}>
          {status.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />}
          {status.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />}
          {status.type === 'info' && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-cyan-600 mt-0.5" />}
          <p className="leading-relaxed font-medium">{status.message}</p>
        </div>
      )}

      <p className="text-[10px] font-mono text-slate-400 text-center uppercase tracking-wider">
        Visuele data wordt real-time verwerkt via GPS en AI-analyse.
      </p>
    </div>
  );
}
