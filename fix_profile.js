const fs = require('fs');
let content = fs.readFileSync('src/components/ProfileSettings.tsx', 'utf8');

// Fix tabs: "bg-white text-white shadow-xl" -> "bg-slate-900 text-white shadow-xl"
content = content.replace(/bg-white text-white shadow-xl/g, 'bg-slate-900 text-white shadow-xl');

// Fix text-slate-900/20 -> text-slate-400
content = content.replace(/text-slate-900\/20/g, 'text-slate-400');
content = content.replace(/text-slate-900\/30/g, 'text-slate-400');
content = content.replace(/text-slate-900\/40/g, 'text-slate-500');

// Fix border border-slate-200 border border-slate-200
content = content.replace(/border border-slate-200 border border-slate-200/g, 'border border-slate-200');

// Fix active tab for 'beta'
content = content.replace(/bg-purple-500 text-slate-900 shadow-xl/g, 'bg-purple-500 text-white shadow-xl');

// Ensure button text is visible
content = content.replace(/bg-purple-500 text-slate-900/g, 'bg-purple-600 text-white');

fs.writeFileSync('src/components/ProfileSettings.tsx', content);
