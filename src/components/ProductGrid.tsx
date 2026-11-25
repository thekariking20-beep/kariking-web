import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '../types';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  /** Optional: animate entry with stagger */
  animate?: boolean;
  /** Mark products as unavailable at current pointing location */
  locationUnavailable?: boolean;
  unavailableLabel?: string;
}

/**
 * Shared product grid — used on Home, Products, and any other page.
 * Ensures consistent 2-col mobile → 3-col tablet → 4-col desktop layout.
 */
export default function ProductGrid({
  products,
  animate = true,
  locationUnavailable = false,
  unavailableLabel,
}: ProductGridProps) {
  return (
    <div className="product-grid">
      {animate ? (
        <AnimatePresence>
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <ProductCard
                product={product}
                locationUnavailable={locationUnavailable}
                unavailableLabel={unavailableLabel}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      ) : (
        products.map(product => (
          <div key={product.id}>
            <ProductCard
              product={product}
              locationUnavailable={locationUnavailable}
              unavailableLabel={unavailableLabel}
            />
          </div>
        ))
      )}
    </div>
  );
}
