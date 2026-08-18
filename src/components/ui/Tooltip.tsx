import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, className, position = 'top' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: position === 'top' ? 4 : -4 }}
            className={cn(
              "absolute z-[100] w-48 p-3 bg-marine-900 border border-white/10 rounded-xl shadow-2xl text-[10px] leading-relaxed text-white/80 font-medium pointer-events-none",
              positionClasses[position]
            )}
          >
            <div className="absolute inset-0 bg-accent/5 rounded-xl pointer-events-none" />
            <div className="relative">
              {content}
            </div>
            {/* Arrow */}
            <div className={cn(
              "absolute w-2 h-2 bg-marine-900 border-white/10 rotate-45",
              position === 'top' && "bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b",
              position === 'bottom' && "top-[-5px] left-1/2 -translate-x-1/2 border-l border-t",
              position === 'left' && "right-[-5px] top-1/2 -translate-y-1/2 border-r border-t",
              position === 'right' && "left-[-5px] top-1/2 -translate-y-1/2 border-l border-b",
            )} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TooltipIcon({ content, className }: { content: string; className?: string }) {
  return (
    <Tooltip content={content} className={className}>
      <Info className="w-3 h-3 text-white/30 cursor-help hover:text-accent transition-colors" />
    </Tooltip>
  );
}
