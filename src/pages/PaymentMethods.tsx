import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, CreditCard, Banknote, Smartphone, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

type PaymentMethodType = 'upi' | 'card';

export default function PaymentMethods() {
  const navigate = useNavigate();
  // Simply mock local state for now until Razorpay is integrated. Phase 7: Show UI only.
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('upi');

  const methods = [
    {
      id: 'upi' as PaymentMethodType,
      icon: Smartphone,
      title: 'UPI Payment',
      desc: 'Google Pay, PhonePe, Paytm',
      badge: 'Recommended'
    },
    {
      id: 'card' as PaymentMethodType,
      icon: CreditCard,
      title: 'Credit/Debit Card',
      desc: 'Visa, MasterCard, RuPay',
    }
  ];

  return (
    <div className="bg-gray-50 min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-20 shadow-sm border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-50 text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-black text-gray-900 leading-none">Payment Methods</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6 mt-2">
        <div className="bg-blue-50 text-blue-800 p-4 rounded-2xl border border-blue-100/50 text-sm font-bold leading-relaxed shadow-sm">
          Select your preferred default payment method for faster checkout. (Real payments via Razorpay will be activated soon).
        </div>

        <div className="space-y-3">
          {methods.map((method) => (
            <motion.button
              whileTap={{ scale: 0.98 }}
              key={method.id}
              onClick={() => setSelectedMethod(method.id)}
              className={cn(
                "w-full bg-white rounded-2xl p-4 flex items-center gap-4 border-2 transition-all shadow-sm text-left relative overflow-hidden",
                selectedMethod === method.id 
                  ? "border-[#8B0000] shadow-md shadow-[#8B0000]/10" 
                  : "border-gray-100 hover:border-gray-200"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                selectedMethod === method.id ? "bg-[#8B0000]/10 text-[#8B0000]" : "bg-gray-50 text-gray-400"
              )}>
                <method.icon className="w-6 h-6" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-gray-900 text-[15px]">{method.title}</h3>
                  {method.badge && (
                    <span className="bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm">
                      {method.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">{method.desc}</p>
              </div>

              <div className="shrink-0 flex items-center justify-center w-6 h-6">
                 {selectedMethod === method.id ? (
                   <CheckCircle2 className="w-6 h-6 text-[#8B0000]" />
                 ) : (
                   <div className="w-5 h-5 rounded-full border-2 border-gray-200" />
                 )}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
