import React, { createContext, useContext, useState, useEffect } from 'react';
import { OrderItem, Product } from '../types';

interface CartContextType {
  items: OrderItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<OrderItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

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

  const totalItems = items.length; // Number of unique line items, since quantity is now weight
  const totalPrice = items.reduce((sum, i) => {
    const baseUnitWeight = i.baseWeight || 1;
    const priceRatio = i.quantity / baseUnitWeight;
    return sum + (i.sellingPrice * priceRatio);
  }, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice }}>
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
