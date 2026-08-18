import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, Send } from 'lucide-react';
import { db, collection, addDoc, auth } from '../lib/firebase';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        text: feedback,
        userId: auth.currentUser?.uid || 'anonymous',
        userEmail: auth.currentUser?.email || 'anonymous',
        timestamp: new Date().toISOString(),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setFeedback('');
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Er is een fout opgetreden bij het verzenden van feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-marine-950/80 backdrop-blur-sm z-[100] modal-backdrop"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md z-[110] glass modal-dialog flex flex-col border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden"
          >
            <div className="modal-header flex items-center justify-between mb-6 pb-2 border-b border-white/10">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-accent" />
                <h3 className="modal-title text-xl font-bold text-white uppercase italic">Feedback</h3>
              </div>
              <button 
                onClick={onClose}
                className="modal-close-btn p-2 glass rounded-full hover:bg-white/10 transition-colors flex items-center justify-center"
                title="Sluiten"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {success ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-12 h-12 rounded-full glass bg-green-500/20 text-green-400 mx-auto flex items-center justify-center border border-green-500/20">
                  <Send className="w-6 h-6" />
                </div>
                <p className="text-white font-medium">Bedankt voor je feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                    Opmerking / Suggestie
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Wat kan er beter?"
                    className="modal-input w-full glass bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent min-h-[120px] resize-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !feedback.trim()}
                  className="modal-btn-primary w-full py-4 bg-accent text-marine-950 font-bold rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? 'Verzenden...' : 'Verstuur'}
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
