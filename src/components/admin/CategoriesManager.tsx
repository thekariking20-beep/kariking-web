import React, { useState } from 'react';
import { collection, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCategories } from '../../context/CategoriesContext';
import { MAIN_CATEGORIES } from '../../config/categories';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, X, Check, ToggleLeft, ToggleRight, Upload, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CategoryForm {
  id: string;
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
  type: 'meat' | 'masala' | 'pickle' | 'other';
  orderPriority: number;
  subCategories: { id: string; label: string }[];
}

const EMPTY_FORM: CategoryForm = {
  id: '', name: '', icon: '📦', color: 'from-gray-500 to-gray-600',
  isActive: true, type: 'other', orderPriority: 999, subCategories: [],
};

const COLOR_PRESETS = [
  { label: 'Orange-Amber', value: 'from-amber-500 to-orange-500' },
  { label: 'Red-Rose', value: 'from-red-600 to-rose-700' },
  { label: 'Blue-Cyan', value: 'from-blue-500 to-cyan-600' },
  { label: 'Orange-Red', value: 'from-orange-500 to-red-500' },
  { label: 'Yellow-Amber', value: 'from-yellow-400 to-amber-500' },
  { label: 'Chili Red', value: 'from-orange-600 to-red-600' },
  { label: 'Golden', value: 'from-yellow-500 to-orange-500' },
  { label: 'Purple-Indigo', value: 'from-purple-500 to-indigo-600' },
  { label: 'Green-Emerald', value: 'from-green-500 to-emerald-600' },
  { label: 'Sky-Blue', value: 'from-sky-400 to-blue-500' },
  { label: 'Pink-Rose', value: 'from-pink-500 to-rose-500' },
];

