import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { COIN_VALUE, COIN_EARN_THRESHOLD, formatCoinUsage } from '../config/coins';
import { useNavigate, Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, MapPin, Phone, CreditCard, Wallet, QrCode as QrCodeIcon, Zap, Coins, X, CheckCircle2, AlertCircle, Sparkles, WifiOff, Loader2, Smartphone, Tag, Banknote } from 'lucide-react';
import type { Order } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { resolveAddressCoordinates, useAddress } from '../context/AddressContext';
import { formatDistanceKm, haversineDistanceKm } from '../lib/geo';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../firebase';
import { doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { formatQty } from '../lib/units';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { cn } from '../lib/utils';
import { PartyPopper } from 'lucide-react';
import LocationPickerModal from '../components/location/LocationPickerModal';
import { checkOrderLimit } from '../lib/rateLimit';
import QRCode from 'qrcode';
import { validateCoupon } from '../lib/couponValidator';

// ─── UPI QR Payment Config ───────────────────────────────────────────────
const UPI_ID = '45105944505@sbi'; 
const UPI_NAME = 'KARIKING';

// ─── Mobile Detection ───────────────────────────────────────────────────
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function Cart() {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart, refreshPrices } = useCart();
  const { user, refreshUser } = useAuth();
  const { selectedAddress, systemSettings, storeLocation } = useAddress();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // PATCH 9: Refresh product prices from Firestore when Cart opens
  useEffect(() => {
    refreshPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
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
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [orderCreating, setOrderCreating] = useState(false);

  // ─── Coupon State ─────────────────────────────────────────────────────
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number, id?: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Ref to hold pending checkout data for network recovery
  const pendingCheckoutRef = useRef<any>(null);
  // Ref to hold order creation promise so UTR submission can await it
  const orderPromiseRef = useRef<Promise<string> | null>(null);
  // Double-click prevention guard
  const checkoutInProgressRef = useRef(false);

  const { width, height } = useWindowSize();

  const availableCoins = user?.coins || 0;
  
  const couponDiscount = appliedCoupon?.discount || 0;
  const subtotalAfterCoupon = Math.max(0, totalPrice - couponDiscount);
  
  // Allow coins to cover up to 100% of the remaining subtotal, ensuring final payable > ₹1
  const maxRupeesForCoins = Math.max(0, subtotalAfterCoupon - 1);
  const maxCoinsByOrderTotal = Math.floor(maxRupeesForCoins / COIN_VALUE);
  const maxCoinsToUse = Math.min(availableCoins, maxCoinsByOrderTotal);
  
  const coinsBeingUsed = useCoins ? maxCoinsToUse : 0;
  const coinDiscount = coinsBeingUsed * COIN_VALUE;

  // Dynamic Delivery & Order Settings from Admin -> Order Settings (`settings/system`)
  const configuredDeliveryFee = Math.max(0, systemSettings.orders.deliveryFee ?? 40);
  const freeDeliveryThreshold = Math.max(0, systemSettings.orders.freeDeliveryThreshold ?? 0);
  const minOrderAmount = Math.max(0, systemSettings.orders.minOrderAmount ?? 0);
  const deliveryEnabled = systemSettings.delivery.enabled !== false;

  const qualifiesForFreeDelivery =
    totalPrice > 0 && freeDeliveryThreshold > 0 && totalPrice >= freeDeliveryThreshold;

  const discountAmount = coinDiscount + couponDiscount;
  const deliveryFee = totalPrice === 0 || qualifiesForFreeDelivery ? 0 : configuredDeliveryFee;
  const deliverySavings = qualifiesForFreeDelivery ? configuredDeliveryFee : 0;

  const finalTotal = Math.round((Math.max(0, totalPrice - discountAmount) + deliveryFee) * 100) / 100;
  const totalSavings = discountAmount + deliverySavings;
  const canPayFullyWithCoins = false; // We enforce minimum payable > 1, so full payment with coins alone is not possible

  // Delivery Address Coordinates & Distance (Non-blocking warning if beyond store maxRadiusKm)
  const deliveryCoords = useMemo(() => resolveAddressCoordinates(selectedAddress), [selectedAddress]);
  const deliveryDistanceKm = useMemo(() => {
    if (!deliveryCoords) return null;
    return haversineDistanceKm(deliveryCoords.lat, deliveryCoords.lng, storeLocation.lat, storeLocation.lng);
  }, [deliveryCoords, storeLocation.lat, storeLocation.lng]);
  const isBeyondStoreRadius =
    deliveryDistanceKm !== null && deliveryDistanceKm > storeLocation.maxRadiusKm;

  // ─── Pre-computed UPI string (instant, no API call) ───────────────────
  const upiAmount = useMemo(() => (Math.round(finalTotal * 100) / 100).toFixed(2), [finalTotal]);
  const upiString = useMemo(() => 
    `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${upiAmount}&cu=INR&tn=KariKing_Order`,
    [upiAmount]
  );

  // ─── Instant QR Generation (client-side, zero latency) ────────────────
  useEffect(() => {
    if (finalTotal > 0) {
      QRCode.toDataURL(upiString, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M'
      }).then(url => setQrDataUrl(url)).catch(() => {});
    }
  }, [upiString, finalTotal]);

  // ─── Network Status Listener ──────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
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

  // ─── Coupon Handlers ──────────────────────────────────────────────────
  const handleApplyCoupon = async () => {
    if (!user || !couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const result = await validateCoupon(couponInput.trim(), totalPrice, user);
      if (result.valid) {
        setAppliedCoupon({ code: couponInput.trim().toUpperCase(), discount: result.discount, id: result.coupon?.id || '' });
        setCouponInput('');
        setCouponError('');
      } else {
        setCouponError(result.error);
      }
    } catch (e: any) {
      if (e?.code === 'unavailable') {
        setCouponError('Network error. Please check your connection and try again.');
      } else {
        setCouponError('Unable to verify coupon at this time. Please try again later.');
      }
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
  };

  // ─── Direct UPI Payment Architecture ──────────────────────────────────
  // Razorpay has been removed. All payments are verified via UTR on direct UPI.

  const getValidationError = () => {
    if (items.length === 0) return 'Cart empty';
    if (!deliveryEnabled) return 'Deliveries are currently paused by the store. Please check back later.';
    if (minOrderAmount > 0 && totalPrice < minOrderAmount) {
      return `Minimum order amount is ₹${minOrderAmount}. Add ₹${Math.ceil(minOrderAmount - totalPrice)} more to continue.`;
    }
    if (!address) return 'Address missing. Please set your delivery location.';
    if (!phone || phone.length < 10) return 'Valid phone number required.';
    if (!paymentMethod && !(canPayFullyWithCoins && useCoins)) return 'Select a payment method.';
    if (finalTotal <= 0 && !(canPayFullyWithCoins && useCoins)) return 'Order total must be greater than 0.';
    return '';
  };

  const validationError = getValidationError();

  // ─── Core Checkout Handler (ORDER-FIRST — guaranteed orderId before QR) ────
  const handleCheckout = async () => {
    if (!user) { navigate('/login'); return; }
    if (validationError) { setError(validationError); return; }
    if (checkoutInProgressRef.current) return; // Prevent double-click
    checkoutInProgressRef.current = true;

    // PATCH 9: Refresh prices before checkout to prevent stale-price mismatch
    await refreshPrices();

    if (!navigator.onLine) {
      setIsOffline(true);
      pendingCheckoutRef.current = true;
      checkoutInProgressRef.current = false;
      return;
    }

    const rateCheck = checkOrderLimit();
    if (!rateCheck.allowed) { setError(rateCheck.error); checkoutInProgressRef.current = false; return; }

    let effectiveMethod = paymentMethod;
    if (canPayFullyWithCoins && useCoins) effectiveMethod = 'coins';

    setError('');

    // ─── COD Flow: Create order directly, no payment modal needed ────
    if (effectiveMethod === 'cod') {
      setLoading(true);
      let iKey = idempotencyKey;
      if (!iKey) { iKey = crypto.randomUUID(); setIdempotencyKey(iKey); }

      try {
        const createOrderFn = httpsCallable(functions, 'createOrder');
        const response = await createOrderFn({
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          address, phone, useCoins, coinsToUse: coinsBeingUsed,
          paymentMethod: effectiveMethod, deliveryFee, idempotencyKey: iKey,
          couponCode: appliedCoupon?.code || '', couponDiscount: couponDiscount,
          ...(deliveryCoords ? { deliveryLat: deliveryCoords.lat, deliveryLng: deliveryCoords.lng } : {}),
          ...(deliveryDistanceKm !== null ? { deliveryDistanceKm: Number(deliveryDistanceKm.toFixed(2)) } : {}),
        });
        const data = response.data as { success: boolean; orderId: string; finalAmount: number };
        if (data?.success) {
          pendingCheckoutRef.current = null;
          refreshUser().catch(() => {});
          clearCart();
          setIdempotencyKey('');
          setAppliedCoupon(null);
          setOrderPlaced(true);
          setTimeout(() => navigate('/orders'), 3000);
        }
      } catch (err: any) {
        const code = err?.code || '';
        if (code === 'unauthenticated') navigate('/login');
        else if (!navigator.onLine) { setIsOffline(true); pendingCheckoutRef.current = true; }
        else setError(err?.message || 'Order failed. Please try again.');
      } finally {
        setLoading(false);
        checkoutInProgressRef.current = false;
      }
      return;
    }

    // ─── QR Flow: Create order FIRST, THEN show modal ───────────────────
    if (effectiveMethod === 'qr' && finalTotal > 0) {
      setLoading(true); // Show loading on checkout button

      // Generate idempotency key
      let iKey = idempotencyKey;
      if (!iKey) { iKey = crypto.randomUUID(); setIdempotencyKey(iKey); }

      const createOrderFn = httpsCallable(functions, 'createOrder', { timeout: 120000 });
      const MAX_RETRIES = 3;
      let orderId = '';
      let lastError: any = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await createOrderFn({
            items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
            address, phone, useCoins, coinsToUse: coinsBeingUsed,
            paymentMethod: effectiveMethod, deliveryFee, idempotencyKey: iKey,
            couponCode: appliedCoupon?.code || '', couponDiscount: couponDiscount,
            ...(deliveryCoords ? { deliveryLat: deliveryCoords.lat, deliveryLng: deliveryCoords.lng } : {}),
            ...(deliveryDistanceKm !== null ? { deliveryDistanceKm: Number(deliveryDistanceKm.toFixed(2)) } : {}),
          });
          const data = response.data as { success: boolean; orderId: string };
          if (data?.success && data.orderId) {
            orderId = data.orderId;
            break;
          }
          throw new Error('order-failed');
        } catch (err: any) {
          lastError = err;
          const code = err?.code || '';
          console.error(`[Order Attempt ${attempt}/${MAX_RETRIES}]`, code, err?.message || err);
          // Don't retry on validation errors — they'll always fail
          if (['invalid-argument', 'failed-precondition', 'unauthenticated'].includes(code)) {
            if (code === 'unauthenticated') navigate('/login');
            else setError(err?.message || 'Could not create order. Please check your cart and try again.');
            setLoading(false);
            checkoutInProgressRef.current = false;
            return;
          }
          // Retry on network/transient errors
          if (attempt === MAX_RETRIES) {
            // Show the REAL error — not a generic "internet" message
            const realMessage = err?.message || '';
            if (!navigator.onLine) {
              setError('You appear to be offline. Please check your internet and try again.');
            } else if (realMessage.includes('internal') || code === 'internal') {
              setError('Server error. Please try again in a moment.');
            } else if (code === 'deadline-exceeded') {
              setError('Request timed out. Please try again — the server may be busy.');
            } else {
              setError(`Order failed: ${realMessage || 'Unknown error'}. Please try again.`);
            }
            setLoading(false);
            checkoutInProgressRef.current = false;
            return;
          }
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }

      // ── ORDER IS NOW GUARANTEED TO EXIST ──
      setQrOrderId(orderId);
      // Persist orderId so user can resume after page refresh
      try { localStorage.setItem('kk_pending_qr_order', orderId); } catch {}
      setLoading(false);
      setShowQrModal(true); // Open modal only when orderId is locked in
      checkoutInProgressRef.current = false;
      return;
    }

    // ─── Coins-only flow (no QR needed) ─────────────────────────────────
    setLoading(true);
    let iKey = idempotencyKey;
    if (!iKey) { iKey = crypto.randomUUID(); setIdempotencyKey(iKey); }

    try {
      const createOrderFn = httpsCallable(functions, 'createOrder');
      const response = await createOrderFn({
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        address, phone, useCoins, coinsToUse: coinsBeingUsed,
        paymentMethod: effectiveMethod, deliveryFee, idempotencyKey: iKey,
        couponCode: appliedCoupon?.code || '', couponDiscount: couponDiscount,
        ...(deliveryCoords ? { deliveryLat: deliveryCoords.lat, deliveryLng: deliveryCoords.lng } : {}),
        ...(deliveryDistanceKm !== null ? { deliveryDistanceKm: Number(deliveryDistanceKm.toFixed(2)) } : {}),
      });
      const data = response.data as { success: boolean; orderId: string; finalAmount: number };
      if (data?.success) {
        pendingCheckoutRef.current = null;
        refreshUser().catch(() => {});
        clearCart();
        setIdempotencyKey('');
        setAppliedCoupon(null);
        setOrderPlaced(true);
        setTimeout(() => navigate('/orders'), 3000);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'unauthenticated') navigate('/login');
      else if (!navigator.onLine) { setIsOffline(true); pendingCheckoutRef.current = true; }
      else if (code === 'failed-precondition') setError('Payment system is temporarily busy. Please wait a moment and try again.');
      else if (code === 'unavailable') setError('Network issue detected. Please check your internet connection.');
      else setError('We encountered an issue placing your order. Please refresh the page and try again, or contact support if the issue persists.');
    } finally {
      setLoading(false);
      checkoutInProgressRef.current = false;
    }
  };

  // ─── UTR Submit Handler (orderId is GUARANTEED to exist) ──────────────────
  const handleQrConfirm = async () => {
    const trimmedUtr = utrInput.trim().replace(/\s/g, '');
    if (trimmedUtr.length < 10 || trimmedUtr.length > 22) {
      setUtrError('Please enter a valid UTR/transaction reference (10-22 characters)');
      return;
    }
    
    setLoadingVerify(true);
    setUtrError('');
    
    // orderId is guaranteed — order was created before modal opened
    const orderId = qrOrderId;
    if (!orderId) {
      setUtrError('Session error. Please close and place the order again.');
      setLoadingVerify(false);
      return;
    }

    const submitUtrFn = httpsCallable(functions, 'submitUtr');
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await submitUtrFn({ orderId, utrNumber: trimmedUtr });
        
        // SUCCESS — UTR saved, payment under review
        try { localStorage.removeItem('kk_pending_qr_order'); } catch {}
        setShowQrModal(false);
        refreshUser().catch(() => {});
        clearCart();
        setIdempotencyKey('');
        setAppliedCoupon(null);
        setOrderPlaced(true);
        setTimeout(() => navigate('/orders'), 3000);
        return; // Exit on success
      } catch (err: any) {
        const msg = err?.message || '';
        const code = err?.code || '';

        // Non-retryable errors — show immediately
        if (msg.includes('already been used') || code === 'already-exists') {
          setUtrError('This UTR has already been used for another order.');
          break;
        }
        if (code === 'invalid-argument') {
          setUtrError('UTR format not accepted. Please copy the exact reference from your UPI app.');
          break;
        }
        if (code === 'failed-precondition') {
          setUtrError('Payment was already submitted for this order. Check your Orders page.');
          break;
        }
        if (code === 'permission-denied') {
          setUtrError('Permission error. Please log in again.');
          break;
        }

        // Retryable errors — retry silently
        if (attempt === MAX_RETRIES) {
          if (code === 'unavailable' || code === 'deadline-exceeded' || !navigator.onLine) {
            setUtrError('Network issue. Please check your internet and try again.');
          } else {
            console.error('UTR submit error:', err);
            setUtrError('Submission failed. Please try again.');
          }
          break;
        }
        // Wait before retry: 1s, 2s
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    setLoadingVerify(false);
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
            : paymentMethod === 'cod'
            ? 'Pay in cash when your order arrives. Redirecting to your orders...'
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
              className="premium-card p-3 sm:p-4 flex items-center gap-2 sm:gap-4 group"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 group-hover:text-[#7A0000] transition-colors truncate">{item.name}</h3>
                <p className="text-sm font-black text-transparent bg-premium-gradient bg-clip-text truncate">₹{item.sellingPrice}</p>
              </div>
              
              <div className="flex items-center gap-1 sm:gap-2 bg-gray-50 rounded-lg px-1 sm:px-2 py-1 shadow-inner border border-gray-100 shrink-0">
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity - (item.stepSize || 1))}
                  className="text-gray-600 hover:bg-white rounded p-1 transition-colors hover:shadow-sm"
                >
                  <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <div className="flex flex-col items-center min-w-[28px] sm:min-w-[36px]">
                  <span className="font-black text-gray-900 text-xs sm:text-sm leading-none mt-1">{formatQty(item.quantity, item.unitType)}</span>
                </div>
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity + (item.stepSize || 1))}
                  className="text-gray-600 hover:bg-white rounded p-1 transition-colors hover:shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
              
              <div className="text-right shrink-0">
                <p className="font-black text-gray-900 text-sm sm:text-base">₹{Math.round((item.quantity / (item.baseWeight || 1)) * item.sellingPrice)}</p>
              </div>
              
              <button
                onClick={() => removeFromCart(item.productId)}
                className="text-gray-400 hover:text-[#7A0000] p-1.5 sm:p-2 transition-colors hover:bg-red-50 rounded-xl shrink-0"
              >
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="space-y-6">
        <div className="premium-card p-6 sticky top-24">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
          
          {freeDeliveryThreshold > 0 && totalPrice > 0 && totalPrice < freeDeliveryThreshold && (
            <div className="bg-orange-50/80 border border-orange-100 p-4 rounded-xl mb-6 text-center shadow-sm">
              <p className="text-orange-800 font-bold text-sm leading-relaxed">
                Add <span className="text-[#7A0000] border-b-2 border-red-200/50">₹{Math.ceil(freeDeliveryThreshold - totalPrice)}</span> more for <span className="font-black pt-1 block text-lg uppercase tracking-wider text-green-600">🎉 FREE delivery!</span>
              </p>
            </div>
          )}

          <div className="space-y-4 mb-8">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium">₹{Math.round(totalPrice)}</span>
            </div>

            {/* ─── Coupon Section ────────────────────────────── */}
            <div className="bg-gradient-to-r from-rose-50 to-pink-50 p-4 rounded-xl space-y-3 border border-rose-100/50">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center shadow-sm">
                  <Tag className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-bold text-gray-700">Apply Coupon</span>
              </div>

              {appliedCoupon ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-black text-green-700 uppercase tracking-wider">{appliedCoupon.code}</span>
                    <span className="text-xs font-bold text-green-600">-₹{appliedCoupon.discount}</span>
                  </div>
                  <button onClick={handleRemoveCoupon} className="text-gray-400 hover:text-red-500 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                    placeholder="Enter coupon code"
                    className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-bold uppercase tracking-wider outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
                    onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                  </button>
                </div>
              )}

              {couponError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] text-red-600 font-bold flex items-center gap-1"
                >
                  <AlertCircle className="w-3 h-3" /> {couponError}
                </motion.p>
              )}

              {appliedCoupon && (
                <div className="flex justify-between text-sm font-bold border-t border-rose-200/50 pt-2">
                  <span className="text-rose-700">Coupon Discount</span>
                  <span className="text-green-600">-₹{appliedCoupon.discount}</span>
                </div>
              )}
            </div>

            {/* ─── Kari Coins Wallet — Always Visible ─────────── */}
            <div className={cn(
              "p-4 rounded-xl space-y-3 border transition-all",
              useCoins && coinsBeingUsed > 0
                ? "bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-amber-200 shadow-sm"
                : "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-100"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shadow-sm transition-all",
                    availableCoins > 0
                      ? "bg-gradient-to-br from-amber-400 to-yellow-500"
                      : "bg-gradient-to-br from-gray-300 to-gray-400"
                  )}>
                    <Coins className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-800">Kari Coins</span>
                    <p className="text-[10px] text-gray-400 leading-tight">1 coin = ₹{COIN_VALUE}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={cn(
                      "text-lg font-black leading-none",
                      availableCoins > 0 ? "text-amber-600" : "text-gray-400"
                    )}>{availableCoins}</p>
                    <p className="text-[9px] text-gray-400 font-medium">₹{availableCoins * COIN_VALUE} value</p>
                  </div>
                  {availableCoins > 0 && maxCoinsToUse > 0 ? (
                    <button
                      onClick={() => setUseCoins(!useCoins)}
                      className={cn(
                        "w-11 h-6 rounded-full transition-all relative",
                        useCoins
                          ? "bg-gradient-to-r from-amber-400 to-yellow-500 shadow-md shadow-amber-200"
                          : "bg-gray-300 hover:bg-gray-400"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                        useCoins ? "right-1" : "left-1"
                      )} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Zero balance — earn info */}
              {availableCoins === 0 && (
                <div className="flex items-center gap-2 bg-white/60 rounded-lg p-2.5 border border-gray-100">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px] text-gray-500">
                    Earn coins on orders above <span className="font-bold text-amber-600">₹{COIN_EARN_THRESHOLD}</span>. Refer friends for bonus coins!
                  </p>
                </div>
              )}

              {/* Has coins but can't use on this order */}
              {availableCoins > 0 && maxCoinsToUse === 0 && (
                <p className="text-[10px] text-amber-600 font-medium bg-amber-50 rounded-lg px-2.5 py-1.5">
                  ⓘ Coins can be applied on orders with subtotal above ₹{COIN_VALUE + 1} (after coupon)
                </p>
              )}

              {/* Max usable hint */}
              {maxCoinsToUse > 0 && maxCoinsToUse < availableCoins && (
                <p className="text-[10px] text-amber-600 font-medium">
                  Max usable: {maxCoinsToUse} coins (₹{maxCoinsToUse * COIN_VALUE} off) — keeps payable above ₹1
                </p>
              )}

              {/* Applied coins breakdown */}
              <AnimatePresence>
                {useCoins && coinsBeingUsed > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex justify-between items-center text-sm font-bold border-t border-amber-200/50 pt-2.5"
                  >
                    <span className="text-amber-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {formatCoinUsage(coinsBeingUsed)}
                    </span>
                    <span className="text-green-600 font-black">-₹{coinDiscount}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex justify-between items-center text-gray-600">
              <span>Delivery Fee</span>
              {deliveryFee === 0 ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-green-700 bg-green-100 px-2 py-1 rounded">FREE</span>
              ) : (
                <span className="font-medium">₹{deliveryFee}</span>
              )}
            </div>

            {/* ─── Total Savings Banner ─────────────────────────── */}
            <AnimatePresence>
              {totalSavings > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5"
                >
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                    <Tag className="w-3 h-3 text-white" />
                  </div>
                  <p className="text-xs font-bold text-green-700 flex-1">
                    You're saving <span className="text-green-800 font-black">₹{totalSavings}</span> on this order!
                  </p>
                  <PartyPopper className="w-4 h-4 text-green-500 shrink-0" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Total Amount — Premium Card ─────────────────── */}
            <div className="relative mt-2 -mx-2 px-5 py-4 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(255,45,45,0.4) 0%, transparent 60%)' }} />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Total Amount</p>
                  <p className="text-3xl font-black text-white" style={{ textShadow: '0 2px 10px rgba(255,45,45,0.3)' }}>
                    ₹{finalTotal.toFixed(2)}
                  </p>
                  {discountAmount > 0 && (
                    <p className="text-[10px] text-gray-500 line-through mt-0.5">₹{(totalPrice + deliveryFee).toFixed(0)}</p>
                  )}
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
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">{selectedAddress?.name || 'Home'}</span>
                        {deliveryDistanceKm !== null && (
                          <span className={cn(
                            'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
                            isBeyondStoreRadius ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                          )}>
                            {formatDistanceKm(deliveryDistanceKm, false)} from {storeLocation.name}
                          </span>
                        )}
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
              {isBeyondStoreRadius && deliveryDistanceKm !== null && (
                <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-900 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Your delivery address is <span className="font-black">{formatDistanceKm(deliveryDistanceKm)}</span> from {storeLocation.name}, beyond our standard {storeLocation.maxRadiusKm} km radius. Delivery confirmation is subject to store approval.
                  </span>
                </div>
              )}
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
                    <QrCodeIcon className="w-5 h-5" />
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

                {/* Cash on Delivery */}
                <button
                  onClick={() => setPaymentMethod('cod')}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left",
                    paymentMethod === 'cod'
                      ? "border-green-500 bg-green-50/50 shadow-sm"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    paymentMethod === 'cod' ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"
                  )}>
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">Cash on Delivery</p>
                    <p className="text-[10px] text-gray-400">Pay when your order arrives</p>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                    paymentMethod === 'cod' ? "border-green-500 bg-green-500" : "border-gray-300"
                  )}>
                    {paymentMethod === 'cod' && <div className="w-2 h-2 rounded-full bg-white" />}
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
                Processing...
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
                  : `Pay ₹${finalTotal.toFixed(2)} — Place Order`}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── QR Payment Modal (INSTANT — no backend wait) ──────────────── */}
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
              className="bg-white rounded-3xl max-w-[400px] w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-3">
                  <QrCodeIcon className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-black text-gray-900">Scan & Pay</h3>
                <p className="text-sm text-gray-500 mt-1">Pay ₹{upiAmount} via any UPI app</p>
              </div>

              {/* Amount highlight */}
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-center shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Amount to Pay</p>
                <p className="text-3xl font-black text-green-700 my-1">₹{upiAmount}</p>
              </div>

              {/* QR Code — ALWAYS VISIBLE on top */}
              <div className="bg-white rounded-2xl p-4 mb-4 flex flex-col items-center justify-center border-2 border-gray-100 shadow-inner">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="UPI QR Code" className="w-[220px] h-[220px] rounded-xl" />
                ) : (
                  <div className="w-[220px] h-[220px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                  </div>
                )}
                <p className="text-xs text-gray-400 font-medium mt-2">Scan with any UPI app</p>
                <p className="font-bold text-gray-900 text-sm select-all mt-1">{UPI_ID}</p>
              </div>

              {/* UPI App Buttons — Direct URI schemes for WebView compatibility */}
              <div className="mb-4 grid grid-cols-4 gap-2">
                <a
                  href={`tez://upi/pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${upiAmount}&cu=INR&tn=KariKing_Order`}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2.5 flex flex-col items-center justify-center gap-1.5 shadow-sm transition-colors active:scale-95"
                >
                  <img src="/gpay.jpeg" alt="GPay" className="h-8 w-8 object-contain rounded-lg" />
                  <span className="text-[9px] font-bold text-gray-600">GPay</span>
                </a>
                <a
                  href={`phonepe://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${upiAmount}&cu=INR&tn=KariKing_Order`}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2.5 flex flex-col items-center justify-center gap-1.5 shadow-sm transition-colors active:scale-95"
                >
                  <img src="/phonepe.jpeg" alt="PhonePe" className="h-8 w-8 object-contain rounded-lg" />
                  <span className="text-[9px] font-bold text-gray-600">PhonePe</span>
                </a>
                <a
                  href={`paytmmp://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${upiAmount}&cu=INR&tn=KariKing_Order`}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2.5 flex flex-col items-center justify-center gap-1.5 shadow-sm transition-colors active:scale-95"
                >
                  <img src="/paytm.jpeg" alt="Paytm" className="h-8 w-8 object-contain rounded-lg" />
                  <span className="text-[9px] font-bold text-gray-600">Paytm</span>
                </a>
                <a
                  href={upiString}
                  className="bg-white border border-gray-200 hover:bg-gray-50 rounded-xl p-2.5 flex flex-col items-center justify-center gap-1.5 shadow-sm transition-colors active:scale-95"
                >
                  <Smartphone className="w-6 h-6 text-gray-500" />
                  <span className="text-[9px] font-bold text-gray-600">Others</span>
                </a>
              </div>

              {/* UTR Input Field */}
              <div className="mb-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                  Enter UTR / Transaction Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. 312345678901 or HDFCXXXXXXXXXX"
                  className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm text-center tracking-widest"
                  value={utrInput}
                  onChange={(e) => {
                    // Allow alphanumeric — some banks use mixed formats
                    setUtrInput(e.target.value.replace(/[^a-zA-Z0-9]/g, ''));
                    setUtrError('');
                  }}
                  maxLength={22}
                />
                <p className="text-[9px] text-gray-400 mt-1.5 text-center">Find this in your UPI app → Transaction History → Reference ID</p>
                {utrError && <p className="text-[10px] text-red-600 font-bold mt-2 text-center">{utrError}</p>}
              </div>

              {/* Order confirmed indicator — order is guaranteed to exist */}
              {qrOrderId && (
                <div className="flex items-center justify-center gap-2 mb-3 text-[10px] text-green-600 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Order #{qrOrderId.slice(-6).toUpperCase()} created — submit UTR after payment
                </div>
              )}

              <button
                onClick={handleQrConfirm}
                disabled={loadingVerify || utrInput.trim().length < 10}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none active:scale-95"
              >
                {loadingVerify ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </span>
                ) : (
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
        initialTab="address"
      />
    </div>
  );
}
