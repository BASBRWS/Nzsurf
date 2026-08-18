import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Palette, 
  Sun, 
  Moon, 
  Terminal as TerminalIcon, 
  Zap, 
  Sunset, 
  Monitor, 
  Laptop, 
  Disc, 
  Sparkles, 
  Square, 
  Waves, 
  DraftingCompass, 
  BookOpen, 
  Gamepad2, 
  Cpu, 
  ShieldAlert, 
  Binary, 
  Code2, 
  Sliders,
  Check, 
  ChevronDown, 
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export type ThemeStyle = 
  | 'light'
  | 'dark'
  | 'matrix'
  | 'cyberpunk'
  | 'synthwave'
  | 'terminal'
  | 'win95'
  | 'macintosh'
  | 'y2k'
  | 'vaporwave'
  | 'brutalist'
  | 'glass'
  | 'blueprint'
  | 'paper'
  | 'arcade'
  | 'nes8bit'
  | 'hacker'
  | 'tron'
  | 'monochrome'
  | 'developer'
  // Legacy aliases for backward compatibility
  | 'oceanic'
  | 'retro8bit'
  | 'sunset80s'
  | 'nordic';

export type ThemeCategory = 'all' | 'essential' | 'retro' | 'cyber' | 'creative';

export interface ThemeOption {
  id: ThemeStyle;
  number: number;
  name: string;
  subtitle: string;
  badge: string;
  category: 'essential' | 'retro' | 'cyber' | 'creative';
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  previewGradient: string;
  tag: string;
  description: string;
  soundType?: 'beep' | 'laser' | 'click' | 'modem';
}

