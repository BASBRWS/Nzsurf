import React from 'react';
import { Waves } from 'lucide-react';

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img 
        src="/IMG_20260508_120609.png" 
        alt="Noordzeesurf Logo" 
        className="h-10 md:h-12 w-auto transition-transform hover:scale-105"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
