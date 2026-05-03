import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Category, User, Order, Referral } from '../types';
import { Plus, Edit2, Trash2, Check, X, Package, Image as ImageIcon, Tag, IndianRupee, FileText, ToggleLeft, ToggleRight, LayoutDashboard, ShoppingCart, Users, Shield, Gift, Truck, MapPin, Phone, Globe, PartyPopper, Menu, Crown, LogOut, ChevronUp, Settings, Camera, Mail, Save, User as UserIcon, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import ImageUploadDropzone from '../components/ImageUploadDropzone';
import DashboardOverview from '../components/admin/DashboardOverview';
import HomepageManager from '../components/admin/HomepageManager';
import StaffProvisioning from '../components/admin/StaffProvisioning';
import DriverVerification from '../components/admin/DriverVerification';
import AdminSettings from '../components/admin/AdminSettings';
import AdminOrdersTab from '../components/admin/AdminOrdersTab';
import AdminBookingsTab from '../components/admin/AdminBookingsTab';
import CategoriesManager from '../components/admin/CategoriesManager';
import { useCategories } from '../context/CategoriesContext';
import { useNavigate } from 'react-router-dom';
import { processReferralReward } from '../lib/referralReward';

export default function Admin() {
  const { user, isAdmin, isManager, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'orders' | 'bookings' | 'users' | 'referrals' | 'homepage' | 'provisioning' | 'verification' | 'settings' | 'categories'>('dashboard');
  const { categories: dynamicCategories, getSubCategories: getDynamicSubCategories } = useCategories();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [deliveryPartners, setDeliveryPartners] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [orderLimit, setOrderLimit] = useState(50);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const navigate = useNavigate();
  const profileMenuRef = useRef<HTMLDivElement>(null);
  
  // Product state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    mainCategory: dynamicCategories[0]?.id || 'Chicken',
    subCategory: dynamicCategories[0]?.subCategories?.[0]?.id || 'Country Chicken',
    customSubCategory: '',
    image: '',
    description: '',
    mrpPrice: 0,
    sellingPrice: 0,
    unitType: 'gram' as 'kg' | 'gram' | 'piece' | 'litre',
    baseWeight: 1000,
    minOrderQty: 500,
    stepSize: 250,
    isAvailable: true,
    isComingSoon: false,
  });

  // Derived subcategories based on selected main category (now dynamic)
  const availableSubCategories = getDynamicSubCategories(formData.mainCategory);
  const isOthers = formData.mainCategory === 'Others';

  // Live listener for real-time analytics — orders
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(orderLimit));
    const unsubscribe = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [orderLimit]);

  // ─── Real-time listeners for ALL admin data ─────────────────────────────────
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Products — always listen (needed for dashboard stats too)
    unsubs.push(onSnapshot(
      query(collection(db, 'products'), orderBy('createdAt', 'desc')),
      snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
      err => console.error('Products listener:', err)
    ));

    // Categories
    unsubs.push(onSnapshot(
      collection(db, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))),
      err => console.error('Categories listener:', err)
    ));

    // Delivery partners
    unsubs.push(onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'delivery')),
      snap => setDeliveryPartners(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as User))),
      err => console.error('Partners listener:', err)
    ));

    // Users (admin only)
    if (isAdmin) {
      unsubs.push(onSnapshot(
        query(collection(db, 'users'), orderBy('createdAt', 'desc')),
        snap => { setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as User))); setLoading(false); },
        err => console.error('Users listener:', err)
      ));

      // Referrals (admin only)
      unsubs.push(onSnapshot(
        query(collection(db, 'referrals'), orderBy('createdAt', 'desc')),
        snap => setReferrals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Referral))),
        err => console.error('Referrals listener:', err)
      ));
    }

    setLoading(false);
    return () => unsubs.forEach(u => u());
  }, [isAdmin]);

  // --- Handlers for Products ---
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      let discountPercentage = 0;
      if (formData.mrpPrice > 0 && formData.sellingPrice < formData.mrpPrice) {
        discountPercentage = Math.round(((formData.mrpPrice - formData.sellingPrice) / formData.mrpPrice) * 100);
      }

      // Resolve the final subCategory: custom text for 'Others' or '__custom__', else selected dropdown
      const resolvedSubCategory = isOthers || formData.subCategory === '__custom__'
        ? formData.customSubCategory.trim()
        : formData.subCategory;

      const { customSubCategory, ...rest } = formData;
      const productPayload = {
        ...rest,
        subCategory: resolvedSubCategory,
        discountPercentage
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productPayload);
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...productPayload } as Product : p));
      } else {
        const newProduct = { ...productPayload, createdAt: new Date().toISOString() };
        const docRef = await addDoc(collection(db, 'products'), newProduct);
        setProducts(prev => [{ id: docRef.id, ...newProduct } as Product, ...prev]);
      }
      resetForm();
    } catch (error) {
      console.error("Error saving product:", error);
    }
  };

  const handleProductDelete = async (id: string) => {
    if (!isAdmin || !window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  const toggleAvailability = async (product: Product) => {
    try {
      await updateDoc(doc(db, 'products', product.id), { isAvailable: !product.isAvailable });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isAvailable: !p.isAvailable } : p));
    } catch (error) {
      console.error("Error toggling availability:", error);
    }
  };

  const toggleComingSoon = async (product: Product) => {
    try {
      const newComingSoon = !product.isComingSoon;
      // If setting to coming soon, automatically disable availability
      const updates: any = { isComingSoon: newComingSoon };
      if (newComingSoon) updates.isAvailable = false;
      
      await updateDoc(doc(db, 'products', product.id), updates);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...updates } : p));
    } catch (error) {
      console.error("Error toggling coming soon:", error);
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', mainCategory: dynamicCategories[0]?.id || 'Chicken', subCategory: dynamicCategories[0]?.subCategories?.[0]?.id || '', customSubCategory: '',
      image: '', description: '', mrpPrice: 0, sellingPrice: 0, 
      unitType: 'gram', baseWeight: 1000, minOrderQty: 500, stepSize: 250, isAvailable: true, isComingSoon: false
    });
    setEditingProduct(null);
    setShowAddForm(false);
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    const mainCat = product.mainCategory || product.category || 'Chicken';
    const subCats = getDynamicSubCategories(mainCat);
    const isCustom = mainCat === 'Others' || (subCats.length > 0 && !subCats.find(s => s.id === product.subCategory));
    setFormData({
      name: product.name, 
      mainCategory: mainCat,
      subCategory: isCustom ? '' : (product.subCategory || subCats[0]?.id || ''),
      customSubCategory: isCustom ? (product.subCategory || '') : '',
      image: product.image,
      description: product.description, 
      mrpPrice: product.mrpPrice || 0,
      sellingPrice: product.sellingPrice || 0,
      unitType: product.unitType || 'gram',
      baseWeight: product.baseWeight || 1000,
      minOrderQty: product.minOrderQty || 500,
      stepSize: product.stepSize || 250,
      isAvailable: product.isAvailable,
      isComingSoon: product.isComingSoon || false,
    });
    setShowAddForm(true);
  };

  // --- Handlers for Users ---
  const updateUserRole = async (userId: string, newRole: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole as User['role'] } : u));
    } catch (error) {
      console.error("Error updating user role:", error);
    }
  };

  // --- Handlers for Orders ---
  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const statusHistory = [...order.statusHistory, { status: newStatus, time: new Date().toISOString() }];
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus, statusHistory, updatedAt: new Date().toISOString() });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, statusHistory } : o));
      
      // Trigger referral reward check when order is delivered
      if (newStatus === 'Delivered' && order.userId) {
        processReferralReward(order.userId, orderId).catch(err => 
          console.error('Referral reward check failed:', err)
        );
      }
    } catch(err) {
      console.error(err);
    }
  }

  const assignDeliveryPartner = async (orderId: string, partnerId: string) => {
    try {
      const now = new Date().toISOString();
      const order = orders.find(o => o.id === orderId);
      const newHistory = order ? [...order.statusHistory, { status: 'Order Received', time: now }] : [];
      await updateDoc(doc(db, 'orders', orderId), { 
        deliveryPartnerId: partnerId,
        assignedAt: now,
        status: 'Order Received',
        statusHistory: newHistory,
        updatedAt: now
      });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deliveryPartnerId: partnerId, assignedAt: now, status: 'Order Received' as Order['status'] } : o));
    } catch(err) {
      console.error(err);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'bookings', label: 'Bookings', icon: PartyPopper },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'categories', label: 'Categories', icon: Layers },
    { id: 'homepage', label: 'Homepage', icon: Globe },
    ...(isAdmin ? [
      { id: 'users', label: 'Users & Roles', icon: Users },
      { id: 'provisioning', label: 'Provisioning', icon: Shield },
      { id: 'verification', label: 'Verification', icon: Truck },
      { id: 'referrals', label: 'Referrals', icon: Gift },
      { id: 'settings', label: 'Settings', icon: Settings }
    ] : [])
  ];

  return (
    <div className="flex min-h-screen bg-[#f5f6f8]">

      {/* ─── MOBILE OVERLAY ─── */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* ─── SIDEBAR (truly fixed) ─── */}
      <aside className={cn(
        "fixed top-0 left-0 h-screen w-[260px] bg-gradient-to-b from-gray-900 via-gray-950 to-black z-50 flex flex-col transition-transform duration-300 ease-out",
        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="px-6 pt-7 pb-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-none tracking-tight">Kari King</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 mt-0.5">
                {isAdmin ? 'Admin Panel' : 'Manager'}
              </p>
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setMobileSidebarOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group",
                  isActive
                    ? "bg-red-600 text-white shadow-lg shadow-red-600/25"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                )}
              >
                <tab.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-white" : "text-gray-500 group-hover:text-gray-300")} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ─── Admin Profile Footer ─── */}
        <div className="shrink-0 border-t border-white/[0.06] relative" ref={profileMenuRef}>
          {/* Profile Menu Popup */}
          <AnimatePresence>
            {showProfileMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full left-3 right-3 mb-2 bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl overflow-hidden"
              >
                <button
                  onClick={() => { setActiveTab('settings'); setShowProfileMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4 text-gray-500" /> View Profile
                </button>
                <div className="border-t border-gray-700/50" />
                <button
                  onClick={async () => { await logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.04] transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-sm font-black text-white shadow-lg shadow-red-600/20 shrink-0">
              {(user?.name || user?.phone || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-bold text-gray-200 truncate">{user?.name || user?.phone || 'Admin'}</p>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">{isAdmin ? 'Administrator' : 'Manager'}</p>
            </div>
            <ChevronUp className={cn("w-4 h-4 text-gray-500 transition-transform duration-200", showProfileMenu ? "rotate-0" : "rotate-180")} />
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT AREA (offset by sidebar width) ─── */}
      <div className="flex-1 min-w-0 lg:ml-[260px]">
        {/* Mobile Top Bar */}
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setMobileSidebarOpen(true)} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <Menu className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-black text-gray-900">{tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}</h1>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white">
          <div>
            <h1 className="text-2xl font-black text-gray-900">{tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}</h1>
            <p className="text-sm text-gray-400 font-medium mt-0.5">{isAdmin ? 'Full admin access' : 'Manager access'}</p>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-4 lg:p-8 admin-safe-bottom">
          {loading ? (
             <div className="flex items-center justify-center h-48">Loading...</div>
          ) : (
            <AnimatePresence mode="wait">
               <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              
              {/* DASHBOARD TAB */}
              {activeTab === 'dashboard' && (
                <DashboardOverview orders={orders} />
              )}

              {/* HOMEPAGE CMS TAB */}
              {activeTab === 'homepage' && (
                <HomepageManager />
              )}
              
              {/* STAFF PROVISIONING TAB */}
              {activeTab === 'provisioning' && (
                <StaffProvisioning />
              )}
              {/* DRIVER VERIFICATION TAB */}
              {activeTab === 'verification' && (
                <DriverVerification />
              )}
              {/* ORDERS TAB (3-COLUMN KANBAN BOARD) */}
              {activeTab === 'orders' && (
                <AdminOrdersTab 
                  orders={orders}
                  deliveryPartners={deliveryPartners}
                  assignDeliveryPartner={assignDeliveryPartner}
                  updateOrderStatus={updateOrderStatus}
                />
              )}

              {/* BULK BOOKINGS TAB */}
              {activeTab === 'bookings' && (
                <AdminBookingsTab />
              )}

              {/* PRODUCTS TAB */}
              {activeTab === 'products' && (
                <div className="space-y-6">
                   {isAdmin && (
                    <div className="flex justify-end">
                      <button onClick={() => setShowAddForm(!showAddForm)} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 shadow-lg shadow-red-600/20">
                        {showAddForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        {showAddForm ? 'Cancel' : 'Add Product'}
                      </button>
                    </div>
                  )}

                  <AnimatePresence>
                    {showAddForm && isAdmin && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden overflow-y-visible mb-8">
                        <div className="p-6 md:p-8 border-b border-gray-100">
                           <h2 className="text-xl font-bold text-gray-900">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                           <p className="text-sm text-gray-400 mt-1">Fill out the details below to publish to the store.</p>
                        </div>
                        <form onSubmit={handleProductSubmit} className="p-6 md:p-8">
                          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
                             {/* LEFT COLUMN: FORM DETAILS */}
                             <div className="space-y-6">
                                {/* Basic Info */}
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Product Name</label>
                                    <input type="text" placeholder="e.g. Country Chicken Curry Cut" required className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                                  </div>

                                  {/* Step 1 — Main Category */}
                                  <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Main Category</label>
                                    <select
                                      className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium cursor-pointer"
                                      value={formData.mainCategory}
                                      onChange={(e) => {
                                        const newMain = e.target.value;
                                        const subs = getDynamicSubCategories(newMain);
                                        setFormData({ ...formData, mainCategory: newMain, subCategory: subs[0]?.id || '', customSubCategory: '' });
                                      }}
                                    >
                                      {dynamicCategories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Step 2 — Subcategory or custom input for Others */}
                                  <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                      {isOthers ? 'Custom Product Type' : 'Subcategory'}
                                    </label>
                                    {isOthers ? (
                                      <input
                                        type="text"
                                        placeholder="e.g. Quail, Rabbit, Horse Meat…"
                                        required
                                        className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-purple-600/10 focus:border-purple-600 transition-all outline-none font-medium"
                                        value={formData.customSubCategory}
                                        onChange={(e) => setFormData({ ...formData, customSubCategory: e.target.value })}
                                      />
                                    ) : (
                                      <div className="space-y-3">
                                        <select
                                          className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium cursor-pointer"
                                          value={formData.subCategory === '__custom__' ? '__custom__' : formData.subCategory}
                                          onChange={(e) => {
                                            if (e.target.value === '__custom__') {
                                              setFormData({ ...formData, subCategory: '__custom__', customSubCategory: '' });
                                            } else {
                                              setFormData({ ...formData, subCategory: e.target.value, customSubCategory: '' });
                                            }
                                          }}
                                        >
                                          {availableSubCategories.map(sub => (
                                            <option key={sub.id} value={sub.id}>
                                              {sub.label}{sub.labelTamil ? ` (${sub.labelTamil})` : ''}
                                            </option>
                                          ))}
                                          <option value="__custom__">✏️ Other (Type manually)</option>
                                        </select>
                                        {formData.subCategory === '__custom__' && (
                                          <input
                                            type="text"
                                            placeholder="Type custom subcategory name..."
                                            required
                                            autoFocus
                                            className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium"
                                            value={formData.customSubCategory}
                                            onChange={(e) => setFormData({ ...formData, customSubCategory: e.target.value })}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Divider */}
                                <hr className="border-gray-100" />

                                {/* Pricing Section — Smart Unit Pricing */}
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Smart Pricing</label>
                                    {formData.mrpPrice > formData.sellingPrice && formData.mrpPrice > 0 && (
                                      <span className="text-[10px] font-black bg-green-100 text-green-700 px-2 py-1 rounded-lg uppercase tracking-wider">
                                        Auto: {Math.round(((formData.mrpPrice - formData.sellingPrice) / formData.mrpPrice) * 100)}% OFF
                                      </span>
                                    )}
                                  </div>
                                  
                                  <p className="text-[11px] text-gray-400 -mt-2">Enter price per single unit. Total price auto-calculates from Unit Price × Base Quantity.</p>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Unit Selling Price — PRIMARY INPUT */}
                                    <div>
                                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                                        Unit Price (₹ per 1 {formData.unitType === 'gram' ? 'kg' : formData.unitType === 'piece' ? 'pc' : formData.unitType === 'litre' ? 'L' : 'kg'})
                                      </label>
                                      <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                          <IndianRupee className="w-4 h-4 text-red-600" />
                                        </div>
                                        <input 
                                          type="number" 
                                          placeholder="e.g. 10 per egg, 220 per kg" 
                                          required 
                                          className="w-full py-4 pr-4 pl-12 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-black text-lg text-gray-900" 
                                          value={formData.baseWeight > 0 ? (Math.round((formData.sellingPrice / formData.baseWeight) * 100) / 100) || '' : formData.sellingPrice || ''} 
                                          onChange={(e) => {
                                            const unitPrice = Number(e.target.value);
                                            const bw = formData.baseWeight || 1;
                                            const newSelling = Math.round(unitPrice * bw * 100) / 100;
                                            // Scale MRP proportionally if it exists
                                            const currentUnitMrp = formData.mrpPrice > 0 && formData.sellingPrice > 0 
                                              ? (formData.mrpPrice / formData.sellingPrice) * unitPrice 
                                              : unitPrice;
                                            setFormData({ 
                                              ...formData, 
                                              sellingPrice: newSelling,
                                              mrpPrice: Math.round(currentUnitMrp * bw * 100) / 100
                                            });
                                          }} 
                                        />
                                      </div>
                                    </div>
                                    
                                    {/* Unit MRP — OPTIONAL */}
                                    <div>
                                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                                        MRP per unit (optional, for discount)
                                      </label>
                                      <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                          <IndianRupee className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <input 
                                          type="number" 
                                          placeholder="MRP per unit (higher than selling)" 
                                          className="w-full py-4 pr-4 pl-12 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium line-through text-gray-500" 
                                          value={formData.baseWeight > 0 ? (Math.round((formData.mrpPrice / formData.baseWeight) * 100) / 100) || '' : formData.mrpPrice || ''} 
                                          onChange={(e) => {
                                            const unitMrp = Number(e.target.value);
                                            const bw = formData.baseWeight || 1;
                                            setFormData({ ...formData, mrpPrice: Math.round(unitMrp * bw * 100) / 100 });
                                          }} 
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Auto-calculated total prices */}
                                  {formData.sellingPrice > 0 && (
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Auto-Calculated Total</p>
                                        <p className="text-sm font-black text-emerald-900">
                                          Selling: ₹{formData.sellingPrice}
                                          {formData.mrpPrice > formData.sellingPrice && (
                                            <span className="text-gray-400 font-medium line-through ml-2">MRP: ₹{formData.mrpPrice}</span>
                                          )}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[10px] text-emerald-600">for {formData.baseWeight} {formData.unitType === 'gram' ? 'g' : formData.unitType === 'piece' ? 'pcs' : formData.unitType === 'litre' ? 'L' : 'kg'}</p>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {formData.sellingPrice > formData.mrpPrice && formData.mrpPrice > 0 && (
                                    <p className="text-xs font-semibold text-red-500 mt-1">⚠️ MRP per unit must be ≥ selling price per unit.</p>
                                  )}
                                </div>

                                {/* Divider */}
                                <hr className="border-gray-100" />

                                {/* Description */}
                                <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Description</label>
                                  <textarea rows={4} placeholder="Describe the cut, freshness, and weight..." className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium resize-none leading-relaxed" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                                </div>
                                
                                {/* Divider */}
                                <hr className="border-gray-100" />
                                
                                {/* Inventory & Sizing Matrix */}
                                <div className="space-y-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    Inventory & Sizing Matrix
                                  </h3>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Unit Type</label>
                                      <select className="w-full p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-sm font-medium" value={formData.unitType} onChange={(e) => {
                                        const ut = e.target.value as any;
                                        const defaults = ut === 'gram' ? { baseWeight: 1000, minOrderQty: 500, stepSize: 250 } 
                                          : ut === 'piece' ? { baseWeight: 1, minOrderQty: 1, stepSize: 1 }
                                          : ut === 'litre' ? { baseWeight: 1, minOrderQty: 1, stepSize: 1 }
                                          : { baseWeight: 1, minOrderQty: 1, stepSize: 1 };
                                        // Preserve unit price when switching type
                                        const oldBw = formData.baseWeight || 1;
                                        const unitPrice = formData.sellingPrice / oldBw;
                                        const unitMrp = formData.mrpPrice / oldBw;
                                        const newBw = defaults.baseWeight;
                                        setFormData({ 
                                          ...formData, unitType: ut, ...defaults,
                                          sellingPrice: Math.round(unitPrice * newBw * 100) / 100,
                                          mrpPrice: Math.round(unitMrp * newBw * 100) / 100,
                                        });
                                      }}>
                                        <option value="gram">Gram (g) — Meats, Fish</option>
                                        <option value="kg">Kilogram (kg)</option>
                                        <option value="piece">Piece (pcs) — Eggs, Items</option>
                                        <option value="litre">Litre (L) — Milk, Liquids</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                        {formData.unitType === 'piece' ? 'Default Quantity (e.g. 12 eggs)' : formData.unitType === 'gram' ? 'Base Weight (grams)' : 'Base Quantity'}
                                      </label>
                                      <div className="flex bg-white rounded-xl overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-red-600/20 focus-within:border-red-600 transition-all">
                                        <input type="number" required placeholder={formData.unitType === 'gram' ? '1000' : '1'} className="w-full p-3 outline-none text-sm font-medium" value={formData.baseWeight} onChange={(e) => {
                                          const newBw = Number(e.target.value);
                                          if (newBw <= 0) { setFormData({ ...formData, baseWeight: newBw }); return; }
                                          // Preserve unit price when changing base weight
                                          const oldBw = formData.baseWeight || 1;
                                          const unitPrice = formData.sellingPrice / oldBw;
                                          const unitMrp = formData.mrpPrice / oldBw;
                                          setFormData({ 
                                            ...formData, 
                                            baseWeight: newBw,
                                            sellingPrice: Math.round(unitPrice * newBw * 100) / 100,
                                            mrpPrice: Math.round(unitMrp * newBw * 100) / 100,
                                          });
                                        }} />
                                        <div className="px-3 bg-gray-50 flex items-center text-xs font-bold text-gray-400 border-l border-gray-200">{formData.unitType === 'gram' ? 'g' : formData.unitType === 'piece' ? 'pcs' : formData.unitType === 'litre' ? 'L' : 'kg'}</div>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Min Order Qty</label>
                                      <div className="flex bg-white rounded-xl overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-red-600/20 focus-within:border-red-600 transition-all">
                                        <input type="number" required placeholder={formData.unitType === 'gram' ? '500' : '1'} className="w-full p-3 outline-none text-sm font-medium" value={formData.minOrderQty} onChange={(e) => setFormData({ ...formData, minOrderQty: Number(e.target.value) })} />
                                        <div className="px-3 bg-gray-50 flex items-center text-xs font-bold text-gray-400 border-l border-gray-200">{formData.unitType === 'gram' ? 'g' : formData.unitType === 'piece' ? 'pcs' : formData.unitType === 'litre' ? 'L' : 'kg'}</div>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Step Size (+/- jumps)</label>
                                      <div className="flex bg-white rounded-xl overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-red-600/20 focus-within:border-red-600 transition-all">
                                        <input type="number" required placeholder={formData.unitType === 'gram' ? '250' : '1'} className="w-full p-3 outline-none text-sm font-medium" value={formData.stepSize} onChange={(e) => setFormData({ ...formData, stepSize: Number(e.target.value) })} />
                                        <div className="px-3 bg-gray-50 flex items-center text-xs font-bold text-gray-400 border-l border-gray-200">{formData.unitType === 'gram' ? 'g' : formData.unitType === 'piece' ? 'pcs' : formData.unitType === 'litre' ? 'L' : 'kg'}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                             </div>

                             {/* RIGHT COLUMN: IMAGE UPLOAD */}
                             <div className="h-full flex flex-col pt-1 lg:pt-0">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Product Image (Required)</label>
                                <div className="flex-1 min-h-[280px]">
                                  <ImageUploadDropzone 
                                    className="h-full"
                                    value={formData.image} 
                                    onChange={(url) => setFormData({ ...formData, image: url })} 
                                  />
                                </div>
                             </div>
                          </div>
                          
                          {/* FORM ACTIONS */}
                          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                             <button type="button" onClick={resetForm} className="w-full sm:w-auto px-6 py-4 sm:py-3 font-bold text-gray-500 hover:bg-gray-50 rounded-2xl transition-colors">
                               Cancel
                             </button>
                             <button 
                               type="submit" 
                               disabled={!formData.image || (formData.sellingPrice > formData.mrpPrice) || formData.sellingPrice <= 0} 
                               className="w-full sm:w-auto min-w-[200px] px-8 py-4 sm:py-3 font-bold text-white rounded-2xl shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-red-600/40 active:scale-[0.98] flex items-center justify-center gap-2"
                               style={{ background: 'linear-gradient(135deg, #8B0000 0%, #D9381E 100%)' }}
                              >
                               <Check className="w-5 h-5" />
                               {editingProduct ? 'Save Changes' : 'Publish Product'}
                             </button>
                          </div>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Product</th>
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Status</th>
                          {isAdmin && <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {products.map((product) => (
                          <tr key={product.id} className="hover:bg-gray-50 group">
                            <td className="p-4">
                              <div className="flex items-center gap-4">
                                <img src={product.image} alt={product.name} className="w-12 h-12 rounded-xl object-cover border border-gray-100" />
                                <div>
                                  <p className="font-bold text-gray-900 flex items-center gap-2">
                                    {product.name} 
                                    <span className="text-xs text-gray-400 line-through font-normal">₹{product.mrpPrice}</span>
                                    <span className="text-sm text-red-600">₹{product.sellingPrice}</span>
                                    {product.discountPercentage ? (
                                      <span className="text-[10px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase">{product.discountPercentage}% OFF</span>
                                    ) : null}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    <span className="font-semibold text-gray-600">{product.mainCategory || product.category}</span>
                                    {product.subCategory && <span className="text-gray-400"> › {product.subCategory}</span>}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex flex-col gap-2 items-center">
                                <button onClick={() => toggleAvailability(product)} className={cn("inline-flex items-center gap-2 font-bold text-xs uppercase transition-colors", product.isAvailable ? "text-green-600" : "text-gray-400")}>
                                  {product.isAvailable ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                  {product.isAvailable ? 'Available' : 'Sold Out'}
                                </button>
                                <button onClick={() => toggleComingSoon(product)} className={cn("inline-flex items-center gap-2 font-bold text-xs uppercase transition-colors", product.isComingSoon ? "text-amber-500" : "text-gray-400")}>
                                  {product.isComingSoon ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                  Coming Soon
                                </button>
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => startEdit(product)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 className="w-5 h-5" /></button>
                                  <button onClick={() => handleProductDelete(product.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* USERS TAB */}
              {activeTab === 'users' && isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Phone / UID</th>
                        <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Coins (Available / Locked)</th>
                        <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <tr key={u.uid} className="hover:bg-gray-50">
                          <td className="p-4">
                            <p className="font-bold text-gray-900">{u.phone}</p>
                            <p className="text-[10px] text-gray-400">UID: {u.uid}</p>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-green-600 font-bold">{u.coins}</span>
                            <span className="text-gray-300 mx-2">/</span>
                            <span className="text-yellow-600 font-bold">{u.lockedCoins || 0}</span>
                          </td>
                          <td className="p-4 text-right">
                             <select 
                                className={cn(
                                  "p-2 text-xs font-bold uppercase tracking-wider border rounded-lg",
                                  u.role === 'admin' ? "bg-red-50 text-red-700 border-red-200" :
                                  u.role === 'manager' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  u.role === 'delivery' ? "bg-orange-50 text-orange-700 border-orange-200" :
                                  "bg-gray-50 text-gray-700 border-gray-200"
                                )}
                                value={u.role}
                                onChange={(e) => updateUserRole(u.uid, e.target.value)}
                              >
                                <option value="user">User</option>
                                <option value="delivery">Delivery Partner</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Admin</option>
                              </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REFERRALS TAB */}
              {activeTab === 'referrals' && isAdmin && (
                <div className="space-y-6">
                  {/* Referral Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Referrals</p>
                      <p className="text-3xl font-black text-gray-900 mt-1">{referrals.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Completed</p>
                      <p className="text-3xl font-black text-green-600 mt-1">{referrals.filter(r => r.status === 'completed').length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pending</p>
                      <p className="text-3xl font-black text-yellow-600 mt-1">{referrals.filter(r => r.status === 'pending').length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Coins Given</p>
                      <p className="text-3xl font-black text-blue-600 mt-1">{referrals.filter(r => r.status === 'completed').length * 5}</p>
                    </div>
                  </div>

                  {/* Search & Filter */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      placeholder="Search by phone, referrer ID..."
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                      id="referral-search"
                      onChange={(e) => {
                        const search = e.target.value.toLowerCase();
                        const rows = document.querySelectorAll('[data-referral-row]');
                        rows.forEach(row => {
                          const text = row.textContent?.toLowerCase() || '';
                          (row as HTMLElement).style.display = text.includes(search) ? '' : 'none';
                        });
                      }}
                    />
                    <select
                      className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                      onChange={(e) => {
                        const filter = e.target.value;
                        const rows = document.querySelectorAll('[data-referral-row]');
                        rows.forEach(row => {
                          const status = row.getAttribute('data-status') || '';
                          (row as HTMLElement).style.display = filter === 'all' || status === filter ? '' : 'none';
                        });
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending Only</option>
                      <option value="completed">Completed Only</option>
                    </select>
                  </div>

                  {/* Referrals Table */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Referrer</th>
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Friend (Phone)</th>
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Date</th>
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Reward</th>
                          <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {referrals.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-12 text-center text-gray-400">No referrals yet.</td>
                          </tr>
                        ) : referrals.map(r => {
                          // Try to find referrer user details
                          const referrerUser = users.find(u => u.uid === r.referrerId);
                          return (
                            <tr key={r.id} className="hover:bg-gray-50" data-referral-row data-status={r.status}>
                              <td className="p-4">
                                <p className="font-bold text-gray-900 text-sm">{referrerUser?.name || r.referrerPhone || 'Unknown'}</p>
                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">{r.referrerId.slice(0, 8)}...</p>
                                {(referrerUser?.phone || r.referrerPhone) && (
                                  <p className="text-xs text-gray-500 mt-0.5">{referrerUser?.phone || r.referrerPhone}</p>
                                )}
                              </td>
                              <td className="p-4">
                                <p className="font-medium text-gray-900">{r.referredUserPhone || 'Unknown'}</p>
                              </td>
                              <td className="p-4 text-xs text-gray-500">
                                {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {r.completedAt && (
                                  <p className="text-green-600 text-[10px] mt-0.5">Completed: {new Date(r.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                )}
                              </td>
                              <td className="p-4">
                                <span className="text-sm font-bold text-gray-700">{r.reward} coins</span>
                                {r.rewardGiven && <span className="text-[10px] text-green-600 block">✓ Given</span>}
                              </td>
                              <td className="p-4 text-right">
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                  r.status === 'completed' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                )}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CATEGORIES MANAGEMENT */}
              {activeTab === 'categories' && (
                <CategoriesManager />
              )}

              {/* SETTINGS HUB */}
              {activeTab === 'settings' && (
                <AdminSettings />
              )}
            </motion.div>
          </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
