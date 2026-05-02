import React from 'react';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { motion } from 'motion/react';
import { formatQty, unitLabel } from '../lib/units';
import { cn } from '../lib/utils';

interface ProductCardProps {
  product: Product;
  key?: React.Key;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, items, updateQuantity } = useCart();
  const cartItem = items.find(i => i.productId === product.id);

  // formatQty is now imported from lib/units

  const handleMinus = () => {
    if (!cartItem) return;
    const step = product.stepSize || 1;
    const minQty = product.minOrderQty || 1;
    const newQty = cartItem.quantity - step;

    if (newQty < minQty) {
      updateQuantity(product.id, 0);
    } else {
      updateQuantity(product.id, newQty);
    }
  };

  const handlePlus = () => {
    if (!cartItem) return;
    const step = product.stepSize || 1;
    updateQuantity(product.id, cartItem.quantity + step);
  };

  const baseUnitWeight = product.baseWeight || 1;
  const hasDiscount = product.mrpPrice > product.sellingPrice;
  const savings = hasDiscount ? product.mrpPrice - product.sellingPrice : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97 }}
      className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/60 overflow-hidden flex flex-col h-full"
    >
      {/* ─── Image ─── */}
      <div className="relative" style={{ aspectRatio: '1 / 1' }}>
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-all",
            product.isComingSoon && "grayscale-[50%] opacity-80 blur-[2px] scale-105"
          )}
          referrerPolicy="no-referrer"
        />
        {/* Bottom gradient for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
        
        {/* Status Overlays */}
        {product.isComingSoon ? (
          <div className="absolute top-1.5 left-1.5 text-white text-[8px] font-black uppercase tracking-wide px-2 py-[3px] rounded-md shadow-md bg-gradient-to-r from-amber-500 to-yellow-600 border border-amber-300/30">
            COMING SOON
          </div>
        ) : !product.isAvailable ? (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center backdrop-blur-[2px]">
            <span className="bg-white text-gray-900 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shadow-md">
              Sold Out
            </span>
          </div>
        ) : product.discountPercentage ? (
          <div 
            className="absolute top-1.5 left-1.5 text-white text-[8px] font-black uppercase tracking-wide px-2 py-[3px] rounded-md shadow-md"
            style={{
              background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
            }}
          >
            {product.discountPercentage}% OFF
          </div>
        ) : null}

        {/* Unit weight badge – bottom right of image */}
        <div className="absolute bottom-1.5 right-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-[2px] rounded-md shadow-sm">
          {formatQty(baseUnitWeight, product.unitType)}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="p-2.5 flex flex-col flex-1 min-h-0">
        {/* Title row */}
        <h3 className="font-bold text-gray-900 text-[11px] sm:text-xs leading-snug line-clamp-2 min-h-[2lh]">
          {product.name}
        </h3>

        {/* Spacer pushes price + button to bottom */}
        <div className="mt-auto pt-1.5">
            {/* Price row */}
            {product.isComingSoon ? (
              <div className="flex items-center justify-between w-full">
                <span className="text-xs sm:text-sm font-black text-amber-600 leading-none block">
                  Coming Soon 🔜
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => alert("You will be notified when this product is available!")}
                  className="text-white text-[9px] font-bold px-2 py-1.5 rounded-lg active:scale-95 shrink-0 shadow-sm border border-amber-500/20"
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  }}
                >
                  Notify Me
                </motion.button>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-1 w-full">
                <div className="min-w-0">
                  <span className="text-base sm:text-lg font-black text-gray-900 leading-none block">
                    ₹{product.sellingPrice}
                  </span>
                  {hasDiscount && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-gray-400 line-through leading-none">
                        ₹{product.mrpPrice}
                      </span>
                      {savings > 0 && (
                        <span className="text-[7px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1 py-[1px] rounded leading-none">
                          Save ₹{savings}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Cart controls */}
                {cartItem ? (
                  <div className="flex items-center gap-0.5 bg-gradient-to-r from-red-600 to-red-700 rounded-lg px-1 py-[3px] shadow-lg shrink-0">
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={handleMinus}
                      className="text-white rounded p-0.5 active:bg-white/20"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </motion.button>
                    <span className="font-black text-white text-[11px] leading-none min-w-[22px] text-center">
                      {formatQty(cartItem.quantity, product.unitType)}
                    </span>
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={handlePlus}
                      className="text-white rounded p-0.5 active:bg-white/20"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => addToCart(product)}
                    disabled={!product.isAvailable}
                    className="text-white p-[7px] rounded-xl disabled:opacity-40 active:scale-95 shrink-0 shadow-lg"
                    style={{
                      background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                      boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
                    }}
                  >
                    <ShoppingCart className="w-[15px] h-[15px]" />
                  </motion.button>
                )}
              </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}
