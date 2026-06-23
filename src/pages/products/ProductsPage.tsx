import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Package, Trash2, ChevronDown, ChevronUp, Search, Archive, RotateCcw, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Product, Ingredient, ProductIngredient } from '@/types/database.types';
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
import { ExportButton } from '@/components/ui/ExportButton';
import { ItemInfoModal } from '@/components/ItemInfoModal';

const PRODUCT_CATEGORIES = ['מנה ראשונה', 'מנה עיקרית', 'קינוח', 'משקה', 'חטיף', 'סלט', 'לחם ואפייה', 'חבילה', 'אחר'];

const ingItemSchema = z.object({
  ingredient_id: z.string().min(1, 'בחר מרכיב'),
  quantity: z.number().positive('כמות חייבת להיות חיובית'),
  unit: z.string().min(1, 'יחידה נדרשת'),
  waste_percentage: z.number().min(0).max(100),
});

const schema = z.object({
  name: z.string().min(1, 'שם המוצר נדרש'),
  category: z.string().optional(),
  description: z.string().optional(),
  cost: z.number().min(0, 'עלות לא יכולה להיות שלילית'),
  notes: z.string().optional(),
  is_active: z.boolean(),
  ingredients: z.array(ingItemSchema),
});

type FormData = z.infer<typeof schema>;

interface ProductWithIngredients extends Product {
  product_ingredients: (ProductIngredient & { ingredient: Ingredient })[];
}

async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_ingredients(*, ingredient:ingredients(*))')
    .order('name');
  if (error) throw error;
  return data as ProductWithIngredients[];
}

async function fetchIngredients() {
  const { data, error } = await supabase.from('ingredients').select('id,name,unit,current_price').eq('is_active', true).order('name');
  if (error) throw error;
  return data as Ingredient[];
}

