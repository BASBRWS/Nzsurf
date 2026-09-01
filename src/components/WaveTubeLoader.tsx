import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface WaveTubeLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'fullscreen';
  title?: string;
  subtitle?: string;
  className?: string;
}

export function WaveTubeLoader({ 
  size = 'md', 
  title = 'Condities laden...', 
  subtitle,
  className 
}: WaveTubeLoaderProps) {
  const isSmall = size === 'sm';
  const isLarge = size === 'lg' || size === 'fullscreen';
  const isFullscreen = size === 'fullscreen';

  const svgWidth = isSmall ? 64 : isLarge ? 140 : 96;
  const svgHeight = isSmall ? 48 : isLarge ? 105 : 72;

  const content = (
    <div className={cn(
      "flex flex-col items-center justify-center text-center select-none",
      isFullscreen ? "p-8 max-w-sm mx-auto bg-white/95 backdrop-blur-2xl rounded-3xl border border-slate-200 shadow-2xl" : "p-4",
      className
    )}>
      {/* Animated Wave Tube (Barrel) SVG */}
      <div className="relative flex items-center justify-center">
        {/* Ambient Glow behind the tube */}
        <motion.div 
          animate={{ 
            scale: [1, 1.15, 1],
            opacity: [0.35, 0.65, 0.35]
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute w-24 h-24 rounded-full bg-cyan-400/25 blur-xl pointer-events-none"
        />

        <svg 
          width={svgWidth} 
          height={svgHeight} 
          viewBox="0 0 160 120" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 overflow-visible"
        >
          <defs>
            {/* Deep ocean wave body gradient */}
            <linearGradient id="waveDeepGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0369a1" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            {/* Inner tube barrel hollow gradient */}
            <linearGradient id="tubeInsideGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#082f49" />
              <stop offset="60%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Foam crest curling gradient */}
            <linearGradient id="foamGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#e0f2fe" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Water base line gradient */}
            <linearGradient id="baseGradient" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* 1. Base Sea Water Level (Horizontal undulating line) */}
          <motion.path
            d="M 10 95 Q 40 92, 80 95 T 150 95"
            stroke="url(#baseGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{
              d: [
                "M 10 95 Q 40 92, 80 95 T 150 95",
                "M 10 95 Q 40 98, 80 93 T 150 95",
                "M 10 95 Q 40 92, 80 95 T 150 95"
              ]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* 2. Inner Barrel Shadow / Tube Cave Hollow */}
          <motion.path
            d="M 30 95 C 40 75, 65 35, 105 32 C 120 31, 130 42, 122 55 C 114 67, 95 72, 85 70 C 72 67, 65 78, 60 95 Z"
            fill="url(#tubeInsideGradient)"
            opacity="0.95"
            animate={{
              d: [
                "M 30 95 C 40 75, 65 35, 105 32 C 120 31, 130 42, 122 55 C 114 67, 95 72, 85 70 C 72 67, 65 78, 60 95 Z",
                "M 30 95 C 40 72, 63 33, 108 30 C 124 29, 133 44, 124 58 C 115 70, 93 74, 83 71 C 70 68, 63 79, 60 95 Z",
                "M 30 95 C 40 75, 65 35, 105 32 C 120 31, 130 42, 122 55 C 114 67, 95 72, 85 70 C 72 67, 65 78, 60 95 Z"
              ]
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* 3. Main Wave Wall & Barrel Face (Smooth sweeping curve rising and curling over) */}
          <motion.path
            d="M 15 95 C 35 90, 60 65, 95 28 C 120 2, 142 16, 132 40 C 122 62, 98 64, 88 58 C 80 53, 76 60, 80 66 C 88 74, 108 72, 120 56 C 132 40, 145 58, 125 78 C 105 98, 55 96, 15 95 Z"
            fill="url(#waveDeepGradient)"
            animate={{
              d: [
                "M 15 95 C 35 90, 60 65, 95 28 C 120 2, 142 16, 132 40 C 122 62, 98 64, 88 58 C 80 53, 76 60, 80 66 C 88 74, 108 72, 120 56 C 132 40, 145 58, 125 78 C 105 98, 55 96, 15 95 Z",
                "M 15 95 C 35 88, 58 62, 98 24 C 124 0, 146 14, 136 38 C 125 60, 100 62, 90 56 C 82 51, 78 58, 82 64 C 90 72, 110 70, 122 54 C 134 38, 147 56, 127 76 C 107 96, 55 96, 15 95 Z",
                "M 15 95 C 35 90, 60 65, 95 28 C 120 2, 142 16, 132 40 C 122 62, 98 64, 88 58 C 80 53, 76 60, 80 66 C 88 74, 108 72, 120 56 C 132 40, 145 58, 125 78 C 105 98, 55 96, 15 95 Z"
              ]
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* 4. Swirling Water Speedlines Inside the Barrel */}
          <motion.path
            d="M 50 82 Q 75 50, 110 32"
            stroke="#bae6fd"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="4 6"
            animate={{
              strokeDashoffset: [0, -40]
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          <motion.path
            d="M 65 88 Q 90 62, 120 44"
            stroke="#7dd3fc"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="3 5"
            animate={{
              strokeDashoffset: [0, -32]
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "linear"
            }}
          />

          {/* 5. Curling Foam Lip (The top pitching crest throwing over) */}
          <motion.path
            d="M 85 24 C 105 8, 135 6, 138 25 C 140 38, 128 50, 118 48 C 108 46, 102 36, 110 30 C 118 24, 128 32, 124 38 C 120 44, 114 42, 112 40"
            fill="none"
            stroke="url(#foamGradient)"
            strokeWidth="4.5"
            strokeLinecap="round"
            animate={{
              strokeWidth: [4, 5.5, 4],
              d: [
                "M 85 24 C 105 8, 135 6, 138 25 C 140 38, 128 50, 118 48 C 108 46, 102 36, 110 30 C 118 24, 128 32, 124 38 C 120 44, 114 42, 112 40",
                "M 87 21 C 108 5, 138 3, 141 23 C 143 36, 130 48, 120 46 C 110 44, 104 34, 112 28 C 120 22, 130 30, 126 36 C 122 42, 116 40, 114 38",
                "M 85 24 C 105 8, 135 6, 138 25 C 140 38, 128 50, 118 48 C 108 46, 102 36, 110 30 C 118 24, 128 32, 124 38 C 120 44, 114 42, 112 40"
              ]
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* 6. Glowing Foam Crest Highlight */}
          <motion.circle
            cx="128"
            cy="36"
            r="3.5"
            fill="#ffffff"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.8, 1, 0.8]
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* 7. Barrel Spit & Spray Particles (Blowing forward from the tube exit) */}
          <motion.circle
            cx="75"
            cy="68"
            r="1.8"
            fill="#ffffff"
            animate={{
              cx: [75, 45, 25],
              cy: [68, 62, 70],
              opacity: [0.9, 0.7, 0],
              scale: [0.8, 1.3, 0.2]
            }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
          <motion.circle
            cx="80"
            cy="74"
            r="1.4"
            fill="#e0f2fe"
            animate={{
              cx: [80, 52, 35],
              cy: [74, 76, 84],
              opacity: [1, 0.8, 0],
              scale: [1, 1.2, 0.3]
            }}
            transition={{
              duration: 1.3,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.35
            }}
          />
          <motion.circle
            cx="70"
            cy="64"
            r="1.2"
            fill="#ffffff"
            animate={{
              cx: [70, 42, 20],
              cy: [64, 58, 66],
              opacity: [0.8, 0.6, 0],
              scale: [0.7, 1.2, 0.2]
            }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.6
            }}
          />
        </svg>
      </div>

      {/* Accompanying Title & Subtitle */}
      {title && (
        <div className="mt-3 space-y-1">
          <p className={cn(
            "font-mono font-bold uppercase tracking-wider text-slate-900",
            isSmall ? "text-[10px]" : isLarge ? "text-sm" : "text-xs"
          )}>
            {title}
          </p>
          {subtitle && (
            <p className={cn(
              "font-mono text-slate-500 max-w-xs leading-relaxed",
              isSmall ? "text-[8px]" : "text-[10px]"
            )}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          {content}
        </motion.div>
      </div>
    );
  }

  return content;
}
