const fs = require('fs');
let content = fs.readFileSync('src/components/ProfileSettings.tsx', 'utf8');

content = content.replace(/bg-white text-white shadow-xl/g, 'bg-slate-900 text-white shadow-xl');
content = content.replace(/text-slate-900\/20/g, 'text-slate-400');
content = content.replace(/text-slate-900\/30/g, 'text-slate-400');
content = content.replace(/text-slate-900\/40/g, 'text-slate-500');
content = content.replace(/text-slate-900\/10/g, 'text-slate-300');
content = content.replace(/border border-slate-200 border border-slate-200/g, 'border border-slate-200');
content = content.replace(/bg-purple-500 text-slate-900 shadow-xl/g, 'bg-purple-500 text-white shadow-xl');
content = content.replace(/bg-purple-500 text-slate-900/g, 'bg-purple-600 text-white');

fs.writeFileSync('src/components/ProfileSettings.tsx', content);
