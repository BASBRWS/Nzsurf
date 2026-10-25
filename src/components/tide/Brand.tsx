import React from 'react';

/**
 * Het NZ-logo in de kleur van het thema (standaard inkt). Het bronbestand is wit op
 * transparant; via een CSS-masker kleurt het mee met elke achtergrond.
 */
const mask = (src: string): React.CSSProperties => ({
  WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`,
  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain', maskSize: 'contain',
  WebkitMaskPosition: 'left center', maskPosition: 'left center',
});

/** Alleen het monogram (verhouding 204 × 238). */
export const BrandMark: React.FC<{ height?: number; color?: string; className?: string }> = ({ height = 30, color = 'var(--tide-ink)', className }) => (
  <span role="img" aria-label="Noordzeesurf" className={className}
    style={{ display: 'inline-block', height, width: Math.round(height * 204 / 238), background: color, ...mask('/brand/nz-mark.png') }} />
);

/** Monogram met woordmerk "Noordzeesurf" (verhouding 1287 × 238). */
export const BrandWordmark: React.FC<{ height?: number; color?: string; className?: string }> = ({ height = 28, color = 'var(--tide-ink)', className }) => (
  <span role="img" aria-label="Noordzeesurf" className={className}
    style={{ display: 'inline-block', height, width: Math.round(height * 1287 / 238), background: color, ...mask('/brand/noordzeesurf.png') }} />
);
