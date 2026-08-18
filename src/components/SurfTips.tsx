import React from 'react';
import { BookOpen, Wind, Waves, Zap } from 'lucide-react';
import { motion } from 'motion/react';

const WaveSetIllustration = () => (
  <div className="w-full h-32 bg-white/5 rounded-2xl mb-6 overflow-hidden relative border border-white/5 flex items-center justify-center">
    <svg viewBox="0 0 400 120" className="w-full h-full">
      {/* Wave Group (The Set) */}
      <path 
        d="M 10 100 Q 30 100 40 80 T 70 80 T 100 100 L 130 100 Q 150 100 160 70 T 190 70 T 220 100 L 250 100 Q 270 100 280 80 T 310 80 T 340 100" 
        stroke="var(--color-accent)" 
        strokeWidth="3" 
        strokeLinecap="round"
        fill="none" 
      />
      {/* The Lull */}
      <path d="M 340 100 L 400 100" stroke="white" strokeOpacity="0.1" strokeWidth="2" strokeDasharray="4 4" />
      
      {/* Surfer waiting */}
      <g transform="translate(140, 95)">
        <path d="M -15 2 L 15 2" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        <circle cx="8" cy="-12" r="4" fill="white" opacity="0.4" />
      </g>
      
      <text x="210" y="30" textAnchor="middle" className="fill-white/20 font-mono text-[9px] uppercase tracking-[0.4em]">Set Rhythm (3 Waves)</text>
    </svg>
  </div>
);

const DuckDiveMistakeIllustration = () => (
  <div className="w-full h-40 bg-white/5 rounded-2xl mb-6 overflow-hidden relative border border-white/5 flex items-center justify-evenly">
    <div className="flex flex-col items-center">
      <svg width="120" height="100" viewBox="0 0 120 100">
        <path d="M 10 70 L 110 40" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.2" />
        <path d="M 60 45 L 80 15" stroke="#f87171" strokeWidth="4" strokeLinecap="round" />
        <circle cx="85" cy="10" r="6" fill="#f87171" opacity="0.4" />
        <path d="M 90 20 L 110 20" stroke="#f87171" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <span className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-2">MISTAKE: HEAD UP</span>
    </div>
    <div className="w-[1px] h-20 bg-white/10" />
    <div className="flex flex-col items-center">
      <svg width="120" height="100" viewBox="0 0 120 100">
        <path d="M 10 60 L 110 55" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.2" />
        <path d="M 40 58 Q 70 45 100 55" stroke="var(--color-accent)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="105" cy="50" r="7" fill="var(--color-accent)" opacity="0.5" />
      </svg>
      <span className="text-[9px] font-black text-accent uppercase tracking-widest mt-2">FIX: CHIN DOWN</span>
    </div>
  </div>
);

