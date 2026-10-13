import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Search, History, TrendingUp, Package, Archive, RotateCcw, Trash2, Info, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Supplier, IngredientPriceHistory } from '@/types/database.types';
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
import { useItems, itemSearchText, type Item } from '@/hooks/useItems';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDateTime } from '@/lib/dateUtils';
import { ExportButton } from '@/components/ui/ExportButton';
import { ItemInfoModal } from '@/components/ItemInfoModal';
import { fetchAll } from '@/lib/fetchAll';
import { searchItems } from '@/lib/search';
import { importPriceList } from '@/lib/priceImport';

const PAGE_SIZE = 50;
const UNITS = ['יחידה', 'ק"ג', 'גרם', 'ליטר', 'מ"ל', 'חבילה', 'קרטון', 'צרור'];
const BASE_CATEGORIES = ['ירקות', 'פירות', 'בשר', 'עוף', 'דגים', 'מוצרי חלב', 'לחם ואפייה', 'תבלינים', 'שמנים', 'יבש', 'משקאות', 'אחר'];

const schema = z.object({
  name: z.string().min(1, 'שם הפריט נדרש'),
  category: z.string().optional(),
  unit: z.string().min(1, 'יחידת מידה נדרשת'),
  price: z.number().min(0, 'מחיר לא יכול להיות שלילי'),
  supplier_id: z.string().optional(),
  notes: z.string().optional(),
});

