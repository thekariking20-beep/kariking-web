import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, MapPin, Phone, CreditCard, Wallet, QrCode, Zap, Coins, X, CheckCircle2, AlertCircle, Sparkles, WifiOff, Loader2 } from 'lucide-react';
import type { Order } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useAddress } from '../context/AddressContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { formatQty } from '../lib/units';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { cn } from '../lib/utils';
import { PartyPopper } from 'lucide-react';
import LocationPickerModal from '../components/location/LocationPickerModal';
import { checkOrderLimit } from '../lib/rateLimit';

// ─── UPI QR Payment Config ───────────────────────────────────────────────
const UPI_ID = '45105944505@sbi'; 
const UPI_NAME = 'KARIKING';

// Static QR code image — drop your bank QR image at: src/assets/upi-qr.png
// Then uncomment the import below:
// import upiQrImage from '../assets/upi-qr.png';
const upiQrImage: string | null = null; // Set to imported image when ready

// ─── Loading Stage Messages ─────────────────────────────────────────────
const LOADING_STAGES = [
  'Securing your order...',
  'Verifying items & prices...',
  'Confirming payment method...',
  'Almost done...',
];

export default function Cart() {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const { user, refreshUser } = useAuth();
  const { selectedAddress } = useAddress();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Checkout reads directly from SSOT context
  const address = selectedAddress?.fullAddress || '';
  const phone = user?.phone || '';
  
  const [useCoins, setUseCoins] = useState(false);
  const [error, setError] = useState('');
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Order['paymentMethod']>('qr');
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrOrderId, setQrOrderId] = useState('');
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState('');
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  // Ref to hold pending checkout data for network recovery
  const pendingCheckoutRef = useRef<any>(null);

  const { width, height } = useWindowSize();

  const COIN_VALUE = 20;
  const availableCoins = user?.coins || 0;
  const maxCoinsToUse = Math.min(availableCoins, Math.floor(totalPrice / COIN_VALUE));
  const coinsBeingUsed = useCoins ? maxCoinsToUse : 0;
  const discountAmount = coinsBeingUsed * COIN_VALUE;
  
  const deliveryFee = totalPrice >= 500 || totalPrice === 0 ? 0 : 40;
  const finalTotal = Math.max(0, totalPrice - discountAmount) + deliveryFee;
  const canPayFullyWithCoins = discountAmount >= totalPrice + deliveryFee;

  // formatQty imported from lib/units

  // ─── Network Status Listener ──────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
      // Auto-retry pending checkout when connection restores
      if (pendingCheckoutRef.current) {
        handleCheckout();
      }
    };
    const goOffline = () => setIsOffline(true);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Loading Stage Animation ──────────────────────────────────────────
  useEffect(() => {
    if (!loading) { setLoadingStage(0); return; }
    const interval = setInterval(() => {
      setLoadingStage(prev => (prev + 1) % LOADING_STAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  // ─── Direct UPI Payment Architecture ──────────────────────────────────
  // Razorpay has been removed. All payments are verified via UTR on direct UPI.

  const getValidationError = () => {
    if (items.length === 0) return 'Cart empty';
    if (!address) return 'Address missing. Please set your delivery location.';
    if (!phone || phone.length < 10) return 'Valid phone number required.';
    if (!paymentMethod && !(canPayFullyWithCoins && useCoins)) return 'Select a payment method.';
    if (finalTotal <= 0 && !(canPayFullyWithCoins && useCoins)) return 'Order total must be greater than 0.';
    return '';
  };

  const validationError = getValidationError();

  // ─── Core Checkout Handler (Failure-Proof) ────────────────────────────
  const handleCheckout = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    // Phase 2: Network-aware — check BEFORE attempting
    if (!navigator.onLine) {
      setIsOffline(true);
      // Save intent so we can auto-retry when back online
      pendingCheckoutRef.current = true;
      return; // The online listener will call handleCheckout automatically
    }

    const rateCheck = checkOrderLimit();
    if (!rateCheck.allowed) {
      setError(rateCheck.error);
      return;
    }

    // Determine effective payment method
    let effectiveMethod = paymentMethod;
    if (canPayFullyWithCoins && useCoins) {
      effectiveMethod = 'coins';
    }

    setLoading(true);
    setError('');

    // Phase 5: Idempotent key — reuse across retries, never duplicate
    let iKey = idempotencyKey;
    if (!iKey) {
      iKey = crypto.randomUUID();
      setIdempotencyKey(iKey);
    }

    try {
      const createOrderFn = httpsCallable(functions, 'createOrder');
      
      // Phase 4: Silent auto-retry with exponential backoff (up to 5 attempts)
      let response;
      const MAX_RETRIES = 5;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          response = await createOrderFn({
            items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
            address,
            phone,
            useCoins,
            coinsToUse: coinsBeingUsed,
            paymentMethod: effectiveMethod,
            deliveryFee,
            idempotencyKey: iKey
          });
          break; // Success — exit retry loop
        } catch (err: any) {
          // If it's a validation error from our backend, don't retry
          const code = err?.code || '';
          if (['invalid-argument', 'failed-precondition', 'permission-denied', 'unauthenticated'].includes(code)) {
            throw err; // Business logic error — show to user
          }
          // Network/timeout error — silently retry
          if (attempt === MAX_RETRIES) {
            // All retries exhausted — save for network recovery
            pendingCheckoutRef.current = true;
            throw err;
          }
          // Exponential backoff: 1s, 2s, 4s, 8s
          await new Promise(res => setTimeout(res, Math.min(1000 * Math.pow(2, attempt - 1), 8000)));
        }
      }

      const data = response?.data as { success: boolean; orderId: string; finalAmount: number } | undefined;
      
      if (!data || !data.success) {
        throw new Error('order-creation-failed');
      }

      // Phase 9: Success guarantee — always navigate to next step
      pendingCheckoutRef.current = null; // Clear pending

      // Direct UPI / QR Flow
      if (effectiveMethod === 'qr' && data.finalAmount > 0) {
        setQrOrderId(data.orderId);
        setShowQrModal(true);
        setLoading(false);
        return;
      }

      // Success — coins-only completed (if amount was 0)
      if (effectiveMethod === 'coins' || data.finalAmount === 0) {
        await refreshUser();
        clearCart();
        setIdempotencyKey('');
        setOrderPlaced(true);
        setTimeout(() => {
          navigate('/orders');
        }, 3000);
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      // Phase 8: No generic errors — map to specific messages
      const code = err?.code || '';
      const msg = err?.message || '';
      if (code === 'invalid-argument') {
        setError(msg || 'Some order details are invalid. Please check your cart.');
      } else if (code === 'failed-precondition') {
        setError(msg || 'A product in your cart is no longer available.');
      } else if (code === 'unauthenticated') {
        navigate('/login');
      } else if (!navigator.onLine) {
        setIsOffline(true);
        pendingCheckoutRef.current = true;
        // Will auto-retry when connection restores
      } else {
        // Exhausted all retries but still online — very rare
        setError('Taking longer than expected. Please try once more.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── UTR Submit Handler (Server-Validated) ─────────────────────────────
  const handleQrConfirm = async () => {
    // Strict 12-digit numeric validation
    const trimmedUtr = utrInput.trim();
    if (!/^\d{12}$/.test(trimmedUtr)) {
      setUtrError('UTR must be exactly 12 digits (numbers only)');
      return;
    }
    
    setLoadingVerify(true);
    setUtrError('');
    
    try {
      // Call server-side function for validation + global uniqueness check
      const submitUtrFn = httpsCallable(functions, 'submitUtr');
      await submitUtrFn({ orderId: qrOrderId, utrNumber: trimmedUtr });
      
      setShowQrModal(false);
      await refreshUser();
      clearCart();
      setOrderPlaced(true);
      setTimeout(() => {
        navigate('/orders');
      }, 3000);
    } catch (err: any) {
      console.error(err);
      // Extract Firebase error message
      const msg = err?.message || '';
      if (msg.includes('already been used')) {
        setUtrError('This UTR has already been used for another order.');
      } else if (msg.includes('12 digits')) {
        setUtrError('UTR must be exactly 12 digits.');
      } else {
        setUtrError('Verification failed. Please check UTR and try again.');
      }
    } finally {
      setLoadingVerify(false);
    }
  };

  // ─── Empty Cart State ──────────────────────────────────────────────────
  if (items.length === 0 && !orderPlaced) {
    return (
      <div className="min-h-[60vh] flex flex-center flex-col items-center justify-center text-center px-4">
        <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
        <p className="text-gray-500 mb-8 max-w-xs">Looks like you haven't added anything to your cart yet.</p>
        <Link
          to="/products"
          className="ripple-btn bg-premium-gradient text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-all shadow-[0_4px_15px_rgba(122,0,0,0.3)] hover:shadow-[0_8px_25px_rgba(122,0,0,0.4)] active:scale-95"
        >
          Browse Products <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    );
  }

  // ─── Order Confirmed State ────────────────────────────────────────────
  if (orderPlaced) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Confetti width={width} height={height} recycle={false} numberOfPieces={600} gravity={0.3} colors={['#7A0000', '#FF2D2D', '#FFD700', '#ffffff', '#000000']} />
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-[0_10px_30px_rgba(34,197,94,0.3)]">
          <PartyPopper className="w-12 h-12" />
        </motion.div>
        <h2 className="text-3xl font-black text-gray-900 mb-2 drop-shadow-sm">Order Confirmed!</h2>
        <p className="text-gray-500 max-w-sm mb-8 font-medium">
          {paymentMethod === 'qr' 
            ? 'Your payment is being verified. We\'ll notify you once confirmed!'
            : 'Thank you for choosing Kari King. Redirecting to your orders...'}
        </p>
      </div>
    );
  }

  // ─── Main Cart View ───────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Shopping Cart</h1>
        
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              key={item.productId}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="premium-card p-4 flex items-center gap-4 group"
            >
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 group-hover:text-[#7A0000] transition-colors">{item.name}</h3>
                <p className="text-sm font-black text-transparent bg-premium-gradient bg-clip-text">₹{item.sellingPrice}</p>
              </div>
              
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1 shadow-inner border border-gray-100">
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity - (item.stepSize || 1))}
                  className="text-gray-600 hover:bg-white rounded p-1 transition-colors hover:shadow-sm"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex flex-col items-center min-w-[36px]">
                  <span className="font-black text-gray-900 leading-none mt-1">{formatQty(item.quantity, item.unitType)}</span>
                </div>
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity + (item.stepSize || 1))}
                  className="text-gray-600 hover:bg-white rounded p-1 transition-colors hover:shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="text-right min-w-[80px]">
                <p className="font-black text-gray-900">₹{Math.round((item.quantity / (item.baseWeight || 1)) * item.sellingPrice)}</p>
              </div>
              
              <button
                onClick={() => removeFromCart(item.productId)}
                className="text-gray-400 hover:text-[#7A0000] p-2 transition-colors hover:bg-red-50 rounded-xl"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="space-y-6">
        <div className="premium-card p-6 sticky top-24">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
          
          {totalPrice > 0 && totalPrice < 500 && (
            <div className="bg-orange-50/80 border border-orange-100 p-4 rounded-xl mb-6 text-center shadow-sm">
              <p className="text-orange-800 font-bold text-sm leading-relaxed">
                Add <span className="text-[#7A0000] border-b-2 border-red-200/50">₹{500 - totalPrice}</span> more for <span className="font-black pt-1 block text-lg uppercase tracking-wider text-green-600">🎉 FREE delivery!</span>
              </p>
            </div>
          )}

          <div className="space-y-4 mb-8">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium">₹{Math.round(totalPrice)}</span>
            </div>

            {/* ─── Kari Coins Section ──────────────────────────── */}
            {availableCoins > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-4 rounded-xl space-y-3 border border-amber-100/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Use Kari Coins</span>
                  </div>
                  <button
                    onClick={() => setUseCoins(!useCoins)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      useCoins ? "bg-gradient-to-r from-amber-400 to-yellow-500 shadow-md" : "bg-gray-300"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm",
                      useCoins ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-500">
                    Available: <span className="font-bold text-amber-700">{availableCoins} coins</span> (₹{availableCoins * COIN_VALUE} value)
                  </p>
                  <p className="text-[10px] text-gray-400">1 coin = ₹{COIN_VALUE}</p>
                </div>
                {useCoins && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex justify-between text-sm font-bold border-t border-amber-200/50 pt-2"
                  >
                    <span className="text-amber-700">Coin Discount ({coinsBeingUsed} coins)</span>
                    <span className="text-green-600">-₹{discountAmount}</span>
                  </motion.div>
                )}
                {useCoins && canPayFullyWithCoins && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="text-[10px] font-black text-green-700 bg-green-100 px-2 py-1 rounded-lg text-center uppercase tracking-widest"
                  >
                    ✨ Fully payable with coins — no extra payment needed!
                  </motion.div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center text-gray-600">
              <span>Delivery Fee</span>
              {deliveryFee === 0 ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-green-700 bg-green-100 px-2 py-1 rounded">FREE</span>
              ) : (
                <span className="font-medium">₹{deliveryFee}</span>
              )}
            </div>

            {/* ─── Total Amount — Premium Card ─────────────────── */}
            <div className="relative mt-2 -mx-2 px-5 py-4 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(255,45,45,0.4) 0%, transparent 60%)' }} />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Total Amount</p>
                  <p className="text-3xl font-black text-white" style={{ textShadow: '0 2px 10px rgba(255,45,45,0.3)' }}>
                    ₹{Math.round(finalTotal * 100) / 100}
                  </p>
                </div>
                <div className="text-right">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FF2D2D 0%, #7A0000 100%)', boxShadow: '0 4px 15px rgba(255,45,45,0.4)' }}>
                    <ShoppingBag className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
              {items.length > 0 && (
                <p className="relative text-[10px] text-gray-400 mt-1">
                  {items.length} item{items.length > 1 ? 's' : ''} • {deliveryFee === 0 ? 'Free delivery ✨' : `₹${deliveryFee} delivery`}
                </p>
              )}
            </div>
          </div>

          {/* ─── Delivery Details ──────────────────────────── */}
          <div className="space-y-4 mb-8">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#7A0000]" /> Delivering To
              </label>
              <div
                onClick={() => setIsLocationOpen(true)}
                className={cn(
                  "cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center justify-between bg-white group",
                  address ? "border-green-100 shadow-sm" : "border-red-100 bg-red-50"
                )}
              >
                <div className="flex-1 pr-4">
                  {address ? (
                    <>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">{selectedAddress?.name || 'Home'}</span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm mb-0.5">{selectedAddress?.street || address.split(',')[0]}</h4>
                      <p className="text-xs text-gray-500">{selectedAddress?.city || ''} {selectedAddress?.pincode ? `- ${selectedAddress.pincode}` : ''}</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-red-600">Please set your delivery location</p>
                  )}
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-red-600 group-hover:text-red-700">
                  {address ? 'Change' : 'Set'}
                </span>
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#7A0000]" /> Contact Number
              </label>
              <input
                type="tel"
                className="w-full p-3 border border-gray-200 rounded-xl outline-none text-sm shadow-inner bg-gray-50/70 text-gray-500 cursor-not-allowed font-medium"
                placeholder="Select an address to load contact"
                value={phone}
                readOnly
              />
              <p className="text-[10px] text-gray-400 mt-2 font-medium">To update contact number, edit the address in Location settings.</p>
            </div>
          </div>

          {/* ─── Payment Method Selector ──────────────────────── */}
          {!(canPayFullyWithCoins && useCoins) && (
            <div className="mb-6">
              <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#7A0000]" /> Payment Method
              </label>
              <div className="space-y-2 mt-3">


                {/* UPI QR — Manual Verification */}
                <button
                  onClick={() => setPaymentMethod('qr')}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left",
                    paymentMethod === 'qr'
                      ? "border-blue-500 bg-blue-50/50 shadow-sm"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    paymentMethod === 'qr' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                  )}>
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">UPI QR Payment</p>
                    <p className="text-[10px] text-gray-400">Scan & pay — verified by admin</p>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                    paymentMethod === 'qr' ? "border-blue-500 bg-blue-500" : "border-gray-300"
                  )}>
                    {paymentMethod === 'qr' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ─── Offline Banner ─────────────────────────────── */}
          <AnimatePresence>
            {isOffline && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-orange-50 border border-orange-200 p-4 rounded-xl mb-4 flex items-center gap-3 shadow-sm"
              >
                <WifiOff className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-orange-800">You are offline</p>
                  <p className="text-[10px] text-orange-600">Your order will be placed automatically when internet reconnects.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Validation Error (only user-actionable errors) ── */}
          <AnimatePresence>
            {(error || validationError) && !isOffline && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="bg-red-50 text-[#7A0000] p-3 rounded-lg mb-4 text-xs font-bold border border-red-100 flex items-center gap-2 shadow-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error || validationError}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleCheckout}
            disabled={loading || !!validationError || isOffline}
            className="ripple-btn w-full bg-premium-gradient text-white py-4 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_rgba(122,0,0,0.3)] hover:shadow-[0_12px_25px_rgba(122,0,0,0.4)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {LOADING_STAGES[loadingStage]}
              </span>
            ) : isOffline ? (
              <span className="flex items-center gap-2">
                <WifiOff className="w-5 h-5" />
                Waiting for connection...
              </span>
            ) : (
              <>
                {canPayFullyWithCoins && useCoins 
                  ? `Pay with Coins — Place Order` 
                  : `Pay ₹${finalTotal} — Place Order`}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── QR Payment Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {showQrModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl max-w-[380px] w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-3">
                  <QrCode className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-black text-gray-900">Scan & Pay</h3>
                <p className="text-sm text-gray-500 mt-1">Pay ₹{finalTotal} via any UPI app</p>
              </div>

              {/* QR Code — static image or API-generated fallback */}
              <div className="bg-white rounded-2xl p-5 mb-4 flex items-center justify-center border-2 border-gray-100 shadow-inner">
                <img
                  src={upiQrImage || `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${finalTotal}&cu=INR&tn=KariKing_Order_${qrOrderId.slice(-6)}`)}`}
                  alt="UPI QR Code"
                  className="w-[240px] h-[240px] rounded-xl object-contain"
                />
              </div>

              {/* Amount highlight */}
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-center shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Amount to Pay</p>
                <p className="text-3xl font-black text-green-700 my-1">₹{finalTotal}</p>
              </div>

              {/* Mobile Deep Links */}
              <div className="mb-5 sm:hidden grid grid-cols-3 gap-2">
                <a
                  href={`gpay://upi/pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${finalTotal}&cu=INR`}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-colors"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg" alt="GPay" className="h-4 object-contain" />
                  <span className="text-[9px] font-bold text-gray-600 mt-1">GPay</span>
                </a>
                <a
                  href={`phonepe://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${finalTotal}&cu=INR`}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-colors"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/6/60/PhonePe_Logo.svg/1200px-PhonePe_Logo.svg.png" alt="PhonePe" className="h-4 object-contain" />
                  <span className="text-[9px] font-bold text-gray-600 mt-1">PhonePe</span>
                </a>
                <a
                  href={`paytmmp://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${finalTotal}&cu=INR`}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-colors"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/cd/Paytm_logo.png" alt="Paytm" className="h-3.5 object-contain" />
                  <span className="text-[9px] font-bold text-gray-600 mt-1">Paytm</span>
                </a>
              </div>
              <div className="hidden sm:block text-center mb-4">
                <p className="text-xs text-gray-400 font-medium">Scan code with any UPI app</p>
                <p className="font-bold text-gray-900 text-sm select-all mt-1">{UPI_ID}</p>
              </div>

              {/* UTR Input Field */}
              <div className="mb-5 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                  Enter 12-Digit UTR Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 312345678901"
                  className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm text-center tracking-widest"
                  value={utrInput}
                  onChange={(e) => {
                    setUtrInput(e.target.value.replace(/\D/g, ''));
                    setUtrError('');
                  }}
                  maxLength={12}
                />
                {utrError && <p className="text-[10px] text-red-600 font-bold mt-2 text-center">{utrError}</p>}
              </div>

              <button
                onClick={handleQrConfirm}
                disabled={loadingVerify || utrInput.length !== 12}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none active:scale-95"
              >
                {loadingVerify ? 'Submitting...' : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Submit UTR & Confirm
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LocationPickerModal
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
      />
    </div>
  );
}
