const fs = require('fs');
let content = fs.readFileSync('src/components/TacticalBottomNav.tsx', 'utf8');

// Add community to TacticalTab
content = content.replace(/export type TacticalTab = 'forecast' \| 'weather' \| 'spots' \| 'window' \| 'ai' \| 'profile';/, "export type TacticalTab = 'forecast' | 'weather' | 'spots' | 'window' | 'ai' | 'profile' | 'community';");

// Add community to navItems
const navItemsRegex = /const navItems:[\s\S]*?\];/;
const newNavItems = `const navItems: { id: TacticalTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'forecast', label: 'SWELL', icon: Waves },
    { id: 'weather', label: 'WEER', icon: Wind },
    { id: 'spots', label: 'SPOTS', icon: Compass },
    { id: 'community', label: 'SOCIAL', icon: MessageSquare },
    { id: 'window', label: 'VENSTER', icon: Clock },
    { id: 'ai', label: 'AI COACH', icon: Sparkles },
    { id: 'profile', label: 'ME', icon: User }
  ];`;
content = content.replace(navItemsRegex, newNavItems);

// Change slice(0, 3) to slice(0, 3) and slice(3) to slice(3) -> wait, there are 7 items now. So left is 3, right is 4.
// Wait, the nav is flexible. Let's just do slice(0, 3) and slice(3).
// Actually, let's do 4 and 3.
content = content.replace(/navItems\.slice\(0, 3\)/g, 'navItems.slice(0, 3)');
content = content.replace(/navItems\.slice\(3\)/g, 'navItems.slice(3)');

fs.writeFileSync('src/components/TacticalBottomNav.tsx', content);
