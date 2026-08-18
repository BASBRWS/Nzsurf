import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Navigation, ShieldCheck, X } from 'lucide-react';

interface LocationPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGrant: () => void;
  reason: string;
}

export function LocationPermissionModal({ isOpen, onClose, onGrant, reason }: LocationPermissionModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-marine-950/80 backdrop-blur-xl modal-backdrop"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md glass-dark modal-dialog rounded-[2.5rem] border border-white/10 shadow-2xl p-6 sm:p-8 overflow-hidden"
          >
            {/* Visual elements */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/20 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-[80px] pointer-events-none" />

            <div className="modal-header flex justify-between items-center mb-4 pb-2 border-b border-white/10">
              <div className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] font-bold">
                Locatie Toegang
              </div>
              <button onClick={onClose} className="modal-close-btn p-2 glass rounded-full hover:bg-white/10 transition-colors flex items-center justify-center">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="modal-body flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-3xl glass border border-accent/30 flex items-center justify-center shadow-lg shadow-accent/10 modal-icon-box">
                <Navigation className="w-8 h-8 text-accent animate-pulse" />
              </div>

              <div className="space-y-2">
                <h3 className="modal-title text-2xl font-black italic uppercase text-white tracking-tight">Locatie Toegang Vereist</h3>
                <p className="text-[10px] font-mono text-accent uppercase tracking-[0.3em]">Field Intelligence Protocol</p>
              </div>

              <p className="text-sm font-medium text-white/60 leading-relaxed px-4">
                {reason}
              </p>

              <div className="grid grid-cols-1 gap-4 w-full">
                <div className="modal-subcard glass p-4 rounded-2xl border border-white/5 flex items-center gap-4 text-left">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-white mb-1">Privacy Gegarandeerd</h4>
                    <p className="text-[9px] font-mono text-white/30 uppercase leading-tight">Jouw coördinaten worden alleen lokaal gebruikt voor afstandsberekening.</p>
                  </div>
                </div>

                <div className="modal-subcard glass p-4 rounded-2xl border border-white/5 flex items-center gap-4 text-left">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-white mb-1">Precisie Analyse</h4>
                    <p className="text-[9px] font-mono text-white/30 uppercase leading-tight">Nodig om de meest accurate match score voor jouw huidige positie te berekenen.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={onGrant}
                className="modal-btn-primary w-full h-14 bg-accent text-marine-950 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-accent/20 cursor-pointer"
              >
                Toestemming Verlenen
              </button>

              <button
                onClick={onClose}
                className="text-[10px] font-mono uppercase text-white/40 tracking-widest hover:text-white transition-colors cursor-pointer"
              >
                Misschien later
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