export const THEMES: ThemeOption[] = [
  {
    id: 'light',
    number: 1,
    name: 'Light',
    subtitle: 'Strak & Rustig',
    badge: 'LIGHT',
    category: 'essential',
    icon: Sun,
    accentColor: '#0284c7',
    previewGradient: 'from-[#f8fafc] via-[#e2e8f0] to-[#bae6fd]',
    tag: 'Wit & Lichtgrijs',
    description: 'Wit, lichtgrijs, zwarte tekst en één helder cyaan accent. Strak, overzichtelijk en rustig.'
  },
  {
    id: 'dark',
    number: 2,
    name: 'Dark (Onyx)',
    subtitle: 'Veilige Standaard',
    badge: 'DARK',
    category: 'essential',
    icon: Moon,
    accentColor: '#38bdf8',
    previewGradient: 'from-[#090a0f] via-[#111827] to-[#1e293b]',
    tag: 'Diep Antraciet',
    description: 'Antraciet en bijna zwart, witte contrasttekst met subtiele accentkleur. De veilige donkere modus.'
  },
  {
    id: 'matrix',
    number: 3,
    name: 'Matrix',
    subtitle: 'Digital Code Rain',
    badge: 'MATRIX',
    category: 'cyber',
    icon: Binary,
    accentColor: '#00ff41',
    previewGradient: 'from-[#020702] via-[#051a08] to-[#00ff41]/20',
    tag: 'Code Groen',
    description: 'Diepzwarte achtergrond, felgroene glow tekst, monospace font en subtiele digitale code sfeer.',
    soundType: 'laser'
  },
  {
    id: 'cyberpunk',
    number: 4,
    name: 'Cyberpunk',
    subtitle: 'Neon 2077 Future',
    badge: 'CYBERPUNK',
    category: 'cyber',
    icon: Zap,
    accentColor: '#00f0ff',
    previewGradient: 'from-[#0c0817] via-[#2a0845] to-[#ff007f]/40',
    tag: 'Neon Roze & Cyaan',
    description: 'Donkerpaars en zwart, neon roze, cyaan en paarse glow. Scherpe lijnen en futuristische UI.',
    soundType: 'laser'
  },
  {
    id: 'synthwave',
    number: 5,
    name: 'Synthwave',
    subtitle: 'Retro 80s Sunset',
    badge: 'SYNTHWAVE',
    category: 'creative',
    icon: Sunset,
    accentColor: '#ff2a85',
    previewGradient: 'from-[#120726] via-[#280c4d] to-[#ff2a85]/30',
    tag: 'Sunset Glow',
    description: 'Donkerblauw en paars, roze neon, zonsondergang gradient. Typische jaren 80 retro future uitstraling.',
    soundType: 'beep'
  },
  {
    id: 'terminal',
    number: 6,
    name: 'Terminal',
    subtitle: 'Command Line Interface',
    badge: 'CLI TERMINAL',
    category: 'cyber',
    icon: TerminalIcon,
    accentColor: '#ffb000',
    previewGradient: 'from-[#0d0b05] via-[#1f1604] to-[#ffb000]/20',
    tag: 'Amber Monospace',
    description: 'Zwart scherm met amberkleurige tekst, monospace fonts, knoppen en kaarten alsof je in een console zit.',
    soundType: 'click'
  },
  {
    id: 'win95',
    number: 7,
    name: 'Windows 95',
    subtitle: 'Classic Desktop',
    badge: 'WIN 95',
    category: 'retro',
    icon: Monitor,
    accentColor: '#000080',
    previewGradient: 'from-[#008080] via-[#c0c0c0] to-[#000080]',
    tag: '3D Bevel & Grijze Panelen',
    description: 'Grijze panelen, navy blauwe titelbalken en pixelachtige knoppen. Heel herkenbaar en nostalgisch.',
    soundType: 'click'
  },
  {
    id: 'macintosh',
    number: 8,
    name: 'Macintosh Classic',
    subtitle: '1984 Vintage Apple',
    badge: 'MAC CLASSIC',
    category: 'retro',
    icon: Laptop,
    accentColor: '#000000',
    previewGradient: 'from-[#e5e5df] via-[#cccccc] to-[#111111]',
    tag: 'Dithered Bitmap',
    description: 'Gebroken wit, zwart, grijstinten en bitmapachtige iconen. Nog sterker retro dan Windows 95.',
    soundType: 'click'
  },
  {
    id: 'y2k',
    number: 9,
    name: 'Y2K Millennium',
    subtitle: 'Zilver & Aqua Transparant',
    badge: 'Y2K AESTHETIC',
    category: 'creative',
    icon: Disc,
    accentColor: '#38bdf8',
    previewGradient: 'from-[#0c1424] via-[#1e293b] to-[#38bdf8]/40',
    tag: 'Metallic & Aqua',
    description: 'Zilver, metallic, lichtblauw en aqua transparante elementen. Ronde vormen en begin jaren 2000 uitstraling.',
    soundType: 'beep'
  },
  {
    id: 'vaporwave',
    number: 10,
    name: 'Vaporwave',
    subtitle: 'Pastel Lo-Fi Palm',
    badge: 'VAPORWAVE',
    category: 'creative',
    icon: Sparkles,
    accentColor: '#01cdfe',
    previewGradient: 'from-[#1a0b2e] via-[#4a154b] to-[#01cdfe]/30',
    tag: 'Pastel Roze & Turquoise',
    description: 'Roze, paars, turquoise, gradients en retro grids. Expres overdreven en nostalgisch esthetisch.',
    soundType: 'beep'
  },
  {
    id: 'brutalist',
    number: 11,
    name: 'Brutalist',
    subtitle: 'High Contrast & Bold',
    badge: 'BRUTALIST',
    category: 'creative',
    icon: Square,
    accentColor: '#ff0055',
    previewGradient: 'from-[#ffffff] via-[#ffde00] to-[#000000]',
    tag: 'Dikke 3px Borders',
    description: 'Hard zwart wit, dikke kaders, grote typografie en harde slagschaduwen. Geen zachte gradiënten.',
    soundType: 'click'
  },
  {
    id: 'glass',
    number: 12,
    name: 'Glass (Oceanic)',
    subtitle: 'Apple Glassmorphism',
    badge: 'GLASS MODERN',
    category: 'essential',
    icon: Waves,
    accentColor: '#54d1c1',
    previewGradient: 'from-[#020617] via-[#0b1528] to-[#082f49]',
    tag: 'Vloeiende Blur & Diepzee',
    description: 'Donkere achtergrond, ultra-transparante panelen met backdrop blur en vloeiende moderne typografie.'
  },
  {
    id: 'blueprint',
    number: 13,
    name: 'Blueprint',
    subtitle: 'Architectonisch Raster',
    badge: 'BLUEPRINT',
    category: 'creative',
    icon: DraftingCompass,
    accentColor: '#38bdf8',
    previewGradient: 'from-[#0a2540] via-[#0d3b66] to-[#38bdf8]/30',
    tag: 'Technisch Blauw Grid',
    description: 'Donkerblauw technisch raster met witte en cyaan vectorlijnen. Alsof het een nautische bouwtekening is.',
    soundType: 'click'
  },
  {
    id: 'paper',
    number: 14,
    name: 'Paper (Editorial)',
    subtitle: 'Krant & Document',
    badge: 'PAPER SERIF',
    category: 'creative',
    icon: BookOpen,
    accentColor: '#b45309',
    previewGradient: 'from-[#f5f2eb] via-[#e7e5e4] to-[#b45309]/20',
    tag: 'Warm Papier & Serif',
    description: 'Gebroken wit, zwarte tekst en verfijnd serif font. Alsof je naar een maritiem boek of krant kijkt.'
  },
  {
    id: 'arcade',
    number: 15,
    name: 'Arcade',
    subtitle: 'Coin-Op Neon',
    badge: 'ARCADE',
    category: 'retro',
    icon: Gamepad2,
    accentColor: '#ffff00',
    previewGradient: 'from-[#050505] via-[#1a0505] to-[#ffff00]/30',
    tag: 'Felle Primaire Kleuren',
    description: 'Diepzwart met felle primaire kleuren (geel, rood, cyaan), pixel fonts en arcade button kaders.',
    soundType: 'beep'
  },
  {
    id: 'nes8bit',
    number: 16,
    name: 'NES / 8-Bit',
    subtitle: '80s Console Pixelart',
    badge: '8-BIT NES',
    category: 'retro',
    icon: Cpu,
    accentColor: '#00ffcc',
    previewGradient: 'from-[#050b14] via-[#09152a] to-[#ff007f]/40',
    tag: 'Blokvormig & Scanlines',
    description: 'Beperkt kleurenpalet, blokvormige UI elementen, pixel icons en herkenbare 8-bit gamesfeer.',
    soundType: 'beep'
  },
  {
    id: 'hacker',
    number: 17,
    name: 'Hacker',
    subtitle: 'Security Console',
    badge: 'HACKER',
    category: 'cyber',
    icon: ShieldAlert,
    accentColor: '#00ff66',
    previewGradient: 'from-[#030804] via-[#07190b] to-[#ff3344]/30',
    tag: 'Mainframe & Alarm Rood',
    description: 'Zwart met groen en alarm-rood voor waarschuwingen, terminal elementen en mainframe console gevoel.',
    soundType: 'laser'
  },
  {
    id: 'tron',
    number: 18,
    name: 'Tron',
    subtitle: 'Laser Cyaan Grid',
    badge: 'TRON CYBER',
    category: 'cyber',
    icon: Zap,
    accentColor: '#00f0ff',
    previewGradient: 'from-[#030712] via-[#082f49] to-[#00f0ff]/30',
    tag: 'Gloeiende Cyaan Lijnen',
    description: 'Diepzwart met cyaan en blauwe gloeiende neon vectorlijnen. Ideaal voor data dashboards.',
    soundType: 'laser'
  },
  {
    id: 'monochrome',
    number: 19,
    name: 'Monochrome',
    subtitle: 'Extreem Clean Minimal',
    badge: 'MONOCHROME',
    category: 'essential',
    icon: Sliders,
    accentColor: '#ffffff',
    previewGradient: 'from-[#09090b] via-[#18181b] to-[#27272a]',
    tag: 'Zwart, Wit & Grijs',
    description: 'Zwart, wit en pure neutrale grijstinten. Geen enkele kleurafleiding, hyper-minimalistisch en strak.'
  },
  {
    id: 'developer',
    number: 20,
    name: 'Solarized (Dev)',
    subtitle: 'IDE Syntax Highlighting',
    badge: 'DEV SOLARIZED',
    category: 'creative',
    icon: Code2,
    accentColor: '#2aa198',
    previewGradient: 'from-[#002b36] via-[#073642] to-[#b58900]/30',
    tag: 'Dark Teal & Syntax',
    description: 'Donker teal, beige/cream tekst, geel, cyaan en groen. Voor developers direct herkenbaar als Solarized.',
    soundType: 'click'
  }
];

