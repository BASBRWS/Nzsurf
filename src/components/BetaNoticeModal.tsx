import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Beaker, Sparkles, AlertTriangle, ShieldCheck, Check, Waves } from 'lucide-react';

interface BetaNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BetaNoticeModal({ isOpen, onClose }: BetaNoticeModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-marine-950/85 backdrop-blur-2xl modal-backdrop"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg glass-dark modal-dialog rounded-[2.5rem] border border-amber-500/30 shadow-2xl shadow-amber-500/10 p-6 sm:p-8 overflow-hidden z-10"
          >
            {/* Ambient Background Glows */}
            <div className="absolute -top-24 -right-24 w-56 h-56 bg-amber-500/20 rounded-full blur-[90px] pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-accent/20 rounded-full blur-[90px] pointer-events-none" />

            {/* Header Badge */}
            <div className="flex flex-col items-center text-center space-y-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl glass border border-amber-500/40 flex items-center justify-center shadow-xl shadow-amber-500/20 modal-icon-box">
                  <Beaker className="w-8 h-8 text-amber-400 animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-marine-950"></span>
                </span>
              </div>

              <div className="space-y-1.5 modal-header text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] uppercase tracking-[0.2em] font-bold">
                  <Sparkles className="w-3 h-3" />
                  Bèta Versie Actief
                </div>
                <h3 className="modal-title text-2xl sm:text-3xl font-black italic uppercase text-white tracking-tight">
                  Welkom bij NZS.pro
                </h3>
                <p className="text-xs font-mono text-white/50 uppercase tracking-widest">
                  Noordzee & Atlantische Surf Intelligence
                </p>
              </div>

              {/* Information Cards */}
              <div className="modal-body space-y-3 text-left w-full pt-2">
                <div className="modal-subcard glass p-4 rounded-2xl border border-white/10 flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-white font-mono uppercase">In Actieve Ontwikkeling</h4>
                    <p className="text-xs text-white/70 leading-relaxed">
                      De app zit momenteel in de testfase. De voorspelmodellen, getijberekeningen en AI-surfcoaching worden dagelijks geoptimaliseerd.
                    </p>
                  </div>
                </div>

                <div className="modal-subcard glass p-4 rounded-2xl border border-white/10 flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Waves className="w-4 h-4 text-accent" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-white font-mono uppercase">Veiligheid & Check</h4>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Gebruik de data als intelligente gids, maar controleer ter plaatse altijd zelf de zee-omstandigheden, muistromen en lokale vlaggen.
                    </p>
                  </div>
                </div>

                <div className="modal-subcard glass p-4 rounded-2xl border border-white/10 flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-white font-mono uppercase">Jouw Feedback Helpt</h4>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Spot-rapporten en feedback vanuit het veld worden direct verwerkt om de nauwkeurigheid voor alle surfers te verhogen.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={onClose}
                className="modal-btn-primary w-full mt-2 py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-marine-950 font-black italic uppercase tracking-wider text-sm transition-all shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Begrepen & Bèta Betreden</span>
                <Check className="w-4 h-4 text-marine-950 group-hover:scale-125 transition-transform" />
              </button>

              <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                Deze melding verschijnt alleen bij je eerste bezoek
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