const DuckDiveStepsIllustration = () => (
  <div className="w-full h-48 bg-white/5 rounded-2xl mb-6 p-2 border border-white/5 flex items-center justify-between">
    {[
      { n: 'Dive', b: 'rotate(35)', arrow: true },
      { n: 'Push', b: 'rotate(10)', arrow: true },
      { n: 'Level', b: 'rotate(0)', arrow: false }
    ].map((s, i) => (
      <div key={i} className="flex-1 flex flex-col items-center">
        <svg width="80" height="100" viewBox="0 0 80 100">
          <path d="M 0 40 Q 40 38 80 40" stroke="white" strokeOpacity="0.05" strokeWidth="1" fill="none" />
          <g transform={`translate(40, 50) ${s.b}`}>
             <path d="M -25 0 L 25 0" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" />
             <path d="M -10 -2 Q 0 -15 15 -2" fill="none" stroke="white" strokeWidth="2" opacity="0.5" />
          </g>
          {s.arrow && (
            <path d="M 40 65 L 40 85" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.3" markerEnd="url(#arrow-head)" />
          )}
        </svg>
        <span className="text-[8px] font-black text-white/30 uppercase mt-1 tracking-widest">{s.n}</span>
      </div>
    ))}
    <svg width="0" height="0" className="absolute">
      <defs>
        <marker id="arrow-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
        </marker>
      </defs>
    </svg>
  </div>
);

const FinSetupIllustration = () => (
  <div className="w-full h-40 bg-white/5 rounded-2xl mb-6 overflow-hidden relative border border-white/5 flex items-center justify-around p-6">
    <div className="text-center">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <path d="M 20 70 Q 25 10 60 20 Q 65 25 50 70 Z" fill="var(--color-accent)" opacity="0.8" />
      </svg>
      <p className="text-[9px] font-black text-white/40 uppercase mt-2">Upright</p>
      <p className="text-[7px] font-mono text-accent/30 mt-0.5">Snappy / Pivot</p>
    </div>
    <div className="w-[1px] h-12 bg-white/10" />
    <div className="text-center">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <path d="M 10 70 Q 15 5 70 25 Q 75 35 45 70 Z" fill="var(--color-accent)" opacity="0.4" />
      </svg>
      <p className="text-[9px] font-black text-white/40 uppercase mt-2">Raked</p>
      <p className="text-[7px] font-mono text-accent/30 mt-0.5">Hold / Speed</p>
    </div>
  </div>
);

const FinSetupsIllustration = () => (
  <div className="w-full h-44 bg-white/5 rounded-2xl mb-6 p-4 border border-white/5 grid grid-cols-4 gap-2">
    {[
      { n: 'Single', f: [{ x: 50, y: 30, w: 6, h: 40 }] },
      { n: 'Twin', f: [{ x: 30, y: 35, w: 6, h: 35 }, { x: 70, y: 35, w: 6, h: 35 }] },
      { n: 'Thruster', f: [{ x: 25, y: 40, w: 5, h: 30 }, { x: 75, y: 40, w: 5, h: 30 }, { x: 50, y: 25, w: 6, h: 35 }] },
      { n: 'Quad', f: [{ x: 20, y: 45, w: 5, h: 25 }, { x: 35, y: 40, w: 5, h: 30 }, { x: 65, y: 40, w: 5, h: 30 }, { x: 80, y: 45, w: 5, h: 25 }] }
    ].map(s => (
      <div key={s.n} className="bg-white/5 rounded-xl p-2 flex flex-col items-center justify-between group hover:bg-accent/5 transition-colors">
        <svg width="40" height="60" viewBox="0 0 100 100" className="opacity-60 group-hover:opacity-100 transition-opacity">
          {/* Board Tail */}
          <path d="M 10 10 Q 50 0 90 10 L 90 90 Q 50 100 10 90 Z" fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.1" />
          {/* Fins (Top down view approach) */}
          {s.f.map((fin, i) => (
            <rect key={i} x={fin.x - fin.w/2} y={fin.y} width={fin.w} height={fin.h} rx={fin.w/2} fill="var(--color-accent)" opacity={0.6} />
          ))}
        </svg>
        <span className="text-[7px] font-black text-white/30 uppercase group-hover:text-accent transition-colors">{s.n}</span>
      </div>
    ))}
  </div>
);

const tipsData = [
  {
    id: 'duckdive-mastery',
    title: 'Duck Dive Tutorial',
    icon: <Zap className="w-5 h-5 text-accent" />,
    illustration: <DuckDiveStepsIllustration />,
    content: (
      <div className="space-y-4 text-sm text-sand-50/60 leading-relaxed">
        <p className="italic text-[11px] mb-2">"Snelheid is je beste vriend om door de golf te snijden."</p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { s: '1', t: 'Paddel & Spot', d: 'Peddel hard! Start je duik exact 1.8 tot 2.4 meter voordat de golf je raakt.' },
            { s: '2', t: 'Handpositie', d: 'Handen op de rails, net boven borstniveau. Houd je ellebogen strak ingetrokken.' },
            { s: '3', t: 'De Duik', d: 'Druk de neus diep weg vlak voordat het schuim of de lip je bereikt. Armen op slot.' },
            { s: '4', t: 'Voet-Techniek', d: 'Gebruik je (achter)voet in plaats van je knie voor een veel krachtigere duik.' },
            { s: '5', t: 'Glijden', d: 'Houd het board parallel onder water. De buoyancy (drijfvermogen) brengt je terug.' }
          ].map(step => (
            <div key={step.s} className="flex gap-3 items-start bg-white/5 p-3 rounded-2xl border border-white/5 hover:border-accent/20 transition-all">
              <span className="w-5 h-5 rounded-md bg-accent text-marine-950 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{step.s}</span>
              <div>
                <p className="text-white font-bold text-xs">{step.t}</p>
                <p className="text-[11px] opacity-70 leading-snug">{step.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'duckdive-errors',
    title: 'Common Mistakes & Fixes',
    icon: <BookOpen className="w-5 h-5 text-accent" />,
    illustration: <DuckDiveMistakeIllustration />,
    content: (
      <div className="space-y-4 text-sm text-sand-50/60 leading-relaxed">
        <div className="space-y-3">
          {[
            { m: 'Niet diep genoeg', f: 'Druk harder op de neus én de tail.' },
            { m: 'Hoofd omhoog', f: 'Houd je kin omlaag, lichaam compact.' },
            { m: 'Te vroeg boven', f: 'Houd de duik iets langer vast.' },
            { m: 'Knie te laat', f: 'Druk tail omlaag zodra je borst onder is.' }
          ].map((item, i) => (
            <div key={i} className="p-3 bg-red-400/5 rounded-xl border border-red-400/10 text-[11px]">
              <p className="text-red-400 font-bold uppercase text-[9px] mb-1">Mistake: {item.m}</p>
              <p className="text-white/80"><span className="text-accent">Fix:</span> {item.f}</p>
            </div>
          ))}
        </div>
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-[11px] font-medium italic">
          "Meestal geldt: hoe groter de golf, hoe dieper je moet duiken. Wees zelfverzekerd!"
        </div>
      </div>
    )
  },
  {
    id: 'fins-technical',
    title: 'Vinnen: De Rudder',
    icon: <Waves className="w-5 h-5 text-accent" />,
    illustration: <FinSetupIllustration />,
    content: (
      <div className="space-y-4 text-sm text-sand-50/60 leading-relaxed">
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-3 text-[10px]">
            <div className="p-3 glass rounded-xl">
              <p className="text-white font-bold mb-1 underline decoration-accent">Shapes</p>
              <p><span className="text-accent">Upright:</span> Snappier, voor kleine golven.</p>
              <p className="mt-1"><span className="text-accent">Raked:</span> Hold bij hoge snelheid.</p>
            </div>
            <div className="p-3 glass rounded-xl">
              <p className="text-white font-bold mb-1 underline decoration-accent">Flex</p>
              <p><span className="text-accent">Stijf:</span> Voor snelheid en drive.</p>
              <p className="mt-1"><span className="text-accent">Flexibel:</span> Voor vloeiende bochten.</p>
            </div>
          </div>
          
          <div className="space-y-2 p-4 bg-white/5 rounded-2xl border border-white/5">
            <h4 className="text-white font-bold text-xs uppercase">Systemen (Niet uitwisselbaar!)</h4>
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-accent font-bold text-[10px]">FCS (Dual Tabs)</p>
                <p className="text-[9px] opacity-60">Meest voorkomend wereldwijd.</p>
              </div>
              <div className="flex-1">
                <p className="text-accent font-bold text-[10px]">Futures (Single Base)</p>
                <p className="text-[9px] opacity-60">Sterk en zeer direct gevoel.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 italic text-[11px]">
            <p>• <span className="text-white">Materiaal:</span> Carbon (Licht/Snel) • Glasvezel (Responsive) • Plastic (Duurzaam)</p>
            <p>• <span className="text-white">Maat:</span> Afhankelijk van gewicht. Groter = Controle, Kleiner = Freedom.</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'setups',
    title: 'Fin Setups Vergeleken',
    icon: <Zap className="w-5 h-5 text-accent" />,
    illustration: <FinSetupsIllustration />,
    content: (
      <div className="space-y-4 text-sm text-sand-50/60 leading-relaxed">
        <div className="grid grid-cols-1 gap-2">
          {[
            { n: 'Single Fin', d: 'Stijl & Flow. Voor classic surfers op longboards.', tag: 'Classic' },
            { n: 'Twin Fin', d: 'Snel en los (skatey). Minder controle in kritieke secties.', tag: 'Fast' },
            { n: 'Thruster', d: 'De populairste setup. Center vin geeft controle in steile golven.', tag: 'Popular' },
            { n: 'Quad', d: 'Maximale drive. Perfect voor barrels en krachtige point breaks.', tag: 'Drive' }
          ].map(setup => (
            <div key={setup.n} className="p-3 bg-white/5 rounded-xl border border-white/5 flex gap-4 items-center">
              <div className="shrink-0 w-12 text-[8px] font-mono font-black text-accent uppercase bg-accent/10 p-1 px-2 rounded-full text-center">
                {setup.tag}
              </div>
              <div>
                <p className="text-white font-bold text-xs">{setup.n}</p>
                <p className="text-[10px] opacity-60 leading-tight">{setup.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'wave-sets',
    title: 'Wat zijn "Sets"?',
    icon: <Waves className="w-5 h-5 text-accent" />,
    illustration: <WaveSetIllustration />,
    content: (
      <div className="space-y-4 text-sm text-sand-50/60 leading-relaxed">
        <p>Waves komen vaak aan in groepen, ook wel 'sets' genoemd. Tussen deze groepen door is het vaak even rustig.</p>
        <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 italic text-accent font-medium">
          "Observeer het ritme: tel hoeveel golven er in een set zitten voordat je naar buiten peddelt."
        </div>
        <ul className="space-y-2 text-[10px] font-mono text-white/20 uppercase tracking-widest">
          <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-accent rounded-full" /> Meestal 3 tot 6 golven</li>
          <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-accent rounded-full" /> Gevolgd door een pauze</li>
        </ul>
      </div>
    )
  },
];

export function SurfTips() {
  return (
    <div className="space-y-12 pb-32">
      <header className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white italic uppercase">Surf Tips</h2>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em]">Field Intelligence Handbook</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {tipsData.map((tip, index) => (
          <motion.div 
            key={tip.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="p-10 rounded-[3rem] glass group hover:border-accent/30 hover:shadow-2xl transition-all"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center transition-transform group-hover:rotate-6">
                {tip.icon}
              </div>
              <h3 className="text-xl font-bold text-white">{tip.title}</h3>
            </div>
            {tip.illustration}
            {tip.content}
          </motion.div>
        ))}
      </div>

      <div className="glass-dark p-10 rounded-[3rem] text-white relative overflow-hidden group shadow-2xl border border-accent/20">
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shrink-0">
            <Zap className="w-8 h-8 text-marine-950" />
          </div>
          <div className="space-y-3 text-center md:text-left">
            <h4 className="text-2xl font-black uppercase italic">Veiligheid Voorop</h4>
            <p className="text-sm text-sand-50/60 leading-relaxed max-w-2xl font-medium">
              Noordzee golven kunnen onvoorspelbaar zijn door de zandbanken. Let altijd op de stroming bij pieren en ga nooit alleen het water in als de condities zwaar zijn. Respecteer andere surfers en houd afstand.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
