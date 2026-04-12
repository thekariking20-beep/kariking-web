import React from 'react';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { motion } from 'motion/react';

interface ProductCardProps {
  product: Product;
  key?: React.Key;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, items, updateQuantity } = useCart();
  const cartItem = items.find(i => i.productId === product.id);

  const formatQty = (qty: number, unit?: string) => {
    if (unit === 'gram') {
      if (qty >= 1000 && qty % 1000 === 0) return `${qty / 1000}kg`;
      if (qty >= 1000) return `${(qty / 1000).toFixed(2)}kg`;
      return `${qty}g`;
    }
    if (unit === 'kg') return `${qty}kg`;
    if (unit === 'piece') return `${qty} pcs`;
    return qty;
  };

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.1)' }}
      whileTap={{ scale: 0.98 }}
      className="premium-card bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-gray-100/80 overflow-hidden group transition-colors"
    >
      {/* ─── Image Section ─── */}
      <div className="relative aspect-square overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          referrerPolicy="no-referrer"
        />
        {/* Premium dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        
        {!product.isAvailable && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <span className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg">
              Sold Out
            </span>
          </div>
        )}

        {/* ─── Discount Badge (Top-Left Pill) ─── */}
        {product.discountPercentage ? (
          <div 
            className="absolute top-2.5 left-2.5 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg border border-white/20 flex items-center gap-1"
            style={{
              background: 'linear-gradient(135deg, #FF4444 0%, #CC0000 100%)',
              boxShadow: '0 4px 14px rgba(204,0,0,0.4)',
            }}
          >
            <span className="drop-shadow-sm">{product.discountPercentage}% OFF</span>
          </div>
        ) : null}
      </div>

      {/* ─── Content Section ─── */}
      <div className="p-4">
        {/* Product Name & Category */}
        <div className="flex items-start justify-between mb-1 gap-2">
          <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">{product.name}</h3>
          {(product.subCategory || product.category) && (
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-1.5 py-0.5 rounded shrink-0 max-w-[70px] truncate border border-gray-100">
              {product.subCategory || product.category}
            </span>
          )}
        </div>

        {/* ─── PHASE 1-6: Premium Price Structure ─── */}
        <div className="mt-2 mb-3">
          {/* Price Row: Selling → MRP → Unit */}
          <div className="flex items-baseline gap-2 flex-wrap">
            {/* Phase 2: Selling Price — BIG & BOLD, first thing user sees */}
            <span 
              className="text-[20px] font-black text-gray-900 leading-none"
              style={{ 
                textShadow: hasDiscount ? '0 0 20px rgba(122,0,0,0.08)' : 'none',
              }}
            >
              ₹{product.sellingPrice}
            </span>

            {/* Phase 3: Original Price — strikethrough, smaller, grey */}
            {hasDiscount && (
              <span className="text-[13px] font-medium text-gray-400 line-through leading-none">
                ₹{product.mrpPrice}
              </span>
            )}

            {/* Phase 6: Price per unit — clean format */}
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none ml-auto">
              {formatQty(baseUnitWeight, product.unitType)}
            </span>
          </div>

          {/* Phase 8: "You save ₹XXX" — conversion psychology */}
          {hasDiscount && savings > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span 
                className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(22,163,74,0.08) 0%, rgba(22,163,74,0.04) 100%)',
                  color: '#15803d',
                  border: '1px solid rgba(22,163,74,0.1)',
                }}
              >
                You save ₹{savings}
              </span>
            </div>
          )}
        </div>

        {/* ─── PHASE 7: Add to Cart / Quantity Controls ─── */}
        <div className="flex items-center justify-end">
          {cartItem ? (
            <div className="flex items-center gap-1.5 bg-premium-gradient rounded-xl px-2 py-1.5 shadow-[0_8px_20px_rgba(122,0,0,0.3)]">
              <motion.button
                whileTap={{ scale: 0.8 }}
                onClick={handleMinus}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="w-4 h-4" />
              </motion.button>
              <div className="flex flex-col items-center justify-center min-w-[34px]">
                <span className="font-black text-white text-sm leading-none drop-shadow-md">
                  {formatQty(cartItem.quantity, product.unitType)}
                </span>
                <span className="text-[7.5px] font-bold text-white/80 uppercase tracking-widest mt-0.5 leading-none">
                  ₹{Math.round((cartItem.quantity / baseUnitWeight) * product.sellingPrice)}
                </span>
              </div>
              <motion.button
                whileTap={{ scale: 0.8 }}
                onClick={handlePlus}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => addToCart(product)}
              disabled={!product.isAvailable}
              className="ripple-btn text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                boxShadow: '0 8px 24px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <ShoppingCart className="w-5 h-5 drop-shadow-md" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