export function ProductsPage() {
  const { canEdit, canApprove, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithIngredients | null>(null);
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [confirmDelete, setConfirmDelete] = useState<ProductWithIngredients | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [infoItem, setInfoItem] = useState<ProductWithIngredients | null>(null);

  const { data: products = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: fetchProducts });
  const { data: allIngredients = [] } = useQuery({ queryKey: ['ingredients-active'], queryFn: fetchIngredients });

  const { register, handleSubmit, reset, watch, control, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true, cost: 0, ingredients: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'ingredients' });
  const watchedIngredients = watch('ingredients');

  const computedCost = watchedIngredients.reduce((sum, item) => {
    const ing = allIngredients.find(i => i.id === item.ingredient_id);
    if (!ing) return sum;
    const wasteMultiplier = 1 + (item.waste_percentage || 0) / 100;
    return sum + (item.quantity || 0) * ing.current_price * wasteMultiplier;
  }, 0);

  const upsert = useMutation({
    mutationFn: async (data: FormData) => {
      const productPayload = {
        name: data.name,
        category: data.category || null,
        description: data.description || null,
        selling_price: 0,
        internal_transfer_price: data.cost,
        notes: data.notes || null,
        is_active: editing ? editing.is_active : true,
        updated_by: user?.id,
      };

      let productId = editing?.id;

      if (editing) {
        const { error } = await supabase.from('products').update(productPayload).eq('id', editing.id);
        if (error) throw error;
        await supabase.from('product_ingredients').delete().eq('product_id', editing.id);
      } else {
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert({ ...productPayload, created_by: user?.id })
          .select('id')
          .single();
        if (error) throw error;
        productId = newProduct.id;
      }

      if (data.ingredients.length > 0) {
        const ingRows = data.ingredients.map(item => ({
          product_id: productId!,
          ingredient_id: item.ingredient_id,
          quantity: item.quantity,
          unit: item.unit,
          waste_percentage: item.waste_percentage,
        }));
        const { error } = await supabase.from('product_ingredients').insert(ingRows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(editing ? 'המוצר עודכן' : 'המוצר נוסף');
      closeModal();
    },
    onError: () => toast.error('שגיאה בשמירת המוצר'),
  });

  const setActive = useMutation({
    mutationFn: async ({ product, active }: { product: ProductWithIngredients; active: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active: active, updated_by: user?.id })
        .eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(vars.active ? 'המוצר שוחזר' : 'המוצר הועבר לארכיון');
    },
    onError: () => toast.error('שגיאה בעדכון המוצר'),
  });

  const hardDelete = useMutation({
    mutationFn: async (product: ProductWithIngredients) => {
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('המוצר נמחק לצמיתות');
      setConfirmDelete(null);
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        toast.error('לא ניתן למחוק — המוצר משויך להזמנות קיימות. הוא יישאר בארכיון.');
      } else {
        toast.error('שגיאה במחיקת המוצר');
      }
      setConfirmDelete(null);
    },
  });

  const bulkDelete = useMutation({
    mutationFn: async (items: ProductWithIngredients[]) => {
      let deleted = 0, blocked = 0;
      for (const p of items) {
        const { error } = await supabase.from('products').delete().eq('id', p.id);
        if (error) {
          if ((error as { code?: string }).code === '23503') blocked++;
          else throw error;
        } else deleted++;
      }
      return { deleted, blocked };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(res.blocked > 0
        ? `נמחקו ${res.deleted}, ${res.blocked} משויכים להזמנות ולא נמחקו`
        : `נמחקו ${res.deleted} מוצרים`);
      setConfirmBulk(false);
    },
    onError: () => { toast.error('שגיאה במחיקה'); setConfirmBulk(false); },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', category: '', description: '', notes: '', is_active: true, cost: 0, ingredients: [] });
    setModalOpen(true);
  }

  function openEdit(p: ProductWithIngredients) {
    setEditing(p);
    reset({
      name: p.name,
      category: p.category ?? '',
      description: p.description ?? '',
      notes: p.notes ?? '',
      is_active: p.is_active,
      cost: p.internal_transfer_price,
      ingredients: p.product_ingredients.map(pi => ({
        ingredient_id: pi.ingredient_id,
        quantity: pi.quantity,
        unit: pi.unit,
        waste_percentage: pi.waste_percentage,
      })),
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditing(null); reset(); }

  const activeProducts = products.filter(p => p.is_active);
  const archivedProducts = products.filter(p => !p.is_active);
  const filtered = (view === 'active' ? activeProducts : archivedProducts).filter(p => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportRows = filtered.map(p => ({
    'שם': p.name,
    'קטגוריה': p.category ?? '',
    'עלות (₪)': p.internal_transfer_price,
    'מספר מרכיבים': p.product_ingredients.length,
    'סטטוס': p.is_active ? 'פעיל' : 'בארכיון',
  }));

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="מוצרים / מנות"
        subtitle={`${products.filter(p => p.is_active).length} מוצרים פעילים`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton filename="מוצרים" rows={exportRows} />
            {canEdit() && (
              <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>הוסף מוצר</Button>
            )}
          </div>
        }
      />

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setView('active')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'active' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          פעילים ({activeProducts.length})
        </button>
        <button
          onClick={() => setView('archive')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'archive' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ארכיון ({archivedProducts.length})
        </button>
      </div>

      {view === 'archive' && canApprove() && archivedProducts.length > 0 && (
        <div className="mb-4">
          <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmBulk(true)}>
            מחק את כל הארכיון לצמיתות ({archivedProducts.length})
          </Button>
        </div>
      )}

      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="חפש מוצר..." value={search} onChange={e => setSearch(e.target.value)}
            startIcon={<Search className="w-4 h-4" />} />
          <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} placeholder="כל הקטגוריות">
            {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={view === 'archive' ? 'הארכיון ריק' : 'לא נמצאו מוצרים'}
          icon={<Package className="w-12 h-12" />}
          action={view === 'active' && canEdit() ? { label: 'הוסף מוצר', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const cost = p.internal_transfer_price;
            const expanded = expandedId === p.id;

            return (
              <Card key={p.id} padding={false}>
                <div
                  className="flex flex-wrap items-center justify-between gap-2 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-teal-50 rounded-lg text-teal-600 flex-shrink-0">
                      <Package className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        {p.category && <Badge variant="gray">{p.category}</Badge>}
                        {!p.is_active && <Badge variant="gray">לא פעיל</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span>עלות: {formatCurrency(cost)}</span>
                        <span>{p.product_ingredients.length} מרכיבים</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setInfoItem(p); }} title="פרטים" icon={<Info className="w-3.5 h-3.5" />} />
                    {canEdit() && p.is_active && (
                      <>
                        <Button
                          variant="ghost" size="sm"
                          onClick={e => { e.stopPropagation(); openEdit(p); }}
                          icon={<Pencil className="w-3.5 h-3.5" />}
                        >
                          עריכה
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={e => { e.stopPropagation(); setActive.mutate({ product: p, active: false }); }}
                          icon={<Archive className="w-3.5 h-3.5" />}
                        >
                          ארכיון
                        </Button>
                      </>
                    )}
                    {canEdit() && !p.is_active && (
                      <>
                        <Button
                          variant="ghost" size="sm"
                          onClick={e => { e.stopPropagation(); setActive.mutate({ product: p, active: true }); }}
                          icon={<RotateCcw className="w-3.5 h-3.5" />}
                        >
                          שחזר
                        </Button>
                        {canApprove() && (
                          <Button
                            variant="ghost" size="sm"
                            onClick={e => { e.stopPropagation(); setConfirmDelete(p); }}
                            icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                          >
                            מחק
                          </Button>
                        )}
                      </>
                    )}
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-gray-100 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div className="bg-orange-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-orange-600 mb-1">עלות המוצר</p>
                        <p className="font-bold text-orange-800">{formatCurrency(cost)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">מספר מרכיבים</p>
                        <p className="font-bold text-gray-800">{p.product_ingredients.length}</p>
                      </div>
                    </div>

                    {p.product_ingredients.length > 0 && (
                      <div className="overflow-x-auto">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">מרכיבים</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-right py-1">מרכיב</th>
                              <th className="text-right py-1">כמות</th>
                              <th className="text-right py-1">יחידה</th>
                              <th className="text-right py-1">פחת %</th>
                              <th className="text-right py-1">עלות</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.product_ingredients.map(pi => {
                              const ingCost = pi.quantity * (pi.ingredient?.current_price ?? 0) * (1 + pi.waste_percentage / 100);
                              return (
                                <tr key={pi.id} className="border-t border-gray-50">
                                  <td className="py-1.5">{pi.ingredient?.name}</td>
                                  <td className="py-1.5">{pi.quantity}</td>
                                  <td className="py-1.5">{pi.unit}</td>
                                  <td className="py-1.5">{pi.waste_percentage}%</td>
                                  <td className="py-1.5 font-medium">{formatCurrency(ingCost)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Product Form Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'עריכת מוצר' : 'הוספת מוצר'}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>ביטול</Button>
            <Button onClick={handleSubmit(d => upsert.mutate(d))} loading={isSubmitting || upsert.isPending}>
              {editing ? 'שמור' : 'הוסף'}
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Input label="שם המוצר" required error={errors.name?.message} {...register('name')} className="col-span-2" />
            <Select label="קטגוריה" placeholder="בחר קטגוריה" {...register('category')} className="col-span-2">
              {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input
              label="מחיר עלות (₪)"
              type="number"
              step="0.01"
              dir="ltr"
              error={errors.cost?.message}
              {...register('cost', { valueAsNumber: true })}
              className="col-span-2"
            />
          </div>

          <Textarea label="תיאור" {...register('description')} />

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">מרכיבים</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => append({ ingredient_id: '', quantity: 1, unit: '', waste_percentage: 0 })}
              >
                הוסף מרכיב
              </Button>
            </div>

            {/* Live cost preview */}
            {fields.length > 0 && (
              <div className="flex items-center justify-between gap-4 text-xs bg-teal-50 rounded-lg px-3 py-2 mb-3">
                <span>עלות מחושבת מהמתכון: <strong>{formatCurrency(computedCost)}</strong></span>
                <button
                  type="button"
                  onClick={() => setValue('cost', Math.round(computedCost * 100) / 100)}
                  className="text-teal-600 font-medium hover:underline whitespace-nowrap"
                >
                  השתמש בעלות זו
                </button>
              </div>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-2 bg-gray-50 rounded-lg">
                  <div className="col-span-4">
                    <Select
                      label={idx === 0 ? 'מרכיב' : undefined}
                      placeholder="בחר מרכיב"
                      error={errors.ingredients?.[idx]?.ingredient_id?.message}
                      {...register(`ingredients.${idx}.ingredient_id`, {
                        onChange: e => {
                          const ing = allIngredients.find(i => i.id === e.target.value);
                          if (ing) {
                            const current = fields[idx];
                            if (!current) return;
                          }
                        }
                      })}
                    >
                      {allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'כמות' : undefined}
                      type="number" step="0.001"
                      error={errors.ingredients?.[idx]?.quantity?.message}
                      {...register(`ingredients.${idx}.quantity`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      label={idx === 0 ? 'יחידה' : undefined}
                      placeholder="יחידה"
                      {...register(`ingredients.${idx}.unit`)}
                    >
                      {['ק"ג', 'גרם', 'ליטר', 'מ"ל', 'יחידה', 'חבילה'].map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'פחת %' : undefined}
                      type="number" step="0.1" placeholder="0"
                      {...register(`ingredients.${idx}.waste_percentage`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Textarea label="הערות" {...register('notes')} />
        </form>
      </Modal>

      {/* Permanent delete confirm */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && hardDelete.mutate(confirmDelete)}
        title="מחיקה לצמיתות"
        message={`האם למחוק לצמיתות את המוצר "${confirmDelete?.name}"? לא ניתן לשחזר פעולה זו.`}
        confirmLabel="מחק לצמיתות"
        danger
        loading={hardDelete.isPending}
      />

      <ConfirmModal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => bulkDelete.mutate(archivedProducts)}
        title="מחיקת כל הארכיון"
        message={`למחוק לצמיתות את כל ${archivedProducts.length} המוצרים שבארכיון? לא ניתן לבטל.`}
        confirmLabel="מחק הכל"
        danger
        loading={bulkDelete.isPending}
      />

      <ItemInfoModal
        open={!!infoItem}
        onClose={() => setInfoItem(null)}
        title={infoItem ? `פרטי מוצר — ${infoItem.name}` : 'פרטים'}
        createdBy={infoItem?.created_by ?? null}
        createdAt={infoItem?.created_at ?? null}
        updatedAt={infoItem?.updated_at ?? null}
      />
    </div>
  );
}
