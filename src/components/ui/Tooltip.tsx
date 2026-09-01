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
              "absolute z-[100] w-56 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-xs leading-relaxed text-slate-100 font-medium pointer-events-none",
              positionClasses[position]
            )}
          >
            <div className="relative">
              {content}
            </div>
            {/* Arrow */}
            <div className={cn(
              "absolute w-2 h-2 bg-slate-900 border-slate-700 rotate-45",
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
      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-cyan-700 transition-colors inline-block" />
    </Tooltip>
  );
}