const priceSchema = z.object({
  new_price: z.number().min(0, 'מחיר לא יכול להיות שלילי'),
  note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type PriceFormData = z.infer<typeof priceSchema>;

const table = (item: Item) => (item.source === 'ingredient' ? 'ingredients' : 'products');

function fetchSuppliers() {
  return fetchAll<Supplier>((from, to) => supabase.from('suppliers').select('id,name').order('name').order('id').range(from, to));
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

export function ItemsPage() {
  const { canEdit, canApprove, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [infoItem, setInfoItem] = useState<Item | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [priceTarget, setPriceTarget] = useState<Item | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Item | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const { data: items = [], isLoading, error: loadError, refetch } = useItems();
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: fetchSuppliers });
  const { data: priceHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['ingredient-price-history', historyTarget?.id],
    queryFn: () => fetchPriceHistory(historyTarget!.id),
    enabled: historyTarget?.source === 'ingredient',
  });

  const categories = useMemo(
    () => Array.from(new Set([...BASE_CATEGORIES, ...items.map(i => i.category).filter((c): c is string => !!c)]))
      .sort((a, b) => a.localeCompare(b, 'he')),
    [items],
  );

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });
  const { register: regPrice, handleSubmit: handlePriceSubmit, reset: resetPrice, formState: { errors: priceErrors } } =
    useForm<PriceFormData>({ resolver: zodResolver(priceSchema) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['items'] });

  const upsert = useMutation({
    mutationFn: async (data: FormData) => {
      if (editing?.source === 'product') {
        const { error } = await supabase.from('products').update({
          name: data.name, category: data.category || null, internal_transfer_price: data.price,
          notes: data.notes || null, updated_by: user?.id,
        }).eq('id', editing.id);
        if (error) throw error;
        return;
      }
      const payload = {
        name: data.name,
        category: data.category || null,
        unit: data.unit,
        current_price: data.price,
        supplier_id: data.supplier_id || null,
        notes: data.notes || null,
        updated_by: user?.id,
      };
      if (editing) {
        if (editing.price !== data.price) {
          await supabase.from('ingredient_price_history').insert({
            ingredient_id: editing.id, old_price: editing.price, new_price: data.price, changed_by: user?.id, note: 'עריכת פריט',
          });
        }
        const { error } = await supabase.from('ingredients').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ingredients').insert({ ...payload, is_active: true, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refresh();
      toast.success(editing ? 'הפריט עודכן' : 'הפריט נוסף');
      closeModal();
    },
    onError: () => toast.error('שגיאה בשמירת הפריט'),
  });

  const updatePrice = useMutation({
    mutationFn: async (data: PriceFormData) => {
      if (!priceTarget) return;
      if (priceTarget.source === 'ingredient') {
        const { error: histErr } = await supabase.from('ingredient_price_history').insert({
          ingredient_id: priceTarget.id, old_price: priceTarget.price, new_price: data.new_price,
          changed_by: user?.id, note: data.note || null,
        });
        if (histErr) throw histErr;
        const { error } = await supabase.from('ingredients')
          .update({ current_price: data.new_price, updated_by: user?.id }).eq('id', priceTarget.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products')
          .update({ internal_transfer_price: data.new_price, updated_by: user?.id }).eq('id', priceTarget.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refresh();
      toast.success('המחיר עודכן בהצלחה');
      setPriceTarget(null);
      resetPrice();
    },
    onError: () => toast.error('שגיאה בעדכון המחיר'),
  });

  const setActive = useMutation({
    mutationFn: async ({ item, active }: { item: Item; active: boolean }) => {
      const { error } = await supabase.from(table(item)).update({ is_active: active, updated_by: user?.id }).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      refresh();
      toast.success(vars.active ? 'הפריט שוחזר' : 'הפריט הועבר לארכיון');
    },
    onError: () => toast.error('שגיאה בעדכון הפריט'),
  });

  const hardDelete = useMutation({
    mutationFn: async (item: Item) => {
      const { error } = await supabase.from(table(item)).delete().eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success('הפריט נמחק לצמיתות');
      setConfirmDelete(null);
    },
    onError: (err: unknown) => {
      toast.error((err as { code?: string })?.code === '23503'
        ? 'לא ניתן למחוק — הפריט בשימוש. הוא יישאר בארכיון.'
        : 'שגיאה במחיקת הפריט');
      setConfirmDelete(null);
    },
  });

  const bulkDelete = useMutation({
    mutationFn: async (list: Item[]) => {
      let deleted = 0, blocked = 0;
      for (const item of list) {
        const { error } = await supabase.from(table(item)).delete().eq('id', item.id);
        if (error) {
          if ((error as { code?: string }).code === '23503') blocked++;
          else throw error;
        } else deleted++;
      }
      return { deleted, blocked };
    },
    onSuccess: res => {
      refresh();
      toast.success(res.blocked > 0 ? `נמחקו ${res.deleted}, ${res.blocked} בשימוש ולא נמחקו` : `נמחקו ${res.deleted} פריטים`);
      setConfirmBulk(false);
    },
    onError: () => { toast.error('שגיאה במחיקה'); setConfirmBulk(false); },
  });

  const runImport = useMutation({
    mutationFn: () => importPriceList(user?.id, setImportProgress),
    onSuccess: r => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`המחירון נטען: ${r.added} פריטים חדשים, ${r.updated} עודכנו, ${r.unchanged} ללא שינוי`);
      setConfirmImport(false);
      setImportProgress('');
    },
    onError: (err: unknown) => {
      toast.error(`שגיאה בטעינת המחירון: ${(err as { message?: string })?.message ?? ''}`);
      setImportProgress('');
    },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: search.trim(), category: '', unit: 'יחידה', price: 0, supplier_id: '', notes: '' });
    setModalOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    reset({
      name: item.name, category: item.category ?? '', unit: item.unit, price: item.price,
      supplier_id: item.supplier_id ?? '', notes: item.notes ?? '',
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditing(null); reset(); }

  function openPrice(item: Item) {
    setPriceTarget(item);
    resetPrice({ new_price: item.price, note: '' });
  }

  const active = items.filter(i => i.is_active);
  const archived = items.filter(i => !i.is_active);
  const filtered = searchItems(
    (view === 'active' ? active : archived).filter(i =>
      (!filterCategory || i.category === filterCategory) && (!filterSupplier || i.supplier_id === filterSupplier)),
    search,
    itemSearchText,
    Infinity,
  );

  const exportRows = filtered.map(i => ({
    'שם': i.name,
    'קטגוריה': i.category ?? '',
    'יחידה': i.unit,
    'מחיר (₪)': i.price,
    'ספק': i.supplier_name ?? '',
    'סטטוס': i.is_active ? 'פעיל' : 'בארכיון',
  }));

  const resetPaging = () => setShown(PAGE_SIZE);
  const editingProduct = editing?.source === 'product';

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="פריטים"
        subtitle={`${active.length.toLocaleString('he-IL')} פריטים פעילים`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton filename="פריטים" rows={exportRows} />
            {canApprove() && (
              <Button variant="outline" onClick={() => setConfirmImport(true)} icon={<Download className="w-4 h-4" />}>ייבוא מחירון</Button>
            )}
            {canEdit() && <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>הוסף פריט</Button>}
          </div>
        }
      />

      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 text-red-800 px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">לא הצלחנו לטעון את רשימת הפריטים</p>
            <p className="text-xs mt-0.5" dir="auto">{(loadError as { message?: string }).message}</p>
            <button className="text-xs underline mt-1" onClick={() => refetch()}>נסה שוב</button>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {(['active', 'archive'] as const).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); resetPaging(); }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${view === v ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {v === 'active' ? `פעילים (${active.length})` : `ארכיון (${archived.length})`}
          </button>
        ))}
      </div>

      {view === 'archive' && canApprove() && archived.length > 0 && (
        <div className="mb-4">
          <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmBulk(true)}>
            מחק את כל הארכיון לצמיתות ({archived.length})
          </Button>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input placeholder="חפש פריט, ספק או קטגוריה..." value={search}
            onChange={e => { setSearch(e.target.value); resetPaging(); }}
            startIcon={<Search className="w-4 h-4" />} />
          <Select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); resetPaging(); }} placeholder="כל הקטגוריות">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); resetPaging(); }} placeholder="כל הספקים">
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        {search.trim() && (
          <p className="text-xs text-gray-500 mt-2">נמצאו {filtered.length} פריטים</p>
        )}
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={view === 'archive' ? 'הארכיון ריק' : search.trim() ? `לא נמצא פריט בשם "${search.trim()}"` : 'אין פריטים'}
          icon={<Package className="w-12 h-12" />}
          action={view === 'active' && canEdit() ? { label: 'הוסף פריט', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, shown).map(item => (
            <Card key={item.key} padding={false}>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {!item.is_active && <Badge variant="gray">בארכיון</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[item.category, item.supplier_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="font-bold text-gray-900 flex-shrink-0">
                    {formatCurrency(item.price)}<span className="text-xs font-normal text-gray-500"> / {item.unit}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1 justify-end mt-2 pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" onClick={() => setInfoItem(item)} title="פרטים" icon={<Info className="w-4 h-4" />} />
                  {item.source === 'ingredient' && (
                    <Button variant="ghost" size="sm" onClick={() => setHistoryTarget(item)} title="היסטוריית מחיר" icon={<History className="w-4 h-4" />} />
                  )}
                  {canEdit() && item.is_active && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openPrice(item)} icon={<TrendingUp className="w-4 h-4" />}>מחיר</Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)} icon={<Pencil className="w-4 h-4" />}>עריכה</Button>
                      <Button variant="ghost" size="sm" onClick={() => setActive.mutate({ item, active: false })} icon={<Archive className="w-4 h-4" />}>ארכיון</Button>
                    </>
                  )}
                  {canEdit() && !item.is_active && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setActive.mutate({ item, active: true })} icon={<RotateCcw className="w-4 h-4" />}>שחזר</Button>
                      {canApprove() && (
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setConfirmDelete(item)} icon={<Trash2 className="w-4 h-4" />}>מחק</Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {filtered.length > shown && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={() => setShown(s => s + PAGE_SIZE)}>
                הצג עוד ({filtered.length - shown} נוספים)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add / edit */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'עריכת פריט' : 'הוספת פריט'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>ביטול</Button>
            <Button onClick={handleSubmit(d => upsert.mutate(d))} loading={upsert.isPending}>{editing ? 'שמור' : 'הוסף'}</Button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input label="שם הפריט" required error={errors.name?.message} {...register('name')} />
            </div>
            <Select label="קטגוריה" placeholder="בחר קטגוריה" {...register('category')}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            {editingProduct ? <input type="hidden" {...register('unit')} /> : (
              <Select label="יחידת מידה" required error={errors.unit?.message} {...register('unit')}>
                {Array.from(new Set([editing?.unit, ...UNITS].filter(Boolean) as string[])).map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            )}
            <Input
              label="מחיר (₪)" type="number" step="0.01" inputMode="decimal" required
              error={errors.price?.message}
              {...register('price', { valueAsNumber: true })}
            />
            {!editingProduct && (
              <Select label="ספק" placeholder="ללא ספק" {...register('supplier_id')}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </div>
          <Textarea label="הערות" {...register('notes')} />
        </form>
      </Modal>

      {/* Price update */}
      <Modal
        open={!!priceTarget}
        onClose={() => { setPriceTarget(null); resetPrice(); }}
        title={`עדכון מחיר — ${priceTarget?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPriceTarget(null); resetPrice(); }}>ביטול</Button>
            <Button onClick={handlePriceSubmit(d => updatePrice.mutate(d))} loading={updatePrice.isPending}>עדכן מחיר</Button>
          </>
        }
      >
        <form className="space-y-4">
          {priceTarget && (
            <p className="text-sm text-gray-600">
              מחיר נוכחי: <strong>{formatCurrency(priceTarget.price)}</strong> / {priceTarget.unit}
            </p>
          )}
          <Input label="מחיר חדש (₪)" type="number" step="0.01" inputMode="decimal" required
            error={priceErrors.new_price?.message} {...regPrice('new_price', { valueAsNumber: true })} />
          <Textarea label="הערה (אופציונלי)" rows={2} {...regPrice('note')} />
        </form>
      </Modal>

      {/* Price history */}
      <Modal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={`היסטוריית מחיר — ${historyTarget?.name ?? ''}`}
        size="md"
      >
        {historyLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-gray-200 border-t-teal-600 rounded-full animate-spin" /></div>
        ) : priceHistory.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">אין היסטוריית מחיר עבור פריט זה</p>
        ) : (
          <div className="space-y-3">
            {priceHistory.map(h => (
              <div key={h.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 line-through">{formatCurrency(h.old_price)}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(h.new_price)}</span>
                    {h.old_price > 0 && (
                      <Badge variant={h.new_price > h.old_price ? 'red' : 'green'}>
                        {h.new_price > h.old_price ? '+' : ''}{(((h.new_price - h.old_price) / h.old_price) * 100).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  {h.note && <p className="text-xs text-gray-500 mt-1">{h.note}</p>}
                </div>
                <span className="text-xs text-gray-400">{formatDateTime(h.changed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && hardDelete.mutate(confirmDelete)}
        title="מחיקה לצמיתות"
        message={`האם למחוק לצמיתות את הפריט "${confirmDelete?.name}"? לא ניתן לשחזר פעולה זו.`}
        confirmLabel="מחק לצמיתות"
        danger
        loading={hardDelete.isPending}
      />

      <ConfirmModal
        open={confirmImport}
        onClose={() => { if (!runImport.isPending) setConfirmImport(false); }}
        onConfirm={() => runImport.mutate()}
        title="ייבוא מחירון רכש"
        message={runImport.isPending
          ? (importProgress || 'מתחיל…')
          : 'לטעון את מחירון הרכש (כ־1,600 פריטים עם המחיר האחרון, הספק והקטגוריה)? פריט קיים באותו שם יקבל את המחיר החדש, פריט חדש יתווסף. אפשר להריץ שוב בלי חשש.'}
        confirmLabel="טען מחירון"
        loading={runImport.isPending}
      />

      <ConfirmModal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => bulkDelete.mutate(archived)}
        title="מחיקת כל הארכיון"
        message={`למחוק לצמיתות את כל ${archived.length} הפריטים שבארכיון? לא ניתן לבטל.`}
        confirmLabel="מחק הכל"
        danger
        loading={bulkDelete.isPending}
      />

      <ItemInfoModal
        open={!!infoItem}
        onClose={() => setInfoItem(null)}
        title={infoItem ? `פרטי פריט — ${infoItem.name}` : 'פרטים'}
        createdBy={infoItem?.created_by ?? null}
        createdAt={infoItem?.created_at ?? null}
        updatedAt={infoItem?.updated_at ?? null}
      />
    </div>
  );
}
