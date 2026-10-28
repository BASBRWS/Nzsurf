// Varianten voor de opbouw van de kans, om in de terugtoets naast elkaar te toetsen.
// Nu: kans = 100 × grootte × periode × wind × getij (elke factor 0–1). Twee middelmatige
// factoren drukken de kans dan al onder de grens. De varianten veranderen alleen hoe de
// factoren samengaan; de factoren zelf (zie spotKnowledge) blijven gelijk.

export interface Factors { s: number; p: number; w: number; t: number }

const windSoft = (w: number) => { const q = Math.max(0, Math.min(1, (w - 0.35) / 0.65)); return 0.6 + 0.4 * q; };
const prod = (x: number[]) => x.reduce((a, b) => a * b, 1);
/** Zwakste factor bepaalt; de andere tellen met een derdemachtswortel licht mee. */
const weakest = (f: number[]) => { const i = f.indexOf(Math.min(...f)); const rest = f.filter((_, j) => j !== i); return f[i] * Math.cbrt(prod(rest)); };

export const CHANCE_VARIANTS: { key: string; label: string; chance: (f: Factors) => number; threshold: number }[] = [
  { key: 'nu', label: 'huidig (product, ≥45)', chance: f => 100 * f.s * f.p * f.w * f.t, threshold: 45 },
  { key: 'g35', label: 'product, grens 35', chance: f => 100 * f.s * f.p * f.w * f.t, threshold: 35 },
  { key: 'g25', label: 'product, grens 25', chance: f => 100 * f.s * f.p * f.w * f.t, threshold: 25 },
  { key: 'wz', label: 'wind zachter (0,6–1)', chance: f => 100 * f.s * f.p * windSoft(f.w) * f.t, threshold: 45 },
  { key: 'zw', label: 'zwakste factor + rest licht', chance: f => 100 * weakest([f.s, f.p, f.w, f.t]), threshold: 45 },
  { key: 'zwwz', label: 'zwakste + wind zachter', chance: f => 100 * weakest([f.s, f.p, windSoft(f.w), f.t]), threshold: 45 },
];