// Normalize theme ID including legacy mappings
export function normalizeThemeId(theme: ThemeStyle): ThemeStyle {
  if (theme === 'oceanic') return 'glass';
  if (theme === 'retro8bit') return 'nes8bit';
  if (theme === 'sunset80s') return 'synthwave';
  if (theme === 'nordic') return 'monochrome';
  return theme;
}

// Retro Web Audio sound effects
const playThemeSound = (type?: 'beep' | 'laser' | 'click' | 'modem') => {
  if (!type) return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'beep') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'laser') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } else if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(300, ctx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    }
  } catch (e) {
    // Ignore audio autoplay restrictions
  }
};

interface ThemeSelectorProps {
  currentTheme: ThemeStyle;
  onSelectTheme: (theme: ThemeStyle) => void;
  className?: string;
}

export function ThemeSelector({ currentTheme, onSelectTheme, className }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ThemeCategory>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const normalizedCurrent = normalizeThemeId(currentTheme);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeThemeObj = useMemo(() => {
    return THEMES.find(t => t.id === normalizedCurrent) || THEMES[11]; // default glass
  }, [normalizedCurrent]);

  const IconComponent = activeThemeObj.icon;

  const filteredThemes = useMemo(() => {
    return THEMES.filter(t => {
      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        t.name.toLowerCase().includes(q) || 
        t.subtitle.toLowerCase().includes(q) || 
        t.tag.toLowerCase().includes(q) ||
        t.badge.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const handleSelect = (theme: ThemeOption) => {
    playThemeSound(theme.soundType);
    onSelectTheme(theme.id);
    setIsOpen(false);
  };

  const isRetroActive = normalizedCurrent === 'nes8bit' || normalizedCurrent === 'arcade' || normalizedCurrent === 'win95';

  return (
    <div className={cn("relative inline-block text-left", className)} ref={dropdownRef}>
      {/* Trigger Button in Top Navigation */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer select-none",
          isRetroActive 
            ? "bg-[#0b1528] border-2 border-[#00ffcc] text-[#00ffcc] shadow-[2px_2px_0px_#000] font-pixel text-[10px]" 
            : "glass border border-white/15 hover:border-accent/40 text-white/90 hover:text-white"
        )}
        title="Thema stijl kiezen (20 stijlen)"
        aria-label="Thema stijl menu"
      >
        <div className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
          isRetroActive ? "bg-[#00ffcc]/20 text-[#00ffcc] rounded-none" : "bg-white/10 text-accent"
        )}>
          <IconComponent className="w-3.5 h-3.5" />
        </div>
        <span className="hidden xs:inline font-bold uppercase tracking-wider text-[11px]">
          {activeThemeObj.badge}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-white/50 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {/* Menu Modal / Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "fixed sm:absolute left-2 right-2 sm:left-0 sm:right-auto top-14 sm:top-full mt-1.5",
                "w-auto sm:w-[480px] max-h-[85vh] flex flex-col rounded-3xl p-3 sm:p-4 z-50 shadow-2xl border backdrop-blur-2xl modal-dialog",
                isRetroActive
                  ? "bg-[#070d18] border-2 border-[#00ffcc] shadow-[4px_4px_0px_#000] rounded-none"
                  : "bg-slate-950/95 border-white/20"
              )}
            >
              {/* Header */}
              <div className="px-1.5 pb-3 border-b border-white/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent/20 text-accent">
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={cn(
                      "text-xs sm:text-sm font-bold uppercase tracking-wider text-white",
                      isRetroActive && "font-pixel text-[11px]"
                    )}>
                      Kies Thema Stijl
                    </h3>
                    <p className="text-[10px] text-white/50">
                      20 iconische thema's met live responsive preview
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
                    {THEMES.length} Thema's
                  </span>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white sm:hidden"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search and Category Filters */}
              <div className="pt-2.5 pb-2 space-y-2 shrink-0">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Zoek thema (bijv. Win95, Brutalist, Matrix, Paper...)"
                    className="w-full pl-8.5 pr-8 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-accent/50 transition-colors"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 text-[10px] font-mono">
                  {(
                    [
                      { id: 'all', label: 'Alle (20)' },
                      { id: 'essential', label: 'Basis & Clean' },
                      { id: 'retro', label: 'Retro & Games' },
                      { id: 'cyber', label: 'Cyber & Code' },
                      { id: 'creative', label: 'Creatief & Art' }
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={cn(
                        "px-2 py-1 rounded-lg border whitespace-nowrap transition-all cursor-pointer shrink-0",
                        selectedCategory === cat.id
                          ? "bg-accent/20 border-accent text-accent font-bold"
                          : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Theme Grid */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 max-h-[50vh] min-h-[160px] custom-scroll">
                {filteredThemes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/50">
                    Geen thema's gevonden voor "{searchQuery}"
                  </div>
                ) : (
                  filteredThemes.map((theme) => {
                    const isSelected = theme.id === normalizedCurrent;
                    const ThemeIcon = theme.icon;

                    return (
                      <button
                        key={theme.id}
                        onClick={() => handleSelect(theme)}
                        className={cn(
                          "w-full p-2.5 rounded-2xl border text-left transition-all flex items-start gap-2.5 sm:gap-3 group relative overflow-hidden cursor-pointer",
                          isSelected
                            ? isRetroActive
                              ? "bg-[#0b1528] border-2 border-[#00ffcc] text-white shadow-[2px_2px_0px_#000] rounded-none"
                              : "bg-accent/15 border-accent/60 text-white shadow-lg shadow-accent/10"
                            : "bg-white/[0.03] border-white/10 hover:border-white/25 hover:bg-white/[0.07] text-white/70 hover:text-white"
                        )}
                      >
                        {/* Theme Visual Icon Badge */}
                        <div 
                          className={cn(
                            "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 shadow-inner",
                            isSelected 
                              ? "border-accent bg-accent/20 text-white" 
                              : "border-white/10 bg-white/5 text-white/70",
                            theme.id === 'win95' && "rounded-none border-2 border-t-white border-l-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-black",
                            theme.id === 'nes8bit' && "rounded-none",
                            theme.id === 'brutalist' && "rounded-none border-2 border-black bg-white text-black"
                          )}
                          style={{ 
                            color: theme.id === 'win95' || theme.id === 'brutalist' ? undefined : theme.accentColor 
                          }}
                        >
                          <ThemeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-mono text-white/40 font-bold">
                                #{theme.number}
                              </span>
                              <span className={cn(
                                "text-xs sm:text-sm font-black text-white tracking-tight truncate",
                                (theme.id === 'nes8bit' || theme.id === 'arcade') && "font-pixel text-[11px]"
                              )}>
                                {theme.name}
                              </span>
                              <span className="text-[10px] text-white/50 truncate hidden xs:inline">
                                • {theme.subtitle}
                              </span>
                            </div>

                            {isSelected && (
                              <div className={cn(
                                "w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-accent text-slate-950 flex items-center justify-center shrink-0 font-bold",
                                isRetroActive && "rounded-none bg-[#00ffcc]"
                              )}>
                                <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[3]" />
                              </div>
                            )}
                          </div>

                          <p className="text-[11px] text-white/60 mt-0.5 line-clamp-1 leading-relaxed">
                            {theme.description}
                          </p>

                          <div className="flex items-center gap-2 mt-1.5">
                            <span 
                              className="text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                              style={{ 
                                color: theme.accentColor,
                                borderColor: `${theme.accentColor}40`,
                                backgroundColor: `${theme.accentColor}15`
                              }}
                            >
                              {theme.tag}
                            </span>
                            <span className="text-[8px] font-mono text-white/40 uppercase">
                              {theme.badge}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer status */}
              <div className="mt-2.5 pt-2 border-t border-white/10 px-1 flex items-center justify-between text-[10px] font-mono text-white/50 shrink-0">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Direct opgeslagen
                </span>
                <span className="text-accent font-bold">
                  {activeThemeObj.name} actief
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
