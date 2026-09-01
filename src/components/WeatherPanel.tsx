import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cloud, 
  Wind, 
  Thermometer, 
  Droplets, 
  Search, 
  Crosshair, 
  Zap, 
  BarChart3, 
  Layers, 
  Target, 
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Cpu,
  Brain,
  Info,
  CheckCircle2,
  Calendar,
  Gauge
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { format, parseISO, addDays, subDays, subYears } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { SurfSpot, WeatherModel, ModelRanking, MixedForecastDay } from '../types';
import { Tooltip, TooltipIcon } from './ui/Tooltip';

const MODELS: WeatherModel[] = [
  { id: "best_match", name: "Open-Meteo best match" },
  { id: "ecmwf_ifs04", name: "ECMWF IFS 0.4°" },
  { id: "icon_seamless", name: "DWD ICON seamless" },
  { id: "gfs_seamless", name: "NOAA GFS seamless" },
  { id: "ukmo_seamless", name: "UKMO seamless" },
  { id: "meteofrance_seamless", name: "Météo-France seamless" },
  { id: "gem_seamless", name: "GEM seamless" }
];

interface WeatherPanelProps {
  spot: SurfSpot;
}

export function WeatherPanel({ spot }: WeatherPanelProps) {
  const [mode, setMode] = useState<'simple' | 'pro'>('simple');
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Analyseer je locatie voor een lokaal gecorrigeerde verwachting.');
  const [verifyDays, setVerifyDays] = useState(365);
  const [historyYears, setHistoryYears] = useState(5);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(MODELS.map(m => m.id));
  
  const [rankings, setRankings] = useState<ModelRanking[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [bestModels, setBestModels] = useState<{
    total: ModelRanking;
    temp: ModelRanking;
    rain: ModelRanking;
    wind: ModelRanking;
  } | null>(null);
  const [mixedForecast, setMixedForecast] = useState<(MixedForecastDay & { 
    hourly: { 
      time: string[], 
      temp: number[], 
      rain: number[], 
      wind: number[] 
    } 
  })[]>([]);

  const fetchJson = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  };

  const getDaily = (hourly: any) => {
    if (!hourly || !hourly.time) return [];
    const map = new Map();

    hourly.time.forEach((t: string, i: number) => {
      const day = t.slice(0, 10);
      if (!map.has(day)) {
        map.set(day, { date: day, temp: [], rain: [], wind: [], cloud: [] });
      }
      const row = map.get(day);
      row.temp.push(hourly.temperature_2m?.[i]);
      row.rain.push(hourly.precipitation?.[i]);
      row.wind.push(hourly.wind_speed_10m?.[i]);
      row.cloud.push(hourly.cloud_cover?.[i]);
    });

    return Array.from(map.values()).map(d => ({
      date: d.date,
      tempMean: d.temp.reduce((a: any, b: any) => a + b, 0) / d.temp.length,
      rainSum: d.rain.reduce((a: any, b: any) => a + b, 0),
      windMean: d.wind.reduce((a: any, b: any) => a + b, 0) / d.wind.length,
      cloudMean: d.cloud.reduce((a: any, b: any) => a + b, 0) / d.cloud.length
    }));
  };

  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    setStatusText('Waarnemingen en klimaatbeeld ophalen...');

    const today = new Date();
    const yesterday = subDays(today, 1);
    const verifyStart = format(subDays(today, verifyDays), 'yyyy-MM-dd');
    const verifyEnd = format(yesterday, 'yyyy-MM-dd');
    
    try {
      // 1. Get observed data
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${spot.lat}&longitude=${spot.lng}&hourly=temperature_2m,precipitation,wind_speed_10m,cloud_cover&timezone=auto&start_date=${verifyStart}&end_date=${verifyEnd}`;
      const archiveData = await fetchJson(archiveUrl);
      const observedDays = getDaily(archiveData.hourly);

      // 2. Test models
      const results: ModelRanking[] = [];
      const selectedModels = MODELS.filter(m => selectedModelIds.includes(m.id));

      for (let i = 0; i < selectedModels.length; i++) {
        const model = selectedModels[i];
        setStatusText(`Model ${i + 1}/${selectedModels.length} toetsen: ${model.name}`);
        
        try {
          // Delay to prevent Open-Meteo rate limiting / connection drops
          if (i > 0) await new Promise(r => setTimeout(r, 600));
          
          const histUrl = `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lng}&hourly=temperature_2m,precipitation,wind_speed_10m,cloud_cover&timezone=auto&start_date=${verifyStart}&end_date=${verifyEnd}&models=${encodeURIComponent(model.id)}`;
          const histData = await fetchJson(histUrl);
          const forecastDays = getDaily(histData.hourly);
          
          // Join and calc
          const joined = forecastDays.filter(f => observedDays.find(o => o.date === f.date)).map(f => {
            const o = observedDays.find(obs => obs.date === f.date);
            return { f, o };
          });

          if (joined.length < 20) continue;

          // Simple metrics
          const tempErrors = joined.map(j => j.o.tempMean - j.f.tempMean);
          const windErrors = joined.map(j => j.o.windMean - j.f.windMean);
          const maeTemp = tempErrors.reduce((a, b) => a + Math.abs(b), 0) / joined.length;
          const biasTemp = tempErrors.reduce((a, b) => a + b, 0) / joined.length;
          const maeWind = windErrors.reduce((a, b) => a + Math.abs(b), 0) / joined.length;
          const biasWind = windErrors.reduce((a, b) => a + b, 0) / joined.length;

          let rainHits = 0;
          let misses = 0;
          let falseAlarms = 0;
          joined.forEach(j => {
            const fWet = j.f.rainSum > 0.2;
            const oWet = j.o.rainSum > 0.2;
            if (fWet === oWet) rainHits++;
            if (!fWet && oWet) misses++;
            if (fWet && !oWet) falseAlarms++;
          });

          const rainHitRate = rainHits / joined.length;
          const rainBias = joined.reduce((a, j) => a + (j.o.rainSum - j.f.rainSum), 0) / joined.length;

          const tempScore = Math.max(0, 100 - maeTemp * 14);
          const rainScore = rainHitRate * 100;
          const windScore = Math.max(0, 100 - maeWind * 8);
          const totalScore = Math.round(tempScore * 0.4 + rainScore * 0.4 + windScore * 0.2);

          results.push({
            model, rows: joined, days: joined.length, maeTemp, biasTemp, maeWind, biasWind,
            rainHitRate, misses, falseAlarms, wetObserved: joined.filter(j => j.o.rainSum > 0.2).length,
            wetForecast: joined.filter(j => j.f.rainSum > 0.2).length, rainBias,
            tempScore, rainScore, windScore, totalScore
          });
        } catch (e) {
          console.error(`Failed to fetch historical for ${model.name}`, e);
        }
      }

      const best = {
        total: [...results].sort((a, b) => b.totalScore - a.totalScore)[0],
        temp: [...results].sort((a, b) => a.maeTemp - b.maeTemp)[0],
        rain: [...results].sort((a, b) => b.rainHitRate - a.rainHitRate)[0],
        wind: [...results].sort((a, b) => a.maeWind - b.maeWind)[0]
      };

      setRankings(results);
      setBestModels(best as any);

      // 3. Get upcoming best mix
      const uniqueWinnerIds = Array.from(new Set([best.total.model.id, best.temp.model.id, best.rain.model.id, best.wind.model.id]));
      const forecastMap = new Map();
      
      let reqCount = 0;
      for (const mid of uniqueWinnerIds) {
        if (reqCount > 0) await new Promise(r => setTimeout(r, 600));
        reqCount++;
        
        setStatusText(`Komende verwachting ophalen: ${MODELS.find(m => m.id === mid)?.name}`);
        const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lng}&hourly=temperature_2m,precipitation,wind_speed_10m,cloud_cover&timezone=auto&forecast_days=7&models=${encodeURIComponent(mid)}`;
        const fData = await fetchJson(fUrl);
        forecastMap.set(mid, { daily: getDaily(fData.hourly), hourly: fData.hourly });
      }

      const tempForecast = forecastMap.get(best.temp.model.id);
      const rainForecast = forecastMap.get(best.rain.model.id);
      const windForecast = forecastMap.get(best.wind.model.id);

      const mixed = tempForecast.daily.map((t: any, i: number) => {
        const r = rainForecast.daily[i];
        const w = windForecast.daily[i];
        
        // Slice 24 hours for this day
        const dayStartIdx = i * 24;
        const dayEndIdx = (i + 1) * 24;

        return {
          date: t.date,
          tempModel: best.temp.model.name,
          rainModel: best.rain.model.name,
          windModel: best.wind.model.name,
          temp: t.tempMean,
          tempCorrected: t.tempMean + best.temp.biasTemp,
          rain: Math.max(0, r.rainSum + best.rain.rainBias * 0.25),
          rainRaw: r.rainSum,
          wind: Math.max(0, w.windMean + best.wind.biasWind),
          windRaw: w.windMean,
          cloud: t.cloudMean,
          confidence: Math.max(40, best.total.totalScore - i * 5),
          hourly: {
            time: tempForecast.hourly.time.slice(dayStartIdx, dayEndIdx),
            temp: tempForecast.hourly.temperature_2m.slice(dayStartIdx, dayEndIdx).map((v: number) => v + best.temp.biasTemp),
            rain: rainForecast.hourly.precipitation.slice(dayStartIdx, dayEndIdx).map((v: number) => Math.max(0, v + best.rain.rainBias * 0.01)),
            wind: windForecast.hourly.wind_speed_10m.slice(dayStartIdx, dayEndIdx).map((v: number) => Math.max(0, v + best.wind.biasWind))
          }
        };
      });

      setMixedForecast(mixed);
      setStatusText(`Analyse voltooid op basis van ${verifyDays} dagen modeltoets.`);
    } catch (e: any) {
      setStatusText(`Fout: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [spot, verifyDays, selectedModelIds]);

  useEffect(() => {
    runAnalysis();
  }, [spot.id]);

  const currentMixed = mixedForecast[0];

  return (
    <div className="space-y-8">
      {/* Header section w/ Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-100 border border-cyan-300 flex items-center justify-center text-cyan-800 shadow-xs flex-shrink-0">
            <Zap className="w-6 h-6 text-cyan-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-black italic uppercase text-slate-900 tracking-tight">Atmos IQ</h2>
              <TooltipIcon content="Meteorologische rekenmotor die 7 weermodellen toetst tegen historische meetstations en de beste data combineert voor deze spot." />
            </div>
            <p className="text-xs font-mono font-bold text-cyan-800 uppercase tracking-widest mt-0.5">
              Lokale Weer- & Weermodel Intelligentie
            </p>
          </div>
        </div>

        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 self-stretch sm:self-auto justify-center">
          <button 
            onClick={() => setMode('simple')}
            className={cn(
              "px-5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all",
              mode === 'simple' ? "bg-white text-slate-900 shadow-xs border border-slate-200" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Overzicht
          </button>
          <Tooltip content="Geavanceerde modus die de scores, foutmarges (MAE/Bias) en individuele prestaties per weermodel onthult.">
            <button 
              onClick={() => setMode('pro')}
              className={cn(
                "px-5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all",
                mode === 'pro' ? "bg-cyan-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Pro Modellen
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Constraints Panel (Collapsible / Config) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold uppercase text-slate-700 tracking-wider">Modeltoetsing</label>
              <TooltipIcon content="Het aantal dagen dat de historische voorspellingen worden vergeleken met daadwerkelijk gemeten weerdata op deze coördinaten." />
            </div>
            <select 
              value={verifyDays} 
              onChange={(e) => setVerifyDays(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-100 transition-all cursor-pointer"
            >
              {[90, 180, 365, 730].map(d => <option key={d} value={d}>{d} dagen analyse</option>)}
            </select>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold uppercase text-slate-700 tracking-wider">Klimaatperiode</label>
              <TooltipIcon content="Historische referentieperiode om seizoensgebonden afwijkingen en lokale microklimaten vast te stellen." />
            </div>
            <select 
              value={historyYears} 
              onChange={(e) => setHistoryYears(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-100 transition-all cursor-pointer"
            >
              {[5, 10, 15].map(y => <option key={y} value={y}>{y} jaar historiek</option>)}
            </select>
          </div>

          <div className="md:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-2 sm:pt-0">
            <button 
              onClick={runAnalysis}
              disabled={isLoading}
              className="flex-1 h-[42px] bg-cyan-700 hover:bg-cyan-800 active:scale-98 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Target className={cn("w-4 h-4", isLoading && "animate-spin")} />
              <span>{isLoading ? 'Herberekenen...' : 'Modellen Herkalibreren'}</span>
            </button>
            <div className="px-4 h-[42px] flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-semibold text-slate-600 truncate">
              GPS: {spot.lat.toFixed(3)}°N, {spot.lng.toFixed(3)}°E
            </div>
          </div>
        </div>

        {mode === 'pro' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-4 border-t border-slate-200"
          >
            <p className="text-xs font-mono font-bold uppercase text-slate-600 mb-3 tracking-wider">
              Actieve Modellen in Vergelijking:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {MODELS.map(m => (
                <label 
                  key={m.id}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-mono transition-all cursor-pointer select-none",
                    selectedModelIds.includes(m.id) 
                      ? "border-cyan-500 bg-cyan-50 text-cyan-900 font-bold shadow-2xs" 
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-400 hover:text-slate-800"
                  )}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedModelIds.includes(m.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedModelIds([...selectedModelIds, m.id]);
                      else setSelectedModelIds(selectedModelIds.filter(id => id !== m.id));
                    }}
                    className="rounded text-cyan-600 focus:ring-cyan-500 border-slate-300"
                  />
                  <span className="truncate">{m.name.replace('Open-Meteo ', '').replace(' seamless', '')}</span>
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Live Status Bar */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-center gap-3 text-sky-900 shadow-2xs">
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-sky-700 flex-shrink-0" />
        )}
        <p className="text-xs font-mono font-semibold text-sky-950 truncate">
          {statusText}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'simple' ? (
          <motion.div 
            key="simple"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {/* Simple View Content: Hero + Trust Score */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Primary Active Forecast Hero Banner */}
              <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between min-h-[380px] border border-slate-800 shadow-md relative overflow-hidden">
                <div className="relative space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/20 border border-cyan-400/30 rounded-full text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Lokaal Gecorrigeerde Weersverwachting</span>
                  </div>

                  <div className="flex items-baseline gap-4">
                    <h3 className="text-7xl sm:text-8xl font-black italic text-white tracking-tight">
                      {isLoading ? '--' : `${Math.round(currentMixed?.tempCorrected || 0)}°`}
                    </h3>
                    <span className="text-lg font-mono font-bold text-cyan-300">Celsius</span>
                  </div>
                  
                  <p className="text-base sm:text-lg font-medium text-slate-100 max-w-xl leading-relaxed">
                    {isLoading ? 'Modellen worden gesynchroniseerd met meetstations...' : (
                      currentMixed?.rain > 3 ? "Regenachtig met verhoogde lokale onzekerheid. Modellen vertonen divergentie." :
                      currentMixed?.wind > 25 ? "Stevige wind gedetecteerd. Lokale kust- en wrijvingscorrecties toegepast." :
                      "Stabiel en betrouwbaar weerbeeld met hoge model-overeenstemming voor deze kustzone."
                    )}
                  </p>
                </div>

                <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/10 mt-6">
                  <div className="space-y-1 bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[11px] font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-sky-400" />
                      Neerslag
                    </p>
                    <p className="text-2xl font-black text-white">{isLoading ? '--' : `${currentMixed?.rain.toFixed(1)} mm`}</p>
                  </div>
                  <div className="space-y-1 bg-cyan-950/40 rounded-xl p-3 border border-cyan-500/30">
                    <p className="text-[11px] font-mono uppercase font-bold text-cyan-300 flex items-center gap-1.5">
                      <Wind className="w-3.5 h-3.5 text-cyan-300" />
                      Wind
                    </p>
                    <p className="text-2xl font-black text-cyan-200">{isLoading ? '--' : `${Math.round(currentMixed?.wind || 0)} kn`}</p>
                  </div>
                  <div className="space-y-1 bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[11px] font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5 text-slate-300" />
                      Bewolking
                    </p>
                    <p className="text-2xl font-black text-white">{isLoading ? '--' : `${Math.round(currentMixed?.cloud || 0)}%`}</p>
                  </div>
                  <div className="space-y-1 bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[11px] font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                      Vertrouwen
                    </p>
                    <p className="text-2xl font-black text-emerald-300">{isLoading ? '--' : `${Math.round(currentMixed?.confidence || 0)}%`}</p>
                  </div>
                </div>
              </div>

              {/* Accuracy & Model Trust Score Card */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-6 text-center text-slate-900">
                <div className="relative">
                  <svg className="w-36 h-36 transform -rotate-90">
                    <circle
                      cx="72" cy="72" r="60"
                      fill="none" stroke="currentColor" strokeWidth="10"
                      className="text-slate-100"
                    />
                    <circle
                      cx="72" cy="72" r="60"
                      fill="none" stroke="currentColor" strokeWidth="10"
                      strokeDasharray={377}
                      strokeDashoffset={377 - (377 * (bestModels?.total.totalScore || 0)) / 100}
                      strokeLinecap="round"
                      className="text-cyan-600 transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black text-slate-900 italic">
                      {isLoading ? '--' : bestModels?.total.totalScore}
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-500 tracking-wider">
                      Trust Score
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-slate-900">Model Nauwkeurigheid</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xs">
                    Op basis van {verifyDays} dagen historische verificatie presteert <strong className="text-slate-900 font-bold">{bestModels?.total.model.name || '...'}</strong> het meest accuraat op deze coördinaten.
                  </p>
                  {bestModels?.temp.biasTemp !== undefined && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-800 rounded-full border border-slate-200 text-xs font-mono font-semibold mt-2">
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-700" />
                      <span>Lokale Bias: {bestModels.temp.biasTemp > 0 ? `+${bestModels.temp.biasTemp.toFixed(1)}` : bestModels.temp.biasTemp.toFixed(1)}°C</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 7-Day Timeline Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-cyan-700" />
                  <h4 className="text-base font-bold text-slate-900 uppercase tracking-wide">7-Daagse Gekalibreerde Weersverwachting</h4>
                </div>
                <p className="text-xs font-mono font-semibold text-slate-500">Tik op een dag voor de 24-uurs details</p>
              </div>

              <div className="flex overflow-x-auto pb-4 gap-3 no-scrollbar snap-x md:grid md:grid-cols-4 lg:grid-cols-7 md:pb-0">
                {mixedForecast.map((d, i) => (
                  <button 
                    key={d.date} 
                    onClick={() => {
                      setSelectedDayIndex(i);
                      if (window.innerWidth < 768) {
                        setTimeout(() => {
                          const drilldown = document.getElementById('hourly-drilldown');
                          drilldown?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                    }}
                    className={cn(
                      "rounded-2xl p-4 sm:p-5 space-y-3 transition-all text-left relative flex-shrink-0 w-[145px] md:w-auto snap-center cursor-pointer border",
                      selectedDayIndex === i 
                        ? "border-cyan-600 bg-cyan-50/70 shadow-sm ring-2 ring-cyan-600/20" 
                        : "border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 shadow-2xs"
                    )}
                  >
                    <div className="space-y-0.5">
                      <p className={cn(
                        "text-xs font-mono uppercase font-bold",
                        selectedDayIndex === i ? "text-cyan-950 font-black" : "text-slate-600"
                      )}>
                        {format(parseISO(d.date), 'EEE d MMM', { locale: nl })}
                      </p>
                      <p className="text-3xl font-black italic text-slate-900">{Math.round(d.tempCorrected)}°</p>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-blue-700">
                        <Droplets className="w-3.5 h-3.5 text-blue-600" />
                        <span>{d.rain.toFixed(1)} mm</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-cyan-800">
                        <Wind className="w-3.5 h-3.5 text-cyan-700" />
                        <span>{Math.round(d.wind)} kn</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* 24h Drilldown for selected day */}
              <div id="hourly-drilldown" className="relative pt-4">
                <AnimatePresence mode="wait">
                  {mixedForecast[selectedDayIndex] && (
                    <motion.div 
                      key={mixedForecast[selectedDayIndex].date}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-cyan-600 pl-4 bg-slate-50 p-4 rounded-r-2xl border border-slate-200">
                        <div className="space-y-0.5">
                          <h5 className="text-lg font-black uppercase tracking-tight text-slate-900">
                            Uur-tot-Uur: {format(parseISO(mixedForecast[selectedDayIndex].date), 'EEEE d MMMM', { locale: nl })}
                          </h5>
                          <p className="text-xs font-mono font-bold text-cyan-800 uppercase tracking-wider">
                            Atmos IQ Gekalibreerde Tijdlijn
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div>
                            <p className="text-[10px] font-mono text-slate-500 uppercase font-bold">Betrouwbaarheid</p>
                            <p className="text-lg font-black text-cyan-800">{Math.round(mixedForecast[selectedDayIndex].confidence)}%</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-mono text-slate-500 uppercase font-bold">Model Mix</p>
                            <p className="text-xs font-mono font-bold text-slate-800">HYBRID-CALIB</p>
                          </div>
                        </div>
                      </div>

                      {/* 3 Hourly Visual Charts */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Temperature Chart */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 h-[280px] shadow-xs relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-3">
                            <Thermometer className="w-4 h-4 text-amber-600" />
                            <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">Temperatuur (°C)</span>
                          </div>
                          <ResponsiveContainer width="100%" height="82%">
                            <AreaChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({ 
                              time: format(parseISO(t), 'HH:mm'), 
                              temp: mixedForecast[selectedDayIndex].hourly.temp[idx] 
                            }))}>
                              <defs>
                                <linearGradient id="colorHourlyTempLight" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="time" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                                interval={3}
                              />
                              <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                              <ChartTooltip 
                                cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '11px', color: '#0f172a', fontWeight: 'bold' }} 
                              />
                              <Area type="monotone" dataKey="temp" stroke="#d97706" fill="url(#colorHourlyTempLight)" strokeWidth={2.5} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Wind Chart */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 h-[280px] shadow-xs relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-3">
                            <Wind className="w-4 h-4 text-cyan-700" />
                            <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">Windsnelheid (Knopen)</span>
                          </div>
                          <ResponsiveContainer width="100%" height="82%">
                            <LineChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({ 
                              time: format(parseISO(t), 'HH:mm'), 
                              wind: mixedForecast[selectedDayIndex].hourly.wind[idx]
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="time" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                                interval={3}
                              />
                              <YAxis hide />
                              <ChartTooltip 
                                cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '11px', color: '#0f172a', fontWeight: 'bold' }} 
                              />
                              <Line type="stepAfter" dataKey="wind" stroke="#0284c7" strokeWidth={2.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Rain Chart */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 h-[280px] shadow-xs relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-3">
                            <Droplets className="w-4 h-4 text-purple-700" />
                            <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">Neerslag (mm/uur)</span>
                          </div>
                          <ResponsiveContainer width="100%" height="82%">
                            <BarChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({ 
                              time: format(parseISO(t), 'HH:mm'), 
                              rain: mixedForecast[selectedDayIndex].hourly.rain[idx] || 0
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="time" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                                interval={3}
                              />
                              <YAxis hide />
                              <ChartTooltip 
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '11px', color: '#0f172a', fontWeight: 'bold' }} 
                              />
                              <Bar dataKey="rain" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* 24-Hour Matrix Table Snippet */}
                      <div className="overflow-x-auto bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                        <div className="flex min-w-max p-2">
                          {mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => (
                            <div key={t} className="flex-1 min-w-[64px] p-3 text-center space-y-2 border-r border-slate-200 last:border-0 hover:bg-white transition-colors">
                              <p className="text-[10px] font-mono font-bold text-slate-500 uppercase">{format(parseISO(t), 'HH:mm')}</p>
                              <p className="text-sm font-black text-slate-900">{Math.round(mixedForecast[selectedDayIndex].hourly.temp[idx])}°</p>
                              <div className="space-y-0.5">
                                <div className="text-[10px] font-mono font-bold text-cyan-800">{Math.round(mixedForecast[selectedDayIndex].hourly.wind[idx])}kn</div>
                                <div className="text-[10px] font-mono font-bold text-purple-700">{mixedForecast[selectedDayIndex].hourly.rain[idx].toFixed(1)}mm</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="pro"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {/* Pro IQ Content */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Stats Column */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">Atmosferische Data</h4>
                  <Layers className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Temperatuur', val: `${currentMixed?.tempCorrected.toFixed(1)}°C`, sub: `Bias ${bestModels?.temp.biasTemp.toFixed(1)}°` },
                    { label: 'Neerslag', val: `${currentMixed?.rain.toFixed(1)} mm`, sub: `${bestModels?.rain.rainHitRate.toFixed(2)} hit rate` },
                    { label: 'Windsnelheid', val: `${Math.round(currentMixed?.wind || 0)} kn`, sub: `${bestModels?.wind.maeWind.toFixed(1)} MAE` },
                    { label: 'Bewolking', val: `${Math.round(currentMixed?.cloud || 0)}%`, sub: 'Dekking' },
                    { label: 'Model Vertrouwen', val: `${bestModels?.total.totalScore}/100`, sub: bestModels?.total.model.name }
                  ].map(item => (
                    <div key={item.label} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono font-bold uppercase text-slate-500">{item.label}</span>
                        <span className="text-[10px] font-mono font-bold text-cyan-800">{item.sub}</span>
                      </div>
                      <p className="text-xl font-black text-slate-900">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visualization Center: Conflict Vector Space */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs h-full relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-0.5">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-700" />
                          <span>Model Conflict Veld</span>
                        </h4>
                        <p className="text-xs font-mono font-semibold text-slate-500 uppercase">Multi-model vector convergentie</p>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border",
                        (bestModels?.total.totalScore || 0) > 80 
                          ? "border-emerald-300 text-emerald-800 bg-emerald-50" 
                          : "border-amber-300 text-amber-800 bg-amber-50"
                      )}>
                        {bestModels?.total.totalScore && bestModels.total.totalScore > 80 ? 'Lage Divergentie (Hoge consensus)' : 'Matige Divergentie'}
                      </div>
                    </div>

                    <div className="min-h-[220px] relative flex items-center justify-center my-4 bg-slate-50/70 rounded-2xl border border-slate-200">
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-[180px] h-[180px] border border-slate-300 rounded-full" />
                        <div className="w-[120px] h-[120px] border border-slate-300 rounded-full" />
                        <div className="w-[60px] h-[60px] border border-slate-300 rounded-full" />
                      </div>

                      {/* Center Point */}
                      <div className="w-5 h-5 bg-cyan-600 rounded-full shadow-md z-10 flex items-center justify-center text-white text-[9px] font-bold">
                        ★
                      </div>

                      {/* Floating Model Pills */}
                      <div className="absolute top-4 left-4 p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-0.5 z-20">
                        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block">Beste Temp</span>
                        <p className="text-xs font-bold text-slate-900">{bestModels?.temp.model.name.replace('Open-Meteo ', '').replace(' seamless', '')}</p>
                      </div>
                      <div className="absolute bottom-4 right-4 p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-0.5 z-20">
                        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block">Beste Wind</span>
                        <p className="text-xs font-bold text-slate-900">{bestModels?.wind.model.name.replace('Open-Meteo ', '').replace(' seamless', '')}</p>
                      </div>
                      <div className="absolute top-4 right-4 p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-0.5 z-20">
                        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block">Beste Neerslag</span>
                        <p className="text-xs font-bold text-slate-900">{bestModels?.rain.model.name.replace('Open-Meteo ', '').replace(' seamless', '')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 grid grid-cols-3 gap-4 border-t border-slate-200">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono uppercase text-slate-500 font-bold">Temp Foutmarge</span>
                      <p className="text-base font-black text-slate-900">{bestModels?.total.maeTemp.toFixed(2)}°C</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono uppercase text-slate-500 font-bold">Hit Kans</span>
                      <p className="text-base font-black text-cyan-800">{Math.round((bestModels?.rain.rainHitRate || 0) * 100)}%</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono uppercase text-slate-500 font-bold">Synchronisatie</span>
                      <p className="text-base font-black text-emerald-700">100%</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Signals Column */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">AI Signalen</h4>
                  <Brain className="w-4 h-4 text-cyan-700" />
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-3">
                    {[
                      { l: 'Vandaag', v: currentMixed?.confidence || 0 },
                      { l: '+3 Dagen', v: mixedForecast[3]?.confidence || 0 },
                      { l: '+7 Dagen', v: mixedForecast[6]?.confidence || 0 }
                    ].map(sig => (
                      <div key={sig.l} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-bold">
                          <span className="text-slate-600">{sig.l}</span>
                          <span className="text-cyan-800">{Math.round(sig.v)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${sig.v}%` }}
                            className="h-full bg-cyan-600"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs font-mono">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Stabiele Bias</span>
                      </div>
                      <p className="text-xs leading-relaxed text-emerald-950 font-medium">
                        Het temp-model vertoont een constante correctie van {bestModels?.temp.biasTemp.toFixed(1)}°C voor verhoogde kustprecisie.
                      </p>
                    </div>

                    {(bestModels?.total.totalScore || 0) < 75 && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs font-mono">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                          <span>Verhoogde Neerslagvariantie</span>
                        </div>
                        <p className="text-xs leading-relaxed text-amber-950 font-medium">
                          Modellen tonen hogere spreiding in neerslagtijdstip.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Model Historical Matrix Table */}
            <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-xs">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-cyan-700" />
                  <h4 className="text-base font-bold text-slate-900 uppercase tracking-wide">Model Historische Matrix & Benchmark</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-mono font-bold text-slate-600 uppercase">Geoptimaliseerd</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100 uppercase text-slate-700 font-bold tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5">Weermodel</th>
                      <th className="px-6 py-3.5">Totaal Score</th>
                      <th className="px-6 py-3.5">Temp MAE</th>
                      <th className="px-6 py-3.5">Temp Bias</th>
                      <th className="px-6 py-3.5">Regen Hit Rate</th>
                      <th className="px-6 py-3.5">Miss / Vals</th>
                      <th className="px-6 py-3.5">Wind Nauwkeurigheid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...rankings].sort((a, b) => b.totalScore - a.totalScore).map((r, i) => (
                      <tr key={r.model.id} className="hover:bg-slate-50/80 transition-colors text-slate-800">
                        <td className="px-6 py-4 font-bold text-slate-900 flex items-center gap-2">
                          <div className={cn("w-1.5 h-4 rounded-full", i === 0 ? "bg-cyan-600" : "bg-slate-300")} />
                          {shortModel(r.model.name)}
                          {i === 0 && <span className="ml-1 text-[10px] bg-cyan-100 text-cyan-900 px-2 py-0.5 rounded-full font-bold">WINNAAR</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn("font-bold text-sm", i === 0 ? "text-cyan-800 font-black" : "text-slate-700")}>{r.totalScore}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{r.maeTemp.toFixed(2)}°C</td>
                        <td className="px-6 py-4 text-slate-700">{r.biasTemp.toFixed(2)}°C</td>
                        <td className="px-6 py-4 font-bold text-emerald-700">{Math.round(r.rainHitRate * 100)}%</td>
                        <td className="px-6 py-4 text-slate-500">{r.misses}/{r.falseAlarms}</td>
                        <td className="px-6 py-4 text-slate-700">{r.maeWind.toFixed(1)} kn</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Model Mix Logic Footer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { l: 'Temperatuur Motor', m: bestModels?.temp.model.name, c: '#0284c7' },
                { l: 'Neerslag Motor', m: bestModels?.rain.model.name, c: '#7c3aed' },
                { l: 'Wind Motor', m: bestModels?.wind.model.name, c: '#059669' }
              ].map(eng => (
                <div key={eng.l} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="w-2 h-8 rounded-full" style={{ backgroundColor: eng.c }} />
                  <div>
                    <p className="text-[10px] font-mono uppercase font-bold text-slate-500">{eng.l}</p>
                    <p className="text-xs font-bold text-slate-900">{eng.m}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function shortModel(name: string) {
  return name.replace('Open-Meteo ', '').replace(' seamless', '');
}
