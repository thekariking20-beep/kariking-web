import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { OrderItem, Product } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface CartContextType {
  items: OrderItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  refreshPrices: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
  pricesStale: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<OrderItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [pricesStale, setPricesStale] = useState(false);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  const addToCart = (product: Product) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === product.id);
      const minQty = product.minOrderQty || 1;
      const step = product.stepSize || 1;
      
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + step } : i);
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        sellingPrice: product.sellingPrice, 
        quantity: minQty,
        unitType: product.unitType || 'piece',
        baseWeight: product.baseWeight || 1,
        stepSize: step,
        minOrderQty: minQty
      }];
    });
    // When a product is added, its price is fresh — clear stale flag
    setPricesStale(false);
  };

  const removeFromCart = (productId: string) => {
    setItems(prev => prev.filter(i => i.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, quantity } : i));
  };

  const clearCart = () => setItems([]);

  // PATCH 9: Refresh prices from Firestore to ensure cart matches current pricing.
  // Called when Cart page opens and before checkout.
  const refreshPrices = useCallback(async () => {
    if (items.length === 0) return;
    
    let anyChanged = false;
    const updatedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const productDoc = await getDoc(doc(db, 'products', item.productId));
          if (productDoc.exists()) {
            const productData = productDoc.data();
            const freshPrice = productData.sellingPrice;
            if (freshPrice !== item.sellingPrice) {
              anyChanged = true;
              return { ...item, sellingPrice: freshPrice, name: productData.name || item.name };
            }
          }
          return item;
        } catch {
          // Network error — keep existing price (offline-safe)
          return item;
        }
      })
    );

    if (anyChanged) {
      setItems(updatedItems);
      setPricesStale(false);
    }
  }, [items]);

  // PATCH 9: Mark prices as potentially stale after 5 minutes of inactivity
  useEffect(() => {
    if (items.length === 0) return;
    const timer = setTimeout(() => setPricesStale(true), 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [items]);

  const totalItems = items.length; // Number of unique line items, since quantity is now weight
  const totalPrice = items.reduce((sum, i) => {
    const baseUnitWeight = i.baseWeight || 1;
    const priceRatio = i.quantity / baseUnitWeight;
    return sum + (i.sellingPrice * priceRatio);
  }, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, refreshPrices, totalItems, totalPrice, pricesStale }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
