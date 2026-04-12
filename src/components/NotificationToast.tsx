import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Package, Truck, CheckCircle2, ShoppingBag } from 'lucide-react';
import { onForegroundMessage } from '../lib/notifications';
import type { MessagePayload } from 'firebase/messaging';

interface ToastData {
  id: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  'Order Placed':   <ShoppingBag className="w-5 h-5 text-yellow-600" />,
  'Order Received': <CheckCircle2 className="w-5 h-5 text-blue-600" />,
  'Packed':         <Package className="w-5 h-5 text-purple-600" />,
  'Dispatched':     <Truck className="w-5 h-5 text-orange-600" />,
  'Delivered':      <CheckCircle2 className="w-5 h-5 text-green-600" />,
};

export default function NotificationToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((payload: MessagePayload) => {
    const title = payload.notification?.title || 'Kari King';
    const body = payload.notification?.body || '';
    const status = payload.data?.status || '';

    const toast: ToastData = {
      id: Date.now().toString(),
      title,
      body,
      icon: STATUS_ICONS[status] || <Bell className="w-5 h-5 text-red-600" />,
    };

    setToasts(prev => [toast, ...prev].slice(0, 3)); // Max 3 toasts

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 5000);
  }, []);

  useEffect(() => {
    const unsubscribe = onForegroundMessage(addToast);
    return () => { unsubscribe?.(); };
  }, [addToast]);

  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="pointer-events-auto bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100 p-4 flex items-start gap-3 cursor-pointer"
            onClick={() => dismiss(toast.id)}
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
              {toast.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{toast.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{toast.body}</p>
            </div>

            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
              className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