export default function CategoriesManager() {
  const { allCategories, loading } = useCategories();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CategoryForm>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [newSubLabel, setNewSubLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Seed Firestore from static config (one-time)
  const handleSeedCategories = async () => {
    if (!window.confirm('This will initialize Firestore categories from the default list. Existing categories with the same ID will be overwritten. Continue?')) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      MAIN_CATEGORIES.forEach(cat => {
        const ref = doc(db, 'categories', cat.id);
        batch.set(ref, {
          name: cat.label,
          icon: cat.icon,
          color: cat.color,
          isActive: cat.isActive !== false,
          type: cat.type || 'other',
          orderPriority: cat.orderPriority ?? 999,
          subCategories: cat.subCategories,
        });
      });
      await batch.commit();
      alert('Categories seeded successfully!');
    } catch (e: any) {
      console.error(e);
      alert('Failed to seed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim() || !formData.name.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'categories', formData.id), {
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        isActive: formData.isActive,
        type: formData.type,
        orderPriority: formData.orderPriority,
        subCategories: formData.subCategories,
      });
      resetForm();
    } catch (e: any) {
      console.error(e);
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete category "${id}"? Products in this category will become uncategorized.`)) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (e: any) {
      alert('Failed to delete: ' + (e.message || e));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (cat: any) => {
    try {
      await setDoc(doc(db, 'categories', cat.id), {
        name: cat.label,
        icon: cat.icon,
        color: cat.color,
        isActive: !cat.isActive,
        type: cat.type || 'other',
        orderPriority: cat.orderPriority ?? 999,
        subCategories: cat.subCategories,
      });
    } catch (e: any) {
      alert('Failed to toggle: ' + e.message);
    }
  };

  const startEdit = (cat: any) => {
    setFormData({
      id: cat.id,
      name: cat.label,
      icon: cat.icon,
      color: cat.color,
      isActive: cat.isActive !== false,
      type: cat.type || 'other',
      orderPriority: cat.orderPriority ?? 999,
      subCategories: [...cat.subCategories],
    });
    setEditing(true);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditing(false);
    setShowForm(false);
    setNewSubLabel('');
  };

  const addSubCategory = () => {
    if (!newSubLabel.trim()) return;
    setFormData(prev => ({
      ...prev,
      subCategories: [...prev.subCategories, { id: newSubLabel.trim(), label: newSubLabel.trim() }],
    }));
    setNewSubLabel('');
  };

  const removeSubCategory = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      subCategories: prev.subCategories.filter((_, i) => i !== idx),
    }));
  };

  // Check if categories exist in Firestore
  const firestoreHasCategories = allCategories.length > 0 && !loading;
  // Check if it's still using static fallback (no Firestore docs exist)
  const isStaticFallback = !loading && allCategories === MAIN_CATEGORIES;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Categories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage product categories dynamically. Changes reflect instantly across the app.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Seed button — shown when Firestore is empty */}
          <button
            onClick={handleSeedCategories}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {saving ? 'Seeding...' : 'Seed Defaults'}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-5 py-2.5 text-sm font-bold rounded-xl bg-premium-gradient text-white shadow-lg shadow-red-600/20 flex items-center gap-2 hover:shadow-xl transition-shadow"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{editing ? 'Edit Category' : 'New Category'}</h3>
                <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category ID */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Category ID</label>
                  <input
                    type="text"
                    required
                    disabled={editing}
                    placeholder="e.g. Masala"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm disabled:opacity-50"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  />
                </div>
                {/* Display Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Masala Powders"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                {/* Icon */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Icon (emoji)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 🌶️"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm text-center text-xl"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  />
                </div>
                {/* Type */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Category Type</label>
                  <select
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  >
                    <option value="meat">Meat (Core)</option>
                    <option value="masala">Masala</option>
                    <option value="pickle">Pickle</option>
                    <option value="other">Other / Snack</option>
                  </select>
                </div>
                {/* Priority */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Priority (Lower = First)</label>
                  <input
                    type="number"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm"
                    value={formData.orderPriority}
                    onChange={(e) => setFormData({ ...formData, orderPriority: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Color Gradient */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Gradient Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: preset.value })}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-2',
                        formData.color === preset.value
                          ? 'border-gray-900 ring-2 ring-gray-900/20'
                          : 'border-transparent hover:border-gray-200'
                      )}
                    >
                      <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${preset.value} mb-0.5 mx-auto`} />
                      <span className="text-[9px] text-gray-500">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-Categories */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Sub-categories</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {formData.subCategories.map((sub, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-full">
                      {sub.label}
                      <button type="button" onClick={() => removeSubCategory(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {formData.subCategories.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No sub-categories yet</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add sub-category..."
                    className="flex-1 p-2.5 border border-gray-200 rounded-xl bg-gray-50/50 outline-none text-sm font-medium focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    value={newSubLabel}
                    onChange={(e) => setNewSubLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubCategory())}
                  />
                  <button type="button" onClick={addSubCategory} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors">
                    Add
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Preview</label>
                <div className={`inline-flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl bg-gradient-to-br ${formData.color} text-white min-w-[100px] shadow-lg`}>
                  <span className="text-2xl">{formData.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{formData.name || 'Category'}</span>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-5 py-2.5 text-sm font-bold text-gray-500 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 text-sm font-bold rounded-xl bg-premium-gradient text-white shadow-md disabled:opacity-50 flex items-center gap-2">
                  {saving ? 'Saving...' : (editing ? 'Update Category' : 'Create Category')}
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {allCategories.map((cat, idx) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-4 p-3 sm:p-4">
                {/* Drag handle placeholder */}
                <div className="text-gray-300 mt-2 sm:mt-0 hidden sm:block">
                  <GripVertical className="w-5 h-5" />
                </div>
                
                {/* Icon */}
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-lg sm:text-xl shadow-md shrink-0`}>
                  {cat.icon}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 text-sm truncate">{cat.label}</h3>
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 uppercase tracking-widest shrink-0">{cat.id}</span>
                    {cat.isActive === false && (
                      <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 uppercase tracking-widest shrink-0">Disabled</span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="whitespace-nowrap">{cat.subCategories.length} sub-categories</span>
                    <span className="text-gray-300 hidden sm:inline">•</span>
                    <span className="capitalize text-gray-500 font-medium whitespace-nowrap">Type: {cat.type || 'other'}</span>
                    <span className="text-gray-300 hidden sm:inline">•</span>
                    <span className="text-gray-500 font-medium whitespace-nowrap">Priority: {cat.orderPriority ?? 999}</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap justify-end sm:flex-nowrap items-center gap-1 sm:gap-1.5 shrink-0 max-w-[80px] sm:max-w-none">
                  <button
                    onClick={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
                    className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    {expandedId === cat.id ? <ChevronUp className="w-4 h-4 sm:w-4 sm:h-4" /> : <ChevronDown className="w-4 h-4 sm:w-4 sm:h-4" />}
                  </button>
                  <button
                    onClick={() => toggleActive(cat)}
                    className="p-1.5 sm:p-2 rounded-lg transition-colors"
                    title={cat.isActive !== false ? 'Disable' : 'Enable'}
                  >
                    {cat.isActive !== false 
                      ? <ToggleRight className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                      : <ToggleLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    }
                  </button>
                  <button onClick={() => startEdit(cat)} className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(cat.id)} 
                    disabled={deletingId === cat.id}
                    className={cn(
                      'p-1.5 sm:p-2 rounded-lg transition-colors',
                      deletingId === cat.id ? 'text-red-400 bg-red-50 cursor-wait animate-pulse' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded sub-categories */}
              <AnimatePresence>
                {expandedId === cat.id && cat.subCategories.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-50 bg-gray-50/50 px-4 py-3"
                  >
                    <div className="flex flex-wrap gap-2">
                      {cat.subCategories.map(sub => (
                        <span key={sub.id} className="text-xs font-bold text-gray-600 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                          {sub.label}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
