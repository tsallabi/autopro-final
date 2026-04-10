import React from 'react';
import { AlertTriangle, X, CheckCircle2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AlertModalProps {
  isOpen: boolean;
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({ isOpen, message, type = 'error', onClose }) => {
  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className={`p-6 flex flex-col items-center text-center ${
              type === 'error' ? 'bg-red-50' : type === 'success' ? 'bg-green-50' : 'bg-blue-50'
            }`}>
              <div className={`p-3 rounded-full mb-4 ${
                type === 'error' ? 'bg-red-100 text-red-600' : 
                type === 'success' ? 'bg-green-100 text-green-600' : 
                'bg-blue-100 text-blue-600'
              }`}>
                {type === 'error' && <AlertTriangle className="w-8 h-8" />}
                {type === 'success' && <CheckCircle2 className="w-8 h-8" />}
                {type === 'info' && <Info className="w-8 h-8" />}
              </div>
              
              <h3 className={`text-xl font-bold mb-2 ${
                type === 'error' ? 'text-red-900' : 
                type === 'success' ? 'text-green-900' : 
                'text-blue-900'
              }`}>
                {type === 'error' ? 'تنبيه!' : type === 'success' ? 'نجاح' : 'معلومة'}
              </h3>
              
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                {message}
              </p>
            </div>
            
            <div className="p-4 bg-white flex justify-center">
              <button
                onClick={onClose}
                className={`px-8 py-2.5 rounded-xl font-bold transition-all shadow-lg ${
                  type === 'error' ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20' : 
                  type === 'success' ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20' : 
                  'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                }`}
              >
                إغلاق
              </button>
            </div>
            
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
