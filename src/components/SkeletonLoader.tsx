import React from 'react';
import { cn } from '../lib/utils';

// ─── Base Shimmer ─────────────────────────────────────────────────────────────
function Shimmer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-gray-200", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shimmer_1.5s_infinite]" />
    </div>
  );
}

// ─── Product Card Skeleton ────────────────────────────────────────────────────
export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
      <Shimmer className="w-full aspect-square rounded-xl" />
      <Shimmer className="h-4 w-3/4" />
      <Shimmer className="h-3 w-1/2" />
      <div className="flex items-center justify-between pt-1">
        <Shimmer className="h-5 w-16" />
        <Shimmer className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
}

// ─── Order Card Skeleton ──────────────────────────────────────────────────────
export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-3 w-24" />
        </div>
        <Shimmer className="h-7 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-5/6" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <Shimmer className="h-5 w-20" />
        <Shimmer className="h-3 w-28" />
      </div>
    </div>
  );
}

// ─── Dashboard KPI Skeleton ───────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <Shimmer className="h-8 w-8 rounded-lg" />
            <Shimmer className="h-6 w-16" />
            <Shimmer className="h-3 w-24" />
          </div>
        ))}
      </div>
      {/* Chart area */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ─── Home Page Skeleton ───────────────────────────────────────────────────────
export function HomeSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Hero banner */}
      <Shimmer className="w-full h-48 rounded-2xl" />
      {/* Category pills */}
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-10 w-24 rounded-full shrink-0" />
        ))}
      </div>
      {/* Product grid */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Delivery Dashboard Skeleton ──────────────────────────────────────────────
export function DeliverySkeleton() {
  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-br from-red-700 to-rose-500 rounded-b-[2.5rem] pb-6 pt-10 px-6 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Shimmer className="h-3 w-28 !bg-white/20" />
            <Shimmer className="h-7 w-48 !bg-white/20" />
          </div>
          <Shimmer className="h-12 w-12 rounded-full !bg-white/20" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-20 rounded-2xl !bg-white/10" />
          ))}
        </div>
      </div>
      {/* Orders */}
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Full Page Loader (Suspense fallback) ─────────────────────────────────────
export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
