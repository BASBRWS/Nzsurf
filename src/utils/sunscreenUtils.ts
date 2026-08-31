import { SunscreenAdvice } from '../types';

/**
 * Calculates tailored sunscreen and UV protection advice for surfers.
 * Factors in:
 * - Direct solar UV index
 * - Sea water & white water reflection (+25% to +50% effective UV exposure)
 * - Wash-off resistance (waterproof & zinc stick recommendations)
 */
export function calculateSunscreenAdvice(
  uvIndex: number,
  isDaylight: boolean = true,
  weatherCode?: number,
  airTemp?: number
): SunscreenAdvice {
  // If not daylight or minimal UV
  const roundedUv = Math.max(0, Math.round((uvIndex || 0) * 10) / 10);

  if (!isDaylight || roundedUv < 0.5) {
    return {
      uvIndex: roundedUv,
      level: 'low',
      levelLabel: 'Geen / Minimaal (UV 0)',
      spfRecommendation: 'Geen zonnebrand vereist',
      shortAdvice: 'Geen zonnebrand nodig (geen actieve zonkracht).',
      details: 'Tijdens schemering of nacht is er geen schadelijke UV-straling.',
      needsSunscreen: false
    };
  }

  if (roundedUv < 3.0) {
    return {
      uvIndex: roundedUv,
      level: 'low',
      levelLabel: `Laag (UV ${roundedUv.toFixed(1)})`,
      spfRecommendation: 'SPF 15-30 optioneel',
      shortAdvice: 'Lage zonkracht. Bij langere sessies (>1,5u) lichte gezichtsbescherming.',
      details: 'Zonkracht is laag, maar water reflecteert UV. Bij een langere sessie is een lichte basislaag op neus en wangen verstandig.',
      needsSunscreen: false
    };
  }

  if (roundedUv < 6.0) {
    return {
      uvIndex: roundedUv,
      level: 'moderate',
      levelLabel: `Matig (UV ${roundedUv.toFixed(1)})`,
      spfRecommendation: 'SPF 30 (waterproof)',
      shortAdvice: 'Waterproof SPF 30 & zinkstick voor het gezicht.',
      details: 'Matige UV-kracht. Zeewater reflecteert veel UV direct naar je gezicht. Smeer minimaal 20 minuten voor het peddelen in met watervaste minerale zonnebrand.',
      needsSunscreen: true
    };
  }

  if (roundedUv < 8.0) {
    return {
      uvIndex: roundedUv,
      level: 'high',
      levelLabel: `Hoog (UV ${roundedUv.toFixed(1)})`,
      spfRecommendation: 'SPF 50+ & Zinkstick',
      shortAdvice: 'Hoge zonkracht! SPF 50+ waterproof & zinklaag op neus/lippen.',
      details: 'Sterke UV-belasting versterkt door schuim en waterweerkaatsing. Zinkstick op neus, lippen en jukbeenderen voorkomt snelle verbranding in de branding.',
      needsSunscreen: true
    };
  }

  // UV 8+ Very High / Extreme
  return {
    uvIndex: roundedUv,
    level: 'very_high',
    levelLabel: `Zeer Hoog (UV ${roundedUv.toFixed(1)})`,
    spfRecommendation: 'SPF 50+ Max & Surfshirt',
    shortAdvice: 'Zeer hoge UV! SPF 50+ minerale block, zink & surfshirt.',
    details: 'Maximale UV-straling. Snelle verbranding op het water. Gebruik watervaste zinkpasta/sunblock, smeer royaal en overweeg een UV-werend surfshirt (rashguard).',
    needsSunscreen: true
  };
}

/**
 * Returns subtle color classes matching the app's refined palette
 */
export function getUvPillClasses(level: SunscreenAdvice['level']): {
  badge: string;
  dot: string;
  text: string;
} {
  switch (level) {
    case 'very_high':
    case 'extreme':
      return {
        badge: 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/30',
        dot: 'bg-rose-500',
        text: 'text-rose-800 dark:text-rose-300'
      };
    case 'high':
      return {
        badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30',
        dot: 'bg-amber-500',
        text: 'text-amber-800 dark:text-amber-300'
      };
    case 'moderate':
      return {
        badge: 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-500/30',
        dot: 'bg-yellow-500',
        text: 'text-yellow-800 dark:text-yellow-300'
      };
    default:
      return {
        badge: 'bg-slate-500/10 text-slate-700 dark:text-white/50 border-slate-300 dark:border-white/10',
        dot: 'bg-slate-400 dark:bg-white/40',
        text: 'text-slate-700 dark:text-white/60'
      };
  }
}
