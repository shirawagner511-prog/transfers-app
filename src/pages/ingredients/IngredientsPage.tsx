import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Search, History, TrendingUp, Wheat, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Ingredient, Supplier, IngredientPriceHistory } from '@/types/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDateTime } from '@/lib/dateUtils';
import { ExportButton } from '@/components/ui/ExportButton';

const UNITS = ['ק"ג', 'גרם', 'ליטר', 'מ"ל', 'יחידה', 'חבילה', 'קרטון', 'צרור'];
const CATEGORIES = ['ירקות', 'פירות', 'בשר', 'עוף', 'דגים', 'מוצרי חלב', 'לחם ואפייה', 'תבלינים', 'שמנים', 'יבש', 'משקאות', 'אחר'];

const schema = z.object({
  name: z.string().min(1, 'שם המרכיב נדרש'),
  category: z.string().optional(),
  unit: z.string().min(1, 'יחידת מידה נדרשת'),
  current_price: z.number().min(0, 'מחיר לא יכול להיות שלילי'),
  supplier_id: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
});

const priceSchema = z.object({
  new_price: z.number().min(0, 'מחיר לא יכול להיות שלילי'),
  note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type PriceFormData = z.infer<typeof priceSchema>;

async function fetchIngredients() {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*, supplier:suppliers(id,name)')
    .order('name');
  if (error) throw error;
  return data as Ingredient[];
}

async function fetchSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('id,name').order('name');
  if (error) throw error;
  return data as Supplier[];
}

async function fetchPriceHistory(ingredientId: string) {
  const { data, error } = await supabase
    .from('ingredient_price_history')
    .select('*')
    .eq('ingredient_id', ingredientId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data as IngredientPriceHistory[];
}

export function IngredientsPage() {
  const { canEdit, canApprove, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [confirmDelete, setConfirmDelete] = useState<Ingredient | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceTarget, setPriceTarget] = useState<Ingredient | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Ingredient | null>(null);

  const { data: ingredients = [], isLoading } = useQuery({ queryKey: ['ingredients'], queryFn: fetchIngredients });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: fetchSuppliers });
  const { data: priceHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['ingredient-price-history', historyTarget?.id],
    queryFn: () => fetchPriceHistory(historyTarget!.id),
    enabled: !!historyTarget,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  });

  const { register: regPrice, handleSubmit: handlePriceSubmit, reset: resetPrice, formState: { errors: priceErrors } } = useForm<PriceFormData>({
    resolver: zodResolver(priceSchema),
  });

  const upsert = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        category: data.category || null,
        supplier_id: data.supplier_id || null,
        notes: data.notes || null,
        is_active: editing ? editing.is_active : true,
        updated_by: user?.id,
        created_by: editing ? undefined : user?.id,
      };
      if (editing) {
        const { error } = await supabase.from('ingredients').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ingredients').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success(editing ? 'המרכיב עודכן' : 'המרכיב נוסף');
      closeModal();
    },
    onError: () => toast.error('שגיאה בשמירת המרכיב'),
  });

  const updatePrice = useMutation({
    mutationFn: async (data: PriceFormData) => {
      if (!priceTarget) return;
      const { error: histErr } = await supabase.from('ingredient_price_history').insert({
        ingredient_id: priceTarget.id,
        old_price: priceTarget.current_price,
        new_price: data.new_price,
        changed_by: user?.id,
        note: data.note || null,
      });
      if (histErr) throw histErr;
      const { error } = await supabase
        .from('ingredients')
        .update({ current_price: data.new_price, updated_by: user?.id })
        .eq('id', priceTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('המחיר עודכן בהצלחה');
      setPriceModalOpen(false);
      setPriceTarget(null);
      resetPrice();
    },
    onError: () => toast.error('שגיאה בעדכון המחיר'),
  });

  const setActive = useMutation({
    mutationFn: async ({ ingredient, active }: { ingredient: Ingredient; active: boolean }) => {
      const { error } = await supabase
        .from('ingredients')
        .update({ is_active: active, updated_by: user?.id })
        .eq('id', ingredient.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success(vars.active ? 'המרכיב שוחזר' : 'המרכיב הועבר לארכיון');
    },
    onError: () => toast.error('שגיאה בעדכון המרכיב'),
  });

  const hardDelete = useMutation({
    mutationFn: async (ingredient: Ingredient) => {
      const { error } = await supabase.from('ingredients').delete().eq('id', ingredient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('המרכיב נמחק לצמיתות');
      setConfirmDelete(null);
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        toast.error('לא ניתן למחוק — המרכיב משויך למוצרים קיימים. הוא יישאר בארכיון.');
      } else {
        toast.error('שגיאה במחיקת המרכיב');
      }
      setConfirmDelete(null);
    },
  });


  const bulkDelete = useMutation({
    mutationFn: async (items: Ingredient[]) => {
      let deleted = 0, blocked = 0;
      for (const ing of items) {
        const { error } = await supabase.from('ingredients').delete().eq('id', ing.id);
        if (error) {
          if ((error as { code?: string }).code === '23503') blocked++;
          else throw error;
        } else deleted++;
      }
      return { deleted, blocked };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success(res.blocked > 0
        ? `נמחקו ${res.deleted}, ${res.blocked} משויכים למוצרים ולא נמחקו`
        : `נמחקו ${res.deleted} מרכיבים`);
      setConfirmBulk(false);
    },
    onError: () => { toast.error('שגיאה במחיקה'); setConfirmBulk(false); },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', category: '', unit: '', current_price: 0, supplier_id: '', notes: '', is_active: true });
    setModalOpen(true);
  }

  function openEdit(ing: Ingredient) {
    setEditing(ing);
    reset({
      name: ing.name,
      category: ing.category ?? '',
      unit: ing.unit,
      current_price: ing.current_price,
      supplier_id: ing.supplier_id ?? '',
      notes: ing.notes ?? '',
      is_active: ing.is_active,
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditing(null); reset(); }

  function openPriceModal(ing: Ingredient) {
    setPriceTarget(ing);
    resetPrice({ new_price: ing.current_price, note: '' });
    setPriceModalOpen(true);
  }

  function openHistory(ing: Ingredient) {
    setHistoryTarget(ing);
    setHistoryModalOpen(true);
  }

  const activeIngredients = ingredients.filter(i => i.is_active);
  const archivedIngredients = ingredients.filter(i => !i.is_active);
  const filtered = (view === 'active' ? activeIngredients : archivedIngredients).filter(ing => {
    if (filterCategory && ing.category !== filterCategory) return false;
    if (filterSupplier && ing.supplier_id !== filterSupplier) return false;
    if (filterUnit && ing.unit !== filterUnit) return false;
    if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportRows = filtered.map(ing => ({
    'שם': ing.name,
    'קטגוריה': ing.category ?? '',
    'יחידה': ing.unit,
    'מחיר נוכחי (₪)': ing.current_price,
    'ספק': ing.supplier?.name ?? '',
    'סטטוס': ing.is_active ? 'פעיל' : 'בארכיון',
  }));

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="מרכיבים"
        subtitle={`${ingredients.filter(i => i.is_active).length} מרכיבים פעילים`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton filename="מרכיבים" rows={exportRows} />
            {canEdit() && (
              <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>הוסף מרכיב</Button>
            )}
          </div>
        }
      />

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setView('active')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'active' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          פעילים ({activeIngredients.length})
        </button>
        <button
          onClick={() => setView('archive')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'archive' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ארכיון ({archivedIngredients.length})
        </button>
      </div>

      {view === 'archive' && canApprove() && archivedIngredients.length > 0 && (
        <div className="mb-4">
          <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmBulk(true)}>
            מחק את כל הארכיון לצמיתות ({archivedIngredients.length})
          </Button>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input placeholder="חפש מרכיב..." value={search} onChange={e => setSearch(e.target.value)}
            startIcon={<Search className="w-4 h-4" />} />
          <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} placeholder="כל הקטגוריות">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} placeholder="כל הספקים">
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} placeholder="כל היחידות">
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={view === 'archive' ? 'הארכיון ריק' : 'לא נמצאו מרכיבים'}
          icon={<Wheat className="w-12 h-12" />}
          action={view === 'active' && canEdit() ? { label: 'הוסף מרכיב', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">קטגוריה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">יחידה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מחיר נוכחי</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ספק</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{ing.name}</td>
                  <td className="px-4 py-3 text-gray-600">{ing.category ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{ing.unit}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(ing.current_price)}</td>
                  <td className="px-4 py-3 text-gray-600">{ing.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={ing.is_active ? 'green' : 'gray'}>{ing.is_active ? 'פעיל' : 'לא פעיל'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openHistory(ing)} title="היסטוריית מחיר">
                        <History className="w-4 h-4" />
                      </Button>
                      {canEdit() && ing.is_active && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openPriceModal(ing)} title="עדכן מחיר">
                            <TrendingUp className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(ing)} title="עריכה">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setActive.mutate({ ingredient: ing, active: false })} title="העבר לארכיון">
                            <Archive className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {canEdit() && !ing.is_active && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setActive.mutate({ ingredient: ing, active: true })} title="שחזר">
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          {canApprove() && (
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(ing)} title="מחק לצמיתות">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'עריכת מרכיב' : 'הוספת מרכיב'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>ביטול</Button>
            <Button onClick={handleSubmit(d => upsert.mutate(d))} loading={isSubmitting || upsert.isPending}>
              {editing ? 'שמור' : 'הוסף'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="שם המרכיב" required error={errors.name?.message} {...register('name')} className="col-span-2" />
            <Select label="קטגוריה" placeholder="בחר קטגוריה" {...register('category')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="יחידת מידה" required error={errors.unit?.message} placeholder="בחר יחידה" {...register('unit')}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
            <Input
              label="מחיר נוכחי (₪)"
              type="number"
              step="0.01"
              required
              error={errors.current_price?.message}
              {...register('current_price', { valueAsNumber: true })}
            />
            <Select label="ספק" placeholder="ללא ספק" {...register('supplier_id')}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <Textarea label="הערות" {...register('notes')} />
        </form>
      </Modal>

      {/* Price Update Modal */}
      <Modal
        open={priceModalOpen}
        onClose={() => { setPriceModalOpen(false); setPriceTarget(null); resetPrice(); }}
        title={`עדכון מחיר — ${priceTarget?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPriceModalOpen(false); setPriceTarget(null); resetPrice(); }}>ביטול</Button>
            <Button onClick={handlePriceSubmit(d => updatePrice.mutate(d))} loading={updatePrice.isPending}>
              עדכן מחיר
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {priceTarget && (
            <p className="text-sm text-gray-600">
              מחיר נוכחי: <strong>{formatCurrency(priceTarget.current_price)}</strong> / {priceTarget.unit}
            </p>
          )}
          <Input
            label="מחיר חדש (₪)"
            type="number"
            step="0.01"
            required
            error={priceErrors.new_price?.message}
            {...regPrice('new_price', { valueAsNumber: true })}
          />
          <Textarea label="הערה (אופציונלי)" rows={2} {...regPrice('note')} />
        </form>
      </Modal>

      {/* Price History Modal */}
      <Modal
        open={historyModalOpen}
        onClose={() => { setHistoryModalOpen(false); setHistoryTarget(null); }}
        title={`היסטוריית מחיר — ${historyTarget?.name}`}
        size="md"
      >
        {historyLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-gray-200 border-t-teal-600 rounded-full animate-spin" /></div>
        ) : priceHistory.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">אין היסטוריית מחיר עבור מרכיב זה</p>
        ) : (
          <div className="space-y-3">
            {priceHistory.map(h => (
              <div key={h.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 line-through">{formatCurrency(h.old_price)}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(h.new_price)}</span>
                    <Badge variant={h.new_price > h.old_price ? 'red' : 'green'}>
                      {h.new_price > h.old_price ? '+' : ''}{(((h.new_price - h.old_price) / h.old_price) * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  {h.note && <p className="text-xs text-gray-500 mt-1">{h.note}</p>}
                </div>
                <span className="text-xs text-gray-400">{formatDateTime(h.changed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Permanent delete confirm */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && hardDelete.mutate(confirmDelete)}
        title="מחיקה לצמיתות"
        message={`האם למחוק לצמיתות את המרכיב "${confirmDelete?.name}"? לא ניתן לשחזר פעולה זו.`}
        confirmLabel="מחק לצמיתות"
        danger
        loading={hardDelete.isPending}
      />

      <ConfirmModal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => bulkDelete.mutate(archivedIngredients)}
        title="מחיקת כל הארכיון"
        message={`למחוק לצמיתות את כל ${archivedIngredients.length} המרכיבים שבארכיון? לא ניתן לבטל.`}
        confirmLabel="מחק הכל"
        danger
        loading={bulkDelete.isPending}
      />
    </div>
  );
}
