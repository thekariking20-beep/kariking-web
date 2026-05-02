import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  ShoppingBag, 
  IndianRupee, 
  Clock, 
  Package, 
  CheckCircle2, 
  Truck, 
  XCircle 
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { Order } from '../../types';
import { cn } from '../../lib/utils';

interface DashboardOverviewProps {
  orders: Order[];
}

export default function DashboardOverview({ orders }: DashboardOverviewProps) {
  // --- 1. Aggregations (useMemo for massive performance gains) ---
  const { 
    kpis, 
    revenueData, 
    statusData, 
    topProducts,
    recentOrders 
  } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todayRevenue = 0;
    let todayOrdersCount = 0;
    let totalRevenue = 0;
    let pendingCount = 0;

    const last7DaysMap = new Map<string, { date: string, revenue: number, orders: number }>();
    
    // Initialize 7 days data
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      last7DaysMap.set(dateString, { date: dateString, revenue: 0, orders: 0 });
    }

    const statusCounts = {
      'Order Placed': 0,
      'Order Received': 0,
      'Packed': 0,
      'Dispatched': 0,
      'Delivered': 0,
      'Cancelled': 0
    };

    const productStats = new Map<string, { name: string, quantity: number, revenue: number }>();

    orders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      const isToday = orderDate >= today;
      // Revenue should reflect the actual amount paid (finalAmount) after coins discount
      const amount = order.finalAmount !== undefined ? order.finalAmount : (order.totalAmount || 0);

      const isRevenueEligible = order.status !== 'Cancelled' && order.paymentStatus !== 'failed' && 
                                (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed' || order.paymentStatus === 'under_review');

      // KPIs
      if (isRevenueEligible) {
        totalRevenue += amount;
      }
      
      if (order.status !== 'Delivered' && order.status !== 'Cancelled') {
        pendingCount++;
      }

      if (isToday) {
        if (isRevenueEligible) {
          todayRevenue += amount;
        }
        todayOrdersCount++;
      }

      // Status Spread
      if (statusCounts[order.status] !== undefined) {
        statusCounts[order.status]++;
      }

      // 7-day trend
      const dateKey = orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (last7DaysMap.has(dateKey)) {
        const current = last7DaysMap.get(dateKey)!;
        if (isRevenueEligible) {
          current.revenue += amount;
        }
        current.orders += 1;
      }

      // Top Products
      if (order.status !== 'Cancelled') {
        order.items?.forEach(item => {
          const current = productStats.get(item.productId) || { name: item.name, quantity: 0, revenue: 0 };
          current.quantity += item.quantity;
          current.revenue += (item.quantity / (item.baseWeight || 1)) * (item.sellingPrice || 0);
          productStats.set(item.productId, current);
        });
      }
    });

    const averageOrderValue = orders.length > 0 ? (totalRevenue / orders.length) : 0;

    // Formatting for Recharts
    const chartRevenueData = Array.from(last7DaysMap.values());
    
    const chartStatusData = [
      { name: 'Placed', value: statusCounts['Order Placed'], color: '#CA8A04' },   // Yellow
      { name: 'Processing', value: statusCounts['Order Received'] + statusCounts['Packed'], color: '#9333EA' }, // Purple
      { name: 'Dispatched', value: statusCounts['Dispatched'], color: '#EA580C' }, // Orange
      { name: 'Delivered', value: statusCounts['Delivered'], color: '#16A34A' },   // Green
      { name: 'Cancelled', value: statusCounts['Cancelled'], color: '#DC2626' }    // Red
    ].filter(s => s.value > 0);

    const sortedProducts = Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      kpis: {
        todayRevenue,
        todayOrdersCount,
        averageOrderValue: Math.round(averageOrderValue),
        pendingCount
      },
      revenueData: chartRevenueData,
      statusData: chartStatusData,
      topProducts: sortedProducts,
      recentOrders: orders.slice(0, 5) // Assuming pre-sorted by createdAt DESC from firebase
    };
  }, [orders]);

  // --- 2. Render Functions ---

  const KPICard = ({ title, value, icon: Icon, trend, color, delay }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-center gap-4 group"
    >
      <div className={cn("p-4 rounded-xl transition-colors", color)}>
        <Icon className="w-8 h-8" />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-tight">{title}</p>
        <h3 className="text-2xl font-black text-gray-900 mt-1">{value}</h3>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-8 pb-10">
      
      {/* 1. KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Revenue (Today)" 
          value={`₹${kpis.todayRevenue.toLocaleString('en-IN')}`} 
          icon={IndianRupee} 
          color="bg-green-50 text-green-600 group-hover:bg-green-100" 
          delay={0.1} 
        />
        <KPICard 
          title="Orders (Today)" 
          value={kpis.todayOrdersCount} 
          icon={ShoppingBag} 
          color="bg-blue-50 text-blue-600 group-hover:bg-blue-100" 
          delay={0.2} 
        />
        <KPICard 
          title="Avg Order Value" 
          value={`₹${kpis.averageOrderValue.toLocaleString('en-IN')}`} 
          icon={TrendingUp} 
          color="bg-purple-50 text-purple-600 group-hover:bg-purple-100" 
          delay={0.3} 
        />
        <KPICard 
          title="Pending Queue" 
          value={kpis.pendingCount} 
          icon={Clock} 
          color="bg-orange-50 text-orange-600 group-hover:bg-orange-100" 
          delay={0.4} 
        />
      </div>

      {/* 2. CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart */}
        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Revenue Trend (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} tickFormatter={(val) => `₹${val}`} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`₹${value}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#8B0000" strokeWidth={4} dot={{ r: 4, fill: '#8B0000', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Order Status</h3>
          <div className="flex-1 min-h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  animationDuration={1000}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-gray-900">{orders.length}</span>
              <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Total</span>
            </div>
          </div>
          {/* Custom Legend */}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
             {statusData.map((entry, idx) => (
               <div key={idx} className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                 <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                 {entry.name} ({entry.value})
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* 3. LOWER GRID: TOP PRODUCTS & LATEST ORDERS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Top Products */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center justify-between">
            Top Performers
            <span className="bg-red-50 text-red-600 text-[10px] px-2 py-1 flex items-center justify-center rounded-lg uppercase tracking-wider">By Revenue</span>
          </h3>
          <div className="flex-1 flex flex-col gap-4">
            {topProducts.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No data available yet</div>
            ) : (
              topProducts.map((prod, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-400 text-xs">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{prod.name}</p>
                    <p className="text-[10px] text-gray-500 font-medium">{prod.quantity} Units Sold</p>
                  </div>
                  <div className="font-black text-red-600 text-sm">
                    ₹{prod.revenue.toLocaleString('en-IN')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Orders Overview (Preview) */}
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Live Dispatch Tracker</h3>
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <th className="p-4 rounded-tl-xl">Order</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4 text-right rounded-tr-xl">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50/50">
                {recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-gray-900 text-sm">{order.phone}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-black text-red-600 text-sm">₹{order.totalAmount}</p>
                    </td>
                    <td className="p-4 text-right">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                        order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                        order.status === 'Dispatched' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      )}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-gray-400">No orders yet today</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
