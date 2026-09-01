const fs = require('fs');
let content = fs.readFileSync('src/components/ProfileSettings.tsx', 'utf8');

// Replace standard dark mode classes with light mode equivalents
content = content.replace(/text-white\/40/g, 'text-slate-400');
content = content.replace(/text-white\/50/g, 'text-slate-500');
content = content.replace(/text-white\/60/g, 'text-slate-600');
content = content.replace(/text-white\/70/g, 'text-slate-500');
content = content.replace(/text-white\/80/g, 'text-slate-700');
content = content.replace(/text-white/g, 'text-slate-900');
content = content.replace(/bg-marine-950/g, 'bg-white');
content = content.replace(/bg-marine-900/g, 'bg-slate-50');
content = content.replace(/bg-marine-800/g, 'bg-slate-100');
content = content.replace(/bg-white\/5/g, 'bg-slate-50');
content = content.replace(/bg-white\/10/g, 'bg-slate-100');
content = content.replace(/bg-white\/15/g, 'bg-slate-200');
content = content.replace(/border-white\/5/g, 'border-slate-200');
content = content.replace(/border-white\/10/g, 'border-slate-200');
content = content.replace(/border-white\/20/g, 'border-slate-300');
content = content.replace(/glass/g, 'bg-white/90 backdrop-blur-md shadow-sm border border-slate-200');
content = content.replace(/text-marine-950/g, 'text-white');

content = content.replace(/bg-accent/g, 'bg-cyan-600');
content = content.replace(/text-accent/g, 'text-cyan-600');
content = content.replace(/border-accent/g, 'border-cyan-600');
content = content.replace(/shadow-accent/g, 'shadow-cyan-600');
content = content.replace(/from-marine-950\/50/g, 'from-white/50');
content = content.replace(/to-marine-900\/50/g, 'to-slate-50/50');

// Fix the active state tabs where it was bg-white text-marine-950 -> which became bg-slate-900 text-white
content = content.replace(/bg-slate-900 text-white shadow-xl/g, 'bg-slate-900 text-white shadow-xl');

fs.writeFileSync('src/components/ProfileSettings.tsx', content);
