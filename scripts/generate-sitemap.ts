// Schrijft public/sitemap.xml opnieuw op basis van de spotcatalogus.
// Draaien na het toevoegen van een spot of blog: bun run scripts/generate-sitemap.ts
import { writeFileSync } from 'node:fs';
import { SPOT_CATALOG, spotPagePath } from '../src/data/spotCatalog';
import { SITE } from '../src/seo/spotPage';

const today = new Date().toISOString().slice(0, 10);

const BLOGS: { path: string; lastmod: string }[] = [
  { path: '/blog/', lastmod: '2026-10-10' },
  { path: '/blog/surfen-in-ouddorp/', lastmod: '2026-10-10' },
  { path: '/blog/surfen-maasvlakte-p6/', lastmod: '2026-10-10' },
];

const urls = [
  { loc: '/', lastmod: today, changefreq: 'hourly', priority: '1.0' },
  { loc: '/surfverwachting/', lastmod: today, changefreq: 'weekly', priority: '0.9' },
  ...SPOT_CATALOG.map(s => ({ loc: spotPagePath(s), lastmod: today, changefreq: 'hourly', priority: '0.8' })),
  ...BLOGS.map(b => ({ loc: b.path, lastmod: b.lastmod, changefreq: b.path === '/blog/' ? 'weekly' : 'monthly', priority: b.path === '/blog/' ? '0.6' : '0.7' })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${SITE}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

writeFileSync(new URL('../public/sitemap.xml', import.meta.url), xml);
console.log(`sitemap.xml: ${urls.length} URL's`);
