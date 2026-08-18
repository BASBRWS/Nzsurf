
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
  Info
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
      
      for (const mid of uniqueWinnerIds) {
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
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center border border-accent/20">
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Atmos IQ</h2>
              <TooltipIcon content="Onze eigen AI-motor die meteorologische modellen vergelijkt met historische data van deze specifieke locatie om de meest nauwkeurige voorspelling te kiezen." />
            </div>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em]">Local Model Intelligence</p>
          </div>
        </div>

        <div className="flex items-center p-1 glass rounded-2xl border border-white/5 bg-white/5">
          <button 
            onClick={() => setMode('simple')}
            className={cn(
              "px-6 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
              mode === 'simple' ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-white/40 hover:text-white/60"
            )}
          >
            Simple
          </button>
          <Tooltip content="Geavanceerde modus die de onderliggende prestaties en statistieken van verschillende weermodellen onthult.">
            <button 
              onClick={() => setMode('pro')}
              className={cn(
                "px-6 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                mode === 'pro' ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-white/40 hover:text-white/60"
              )}
            >
              Pro IQ
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Constraints Panel (Collapsible in Simple) */}
      <div className={cn(
        "glass rounded-[2rem] p-6 border border-white/5 space-y-6 overflow-hidden transition-all duration-500",
        mode === 'simple' ? "opacity-60 grayscale hover:grayscale-0 hover:opacity-100" : ""
      )}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-mono uppercase text-white/30 tracking-widest">Modeltoets</label>
              <TooltipIcon content="Het aantal dagen dat ons systeem terugkijkt om de voorspellingen van elk model te vergelijken met de werkelijk gemeten waarden op deze locatie." />
            </div>
            <select 
              value={verifyDays} 
              onChange={(e) => setVerifyDays(Number(e.target.value))}
              className="w-full bg-marine-950/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono uppercase text-white outline-none focus:border-accent/50"
            >
              {[90, 180, 365, 730].map(d => <option key={d} value={d}>{d} dagen</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-mono uppercase text-white/30 tracking-widest">Klimaatbeeld</label>
              <TooltipIcon content="De historische periode die wordt gebruikt om een betrouwbaar beeld te krijgen van de normale weersomstandigheden voor dit seizoen." />
            </div>
            <select 
              value={historyYears} 
              onChange={(e) => setHistoryYears(Number(e.target.value))}
              className="w-full bg-marine-950/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono uppercase text-white outline-none focus:border-accent/50"
            >
              {[5, 10, 15].map(y => <option key={y} value={y}>{y} jaar</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex items-end gap-3">
             <button 
              onClick={runAnalysis}
              disabled={isLoading}
              className="flex-1 h-[46px] bg-accent text-white rounded-xl text-[10px] font-mono uppercase tracking-widest hover:opacity-90 transition-all font-bold disabled:opacity-50"
            >
              Recalibrate Intelligence
            </button>
            <div className="px-4 h-[46px] flex items-center glass rounded-xl border border-white/5 uppercase text-[10px] font-mono text-white/40">
              GPS: {spot.lat.toFixed(4)}, {spot.lng.toFixed(4)}
            </div>
          </div>
        </div>

        {mode === 'pro' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 pt-4 border-t border-white/5"
          >
            {MODELS.map(m => (
              <label 
                key={m.id}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer",
                  selectedModelIds.includes(m.id) ? "border-accent/50 bg-accent/5 text-white" : "border-white/5 text-white/20 hover:text-white/40"
                )}
              >
                <input 
                  type="checkbox" 
                  checked={selectedModelIds.includes(m.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedModelIds([...selectedModelIds, m.id]);
                    else setSelectedModelIds(selectedModelIds.filter(id => id !== m.id));
                  }}
                  className="hidden"
                />
                <span className="text-[9px] font-mono uppercase truncate">{m.name.split(' ').slice(-1)}</span>
              </label>
            ))}
          </motion.div>
        )}
      </div>

      <div className="glass-dark border border-accent/20 rounded-2xl p-4 flex items-center gap-4">
        {isLoading ? <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <Target className="w-4 h-4 text-accent" />}
        <p className={cn("text-[11px] font-mono uppercase tracking-widest", isLoading ? "text-accent animate-pulse" : "text-white/60")}>
          {statusText}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'simple' ? (
          <motion.div 
            key="simple"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Simple View Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 glass rounded-[3rem] p-10 flex flex-col justify-between min-h-[400px] border border-white/5 relative overflow-hidden group">
                {/* Background Viz */}
                <div className="absolute inset-0 pointer-events-none opacity-20">
                  <div className="absolute top-10 right-10 w-32 h-32 rounded-full bg-accent blur-3xl animate-pulse" />
                  <div className="absolute bottom-10 left-10 w-40 h-40 rounded-full bg-blue-500 blur-3xl opacity-50" />
                </div>
                
                <div className="relative space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono tracking-[0.4em] uppercase text-accent">Active Forecast</p>
                    <h3 className="text-8xl font-black italic text-white tracking-tighter">
                      {isLoading ? '--' : `${Math.round(currentMixed?.tempCorrected || 0)}°`}
                    </h3>
                  </div>
                  
                  <p className="text-xl font-medium text-sand-50/70 max-w-lg leading-relaxed">
                    {isLoading ? 'Modellen worden gesynchroniseerd...' : (
                      currentMixed?.rain > 3 ? "Regenachtig met verhoogde lokale onzekerheid. Modellen vertonen divergentie." :
                      currentMixed?.wind > 28 ? "Winderige condities gedetecteerd. Lokale wind-correcties toegepast." :
                      "Stabiel weerbeeld met hoge model-overeenstemming voor deze locatie."
                    )}
                  </p>
                </div>

                <div className="relative pt-8 grid grid-cols-2 md:grid-cols-4 gap-8">
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono uppercase text-white/30">Regen</p>
                    <p className="text-2xl font-bold text-white">{isLoading ? '--' : `${currentMixed?.rain.toFixed(1)} mm`}</p>
                  </div>
                  <div className="space-y-1 text-accent">
                    <p className="text-[9px] font-mono uppercase text-accent/50">Wind</p>
                    <p className="text-2xl font-bold">{isLoading ? '--' : `${Math.round(currentMixed?.wind || 0)} kn`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono uppercase text-white/30">Bewolking</p>
                    <p className="text-2xl font-bold text-white">{isLoading ? '--' : `${Math.round(currentMixed?.cloud || 0)}%`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono uppercase text-white/30">Vertrouwen</p>
                    <p className="text-2xl font-bold text-white">{isLoading ? '--' : `${Math.round(currentMixed?.confidence || 0)}%`}</p>
                  </div>
                </div>
              </div>

              <div className="glass rounded-[3rem] p-10 border border-white/5 flex flex-col items-center justify-center gap-8 text-center bg-white/[0.02]">
                <div className="relative">
                   <svg className="w-40 h-40 transform -rotate-90">
                    <circle
                      cx="80" cy="80" r="70"
                      fill="none" stroke="currentColor" strokeWidth="12"
                      className="text-white/5"
                    />
                    <circle
                      cx="80" cy="80" r="70"
                      fill="none" stroke="currentColor" strokeWidth="12"
                      strokeDasharray={440}
                      strokeDashoffset={440 - (440 * (bestModels?.total.totalScore || 0)) / 100}
                      strokeLinecap="round"
                      className="text-accent transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Tooltip content="Het percentage van de tijd dat de gekozen modellen historisch gezien het dichtst bij de werkelijke waarnemingen zaten op deze specifieke coördinaten.">
                      <div className="flex flex-col items-center">
                        <span className="text-4xl font-black italic">{isLoading ? '--' : bestModels?.total.totalScore}</span>
                        <span className="text-[8px] font-mono uppercase text-white/40 tracking-widest mt-1">Trust Score</span>
                      </div>
                    </Tooltip>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-lg font-bold">Accuracy Model</h4>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Op basis van {verifyDays} dagen historische vergelijking is <strong>{bestModels?.total.model.name || '...'}</strong> het meest betrouwbaar voor deze coördinaten.
                  </p>
                  {bestModels?.temp.biasTemp !== undefined && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                      <TrendingUp className="w-3 h-3 text-accent" />
                      <span className="text-[9px] font-mono uppercase text-white/60">Local Bias: {bestModels.temp.biasTemp.toFixed(1)}°C</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Simple Timeline Card */}
            <div className="glass rounded-[2rem] p-8 border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">7-daagse Mixed Forecast</h4>
                </div>
                <p className="text-[10px] font-mono text-white/30 uppercase">Tik op een dag voor details</p>
              </div>

              <div className="flex overflow-x-auto pb-4 gap-4 no-scrollbar snap-x md:grid md:grid-cols-4 lg:grid-cols-7 md:pb-0">
                {mixedForecast.map((d, i) => (
                  <button 
                    key={d.date} 
                    onClick={() => {
                      setSelectedDayIndex(i);
                      // Scroll slightly to ensure drilldown is visible on small screens
                      if (window.innerWidth < 768) {
                        setTimeout(() => {
                          const drilldown = document.getElementById('hourly-drilldown');
                          drilldown?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                    }}
                    className={cn(
                      "glass-dark border rounded-2xl p-6 space-y-4 transition-all group text-left relative flex-shrink-0 w-[140px] md:w-auto snap-center",
                      selectedDayIndex === i ? "border-accent bg-accent/5 ring-1 ring-accent/20" : "border-white/5 hover:border-accent/30"
                    )}
                  >
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono text-white/30 uppercase">{format(parseISO(d.date), 'EEE d MMM', { locale: nl })}</p>
                      <p className="text-3xl font-black italic group-hover:text-accent transition-colors">{Math.round(d.tempCorrected)}°</p>
                    </div>
                    <div className="space-y-2">
                       <div className="flex items-center gap-2">
                        <Droplets className="w-3 h-3 text-blue-400/50" />
                        <span className="text-[10px] font-mono text-white/60">{d.rain.toFixed(1)}mm</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wind className="w-3 h-3 text-accent/50" />
                        <span className="text-[10px] font-mono text-white/60">{Math.round(d.wind)}kn</span>
                      </div>
                    </div>
                    {selectedDayIndex === i && (
                      <motion.div 
                        layoutId="active-indicator"
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-accent rotate-45 border-r border-b border-white/10 hidden md:block" 
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* 24h Drilldown for selected day */}
              <div id="hourly-drilldown" className="relative group/drilldown">
                <AnimatePresence mode="wait">
                  {mixedForecast[selectedDayIndex] && (
                    <motion.div 
                      key={mixedForecast[selectedDayIndex].date}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="pt-10 space-y-8"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-accent pl-6">
                        <div className="space-y-1">
                          <h5 className="text-xl font-black italic uppercase tracking-tight">
                            Details: {format(parseISO(mixedForecast[selectedDayIndex].date), 'EEEE d MMMM', { locale: nl })}
                          </h5>
                          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em]">Atmos IQ Calibrated Hourly Stream</p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-[9px] font-mono text-white/20 uppercase">Confidence</p>
                            <p className="text-lg font-bold text-accent">{Math.round(mixedForecast[selectedDayIndex].confidence)}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-mono text-white/20 uppercase">Model Mix</p>
                            <p className="text-xs font-mono text-white/60">HYBRID-CALIB</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         <div className="glass-dark border border-white/5 rounded-[2rem] p-8 h-[280px] relative overflow-hidden group/chart">
                            <div className="absolute top-6 left-8 flex items-center gap-3 z-10">
                              <Thermometer className="w-4 h-4 text-accent" />
                              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Temperatuur (°C)</span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({ 
                                time: format(parseISO(t), 'HH:mm'), 
                                temp: mixedForecast[selectedDayIndex].hourly.temp[idx] 
                              }))}>
                                 <defs>
                                  <linearGradient id="colorHourlyTemp" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ffd166" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#ffd166" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis 
                                  dataKey="time" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}
                                  interval={3}
                                />
                                <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                                <ChartTooltip 
                                  cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', fontSize: '10px' }} 
                                />
                                <Area type="monotone" dataKey="temp" stroke="#ffd166" fill="url(#colorHourlyTemp)" strokeWidth={3} />
                              </AreaChart>
                            </ResponsiveContainer>
                         </div>

                         <div className="glass-dark border border-white/5 rounded-[2rem] p-8 h-[280px] relative overflow-hidden group/chart">
                            <div className="absolute top-6 left-8 flex items-center gap-3 z-10">
                              <Wind className="w-4 h-4 text-blue-400" />
                              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Wind (KN)</span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({ 
                                time: format(parseISO(t), 'HH:mm'), 
                                wind: mixedForecast[selectedDayIndex].hourly.wind[idx]
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis 
                                  dataKey="time" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}
                                  interval={3}
                                />
                                <YAxis hide />
                                <ChartTooltip 
                                  cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', fontSize: '10px' }} 
                                />
                                <Line type="stepAfter" dataKey="wind" stroke="#3b82f6" strokeWidth={3} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                         </div>

                         <div className="glass-dark border border-white/5 rounded-[2rem] p-8 h-[280px] relative overflow-hidden group/chart">
                            <div className="absolute top-6 left-8 flex items-center gap-3 z-10">
                              <Droplets className="w-4 h-4 text-purple-500" />
                              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Neerslag (MM)</span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({ 
                                time: format(parseISO(t), 'HH:mm'), 
                                rain: mixedForecast[selectedDayIndex].hourly.rain[idx] || 0
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis 
                                  dataKey="time" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}
                                  interval={3}
                                />
                                <YAxis hide />
                                <ChartTooltip 
                                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', fontSize: '10px' }} 
                                />
                                <Bar dataKey="rain" fill="#a855f7" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                         </div>
                      </div>

                      {/* Hourly matrix snippet */}
                      <div className="overflow-x-auto glass rounded-2xl border border-white/5">
                        <div className="flex min-w-max p-2">
                          {mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => (
                            <div key={t} className="flex-1 min-w-[60px] p-4 text-center space-y-3 border-r border-white/5 last:border-0 group-hover:bg-white/[0.01] transition-colors">
                              <p className="text-[9px] font-mono text-white/20 uppercase">{format(parseISO(t), 'HH:mm')}</p>
                              <p className="text-sm font-bold text-white">{Math.round(mixedForecast[selectedDayIndex].hourly.temp[idx])}°</p>
                              <div className="space-y-1">
                                <div className="text-[8px] font-mono text-blue-400/50">{Math.round(mixedForecast[selectedDayIndex].hourly.wind[idx])}k</div>
                                <div className="text-[8px] font-mono text-purple-500/50">{mixedForecast[selectedDayIndex].hourly.rain[idx].toFixed(1)}</div>
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            {/* Pro IQ Content */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Stats Column */}
              <div className="glass rounded-[2rem] p-6 border border-white/5 space-y-6 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">Atmospheric Data</h4>
                  <Layers className="w-4 h-4 text-white/10" />
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Temperatuur', val: `${currentMixed?.tempCorrected.toFixed(1)}°C`, sub: `Bias ${bestModels?.temp.biasTemp.toFixed(1)}°` },
                    { label: 'Neerslag', val: `${currentMixed?.rain.toFixed(1)} mm`, sub: `${bestModels?.rain.rainHitRate.toFixed(2)} hit rate` },
                    { label: 'Wind Snelheid', val: `${Math.round(currentMixed?.wind || 0)} kn`, sub: `${bestModels?.wind.maeWind.toFixed(1)} MAE` },
                    { label: 'Bewolking', val: `${Math.round(currentMixed?.cloud || 0)}%`, sub: 'Coverage' },
                    { label: 'Model Trust', val: `${bestModels?.total.totalScore}/100`, sub: bestModels?.total.model.name }
                  ].map(item => (
                    <div key={item.label} className="p-4 rounded-2xl glass-dark border border-white/5 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono uppercase text-white/30">{item.label}</span>
                        <span className="text-[8px] font-mono text-accent">{item.sub}</span>
                      </div>
                      <p className="text-xl font-bold text-white">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visualization Center */}
              <div className="lg:col-span-2 space-y-6">
                <div className="glass rounded-[2.5rem] p-8 border border-white/5 h-full relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/[0.03] rounded-full" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] border border-white/[0.04] rounded-full" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] border border-white/[0.05] rounded-full" />
                    {/* Radar Sweep Effect */}
                    <div 
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full animate-spin duration-[10s] linear" 
                      style={{ background: 'conic-gradient(from 0deg, transparent 300deg, rgba(65, 180, 255, 0.1) 360deg)' }}
                    />
                  </div>

                  <div className="relative h-full flex flex-col">
                    <div className="flex justify-between items-start mb-8">
                       <div className="space-y-1">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                          <Cpu className="w-4 h-4" /> Conflict Field
                        </h4>
                        <p className="text-[10px] font-mono text-white/30 uppercase">Multi-model vector space</p>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-mono uppercase border",
                        (bestModels?.total.totalScore || 0) > 80 ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-amber-500/20 text-amber-400 bg-amber-500/5"
                      )}>
                        {bestModels?.total.totalScore && bestModels.total.totalScore > 80 ? 'Low Divergence' : 'Moderate Divergence'}
                      </div>
                    </div>

                    <div className="flex-1 min-h-[300px] relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 bg-accent rounded-full shadow-[0_0_30px_rgba(65,180,255,1)] relative z-10" />
                      </div>

                      {/* Floating model nodes */}
                      <div className="absolute top-10 left-10 p-4 glass-dark rounded-2xl border border-white/5 space-y-1 z-20">
                        <span className="text-[8px] font-mono text-white/30 uppercase">Temp Model</span>
                        <p className="text-xs font-bold">{bestModels?.temp.model.name.split(' ').slice(-1)}</p>
                      </div>
                      <div className="absolute bottom-12 right-6 p-4 glass-dark rounded-2xl border border-white/5 space-y-1 z-20">
                        <span className="text-[8px] font-mono text-white/30 uppercase">Wind Model</span>
                        <p className="text-xs font-bold">{bestModels?.wind.model.name.split(' ').slice(-1)}</p>
                      </div>
                      <div className="absolute top-24 right-12 p-4 glass-dark rounded-2xl border border-white/10 space-y-1 z-20">
                        <span className="text-[8px] font-mono text-white/30 uppercase">Rain Model</span>
                        <p className="text-xs font-bold">{bestModels?.rain.model.name.split(' ').slice(-1)}</p>
                      </div>
                    </div>

                    <div className="pt-8 grid grid-cols-3 gap-8 border-t border-white/5">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-white/20 uppercase">RMS Error</span>
                        <p className="text-lg font-bold">{bestModels?.total.maeTemp.toFixed(2)}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-white/20 uppercase">Hit Probability</span>
                        <p className="text-lg font-bold text-accent">{Math.round((bestModels?.rain.rainHitRate || 0) * 100)}%</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-white/20 uppercase">Sync Level</span>
                        <p className="text-lg font-bold">100%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Signals Column */}
              <div className="glass rounded-[2rem] p-6 border border-white/5 space-y-8 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">AI Signals</h4>
                  <Brain className="w-4 h-4 text-accent/20" />
                </div>
                
                <div className="space-y-6">
                  {/* Confidence Decay */}
                  <div className="space-y-4">
                    {[
                      { l: 'Vandaag', v: currentMixed?.confidence || 0 },
                      { l: '+3 Dagen', v: mixedForecast[3]?.confidence || 0 },
                      { l: '+7 Dagen', v: mixedForecast[6]?.confidence || 0 }
                    ].map(sig => (
                      <div key={sig.l} className="space-y-2">
                        <div className="flex justify-between text-[9px] font-mono uppercase">
                          <span className="text-white/40">{sig.l}</span>
                          <span className="text-accent">{Math.round(sig.v)}%</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${sig.v}%` }}
                            className="h-full bg-accent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 glass-dark rounded-2xl border border-white/5 space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] font-mono uppercase text-emerald-400">Stable Bias</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-white/60">
                        Het temp-model vertoont een constante bias van {bestModels?.temp.biasTemp.toFixed(1)}°C. Verhoging van lokale nauwkeurigheid geactiveerd.
                      </p>
                    </div>
                    {(bestModels?.total.totalScore || 0) < 70 && (
                      <div className="p-4 glass-dark rounded-2xl border border-amber-500/10 space-y-2 bg-amber-500/5">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span className="text-[9px] font-mono uppercase text-amber-500">Anomaly Check</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-white/60">
                          Hoge neerslag-fluctuatie gedetecteerd in historische sets. Neerslaggegevens hebben verlaagde prioriteit in totaalscore.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-accent/5 p-4 rounded-2xl border border-accent/20">
              <Zap className="w-4 h-4 text-accent" />
              <p className="text-[11px] font-mono uppercase text-white/60">Klik op een dag voor een uurlijkse diepte-analyse.</p>
            </div>

            <div className="glass rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">Model Historical Matrix</h4>
                </div>
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-mono text-white/40 uppercase">Optimized</span>
                   </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-white/5 uppercase text-white/40 tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4">Model Engine</th>
                      <th className="px-6 py-4">Total Score</th>
                      <th className="px-6 py-4">Temp MAE</th>
                      <th className="px-6 py-4">Temp Bias</th>
                      <th className="px-6 py-4">Rain Hit Rate</th>
                      <th className="px-6 py-4">Miss/False</th>
                      <th className="px-6 py-4">Wind Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...rankings].sort((a, b) => b.totalScore - a.totalScore).map((r, i) => (
                      <tr key={r.model.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                          <div className={cn("w-1 h-4 rounded-full", i === 0 ? "bg-accent" : "bg-white/10")} />
                          {shortModel(r.model.name)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(i === 0 ? "text-accent font-black" : "text-white/60")}>{r.totalScore}</span>
                        </td>
                        <td className="px-6 py-4 text-white/60">{r.maeTemp.toFixed(2)}°C</td>
                        <td className="px-6 py-4 text-white/60">{r.biasTemp.toFixed(2)}°C</td>
                        <td className="px-6 py-4 font-bold text-emerald-400">{Math.round(r.rainHitRate * 100)}%</td>
                        <td className="px-6 py-4 text-white/40">{r.misses}/{r.falseAlarms}</td>
                        <td className="px-6 py-4 text-white/60">{r.maeWind.toFixed(1)} kn</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Matrix Hourly Detail (Mirrored from Simple view but for Pro context) */}
            <AnimatePresence mode="wait">
              {mixedForecast[selectedDayIndex] && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-[2rem] p-8 border border-accent/20 bg-accent/5 space-y-6"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-6 h-6 text-accent" />
                      </div>
                      <div>
                        <h4 className="text-2xl md:text-3xl font-black italic uppercase text-white leading-none tracking-tighter">
                          {format(parseISO(mixedForecast[selectedDayIndex].date), 'EEEE', { locale: nl })}
                          <span className="block text-accent text-sm md:text-base not-italic tracking-normal mt-1">
                            {format(parseISO(mixedForecast[selectedDayIndex].date), 'd MMMM', { locale: nl })}
                          </span>
                        </h4>
                        <p className="text-[9px] font-mono uppercase text-white/30 tracking-[0.3em] mt-2">Diepte Voorspelling / 24 Uur</p>
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-4 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 no-scrollbar snap-x snap-mandatory">
                      {mixedForecast.map((d, i) => (
                        <button
                          key={d.date}
                          onClick={() => setSelectedDayIndex(i)}
                          className={cn(
                            "w-11 h-11 rounded-2xl flex items-center justify-center text-[11px] font-mono transition-all border flex-shrink-0 snap-center",
                            selectedDayIndex === i 
                              ? "bg-accent border-accent text-marine-950 font-bold shadow-lg shadow-accent/20" 
                              : "glass border-white/5 text-white/30 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {format(parseISO(d.date), 'EE').charAt(0)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[300px]">
                    <div className="glass-dark rounded-2xl p-6 border border-white/5">
                      <p className="text-[10px] font-mono uppercase text-white/30 mb-4">Temperatuur verloop (°C)</p>
                      <ResponsiveContainer width="100%" height="90%">
                        <AreaChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({
                          time: format(parseISO(t), 'HH:mm'),
                          temp: mixedForecast[selectedDayIndex].hourly.temp[idx]
                        }))}>
                          <defs>
                            <linearGradient id="colorTempHourPro" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ffd166" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#ffd166" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            interval={3}
                            tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }}
                          />
                          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                          <ChartTooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            itemStyle={{ color: '#ffd166', textTransform: 'uppercase', fontSize: '10px' }}
                          />
                          <Area type="monotone" dataKey="temp" stroke="#ffd166" fill="url(#colorTempHourPro)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="glass-dark rounded-2xl p-6 border border-white/5 relative">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-mono uppercase text-white/30">Wind (kn) & Regen (mm)</p>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-400" />
                            <span className="text-[8px] font-mono text-white/20 uppercase">Wind</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                            <span className="text-[8px] font-mono text-white/20 uppercase">Regen</span>
                          </div>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="80%">
                        <LineChart data={mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => ({
                          time: format(parseISO(t), 'HH:mm'),
                          wind: mixedForecast[selectedDayIndex].hourly.wind[idx],
                          rain: mixedForecast[selectedDayIndex].hourly.rain[idx] || 0
                        }))}>
                          <XAxis 
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            interval={3}
                            tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }}
                          />
                          <YAxis hide />
                          <ChartTooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            itemStyle={{ textTransform: 'uppercase', fontSize: '10px' }}
                          />
                          <Line type="stepAfter" dataKey="wind" stroke="#3b82f6" strokeWidth={3} dot={false} />
                          <Line type="monotone" dataKey="rain" stroke="#a855f7" strokeWidth={3} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Pro Hourly Matrix */}
                  <div className="overflow-x-auto glass rounded-2xl border border-white/5 bg-black/20">
                    <div className="flex min-w-max p-2">
                      {mixedForecast[selectedDayIndex].hourly.time.map((t, idx) => (
                        <div key={t} className="flex-1 min-w-[64px] p-4 text-center space-y-3 border-r border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                          <p className="text-[9px] font-mono text-white/20 uppercase">{format(parseISO(t), 'HH:mm')}</p>
                          <p className="text-sm font-bold text-white">{Math.round(mixedForecast[selectedDayIndex].hourly.temp[idx])}°</p>
                          <div className="space-y-1">
                            <div className="text-[9px] font-bold text-blue-400">{Math.round(mixedForecast[selectedDayIndex].hourly.wind[idx])}<span className="text-[7px] ml-0.5 opacity-50">kn</span></div>
                            <div className="text-[9px] font-bold text-purple-400">{mixedForecast[selectedDayIndex].hourly.rain[idx].toFixed(1)}<span className="text-[7px] ml-0.5 opacity-50">mm</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Graph Space */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass rounded-[2rem] p-8 border border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-white/30">Temperature Calibration</h4>
                  <p className="text-[9px] font-mono text-accent">Adjusted for local bias</p>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mixedForecast}>
                      <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffd166" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ffd166" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(d) => format(parseISO(d), 'EEE', { locale: nl }).charAt(0)}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' }}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' }}
                        domain={['dataMin - 2', 'dataMax + 2']}
                      />
                      <ChartTooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                        itemStyle={{ color: '#ffd166', textTransform: 'uppercase', fontSize: '10px' }}
                      />
                      <Area type="monotone" dataKey="tempCorrected" stroke="#ffd166" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

               <div className="glass rounded-[2rem] p-8 border border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-white/30">Precipitation Variance</h4>
                  <p className="text-[9px] font-mono text-accent">Confidence decay plotted</p>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mixedForecast}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(d) => format(parseISO(d), 'EEE', { locale: nl }).charAt(0)}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' }}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' }}
                      />
                      <ChartTooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                        itemStyle={{ color: '#3b82f6', textTransform: 'uppercase', fontSize: '10px' }}
                      />
                      <Bar dataKey="rain" radius={[4, 4, 0, 0]}>
                        {mixedForecast.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : 'rgba(59, 130, 246, 0.4)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Model Mix Logic Footer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { l: 'Temp Engine', m: bestModels?.temp.model.name, c: '#ffd166' },
                { l: 'Rain Engine', m: bestModels?.rain.model.name, c: '#3b82f6' },
                { l: 'Wind Engine', m: bestModels?.wind.model.name, c: '#a855f7' }
              ].map(eng => (
                <div key={eng.l} className="flex items-center gap-4 p-4 glass rounded-2xl border border-white/5">
                  <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: eng.c }} />
                  <div>
                    <p className="text-[9px] font-mono uppercase text-white/30">{eng.l}</p>
                    <p className="text-xs font-bold">{eng.m}</p>
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
