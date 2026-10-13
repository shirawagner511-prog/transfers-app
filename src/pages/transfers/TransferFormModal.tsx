import { useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/formatCurrency';
import { todayISO, nowTimeISO } from '@/lib/dateUtils';
import { transferItemTotal } from '@/lib/transferCalculations';
import { useItems } from '@/hooks/useItems';
import { ItemSearch, type SearchOption } from '@/components/ItemSearch';

const itemSchema = z.object({
  type: z.enum(['product', 'ingredient']),
  product_id: z.string().optional(),
  ingredient_id: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().positive('כמות חייבת להיות חיובית'),
  unit: z.string().min(1, 'יחידה נדרשת'),
  unit_price: z.number().min(0),
  notes: z.string().optional(),
});

const schema = z.object({
  from_department_id: z.string().min(1, 'מחלקת מקור נדרשת'),
  to_department_id: z.string().min(1, 'מחלקת יעד נדרשת'),
  transfer_date: z.string().min(1, 'תאריך נדרש'),
  transfer_time: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['draft', 'pending_approval']),
  items: z.array(itemSchema).min(1, 'יש להוסיף לפחות פריט אחד'),
}).refine(d => d.from_department_id !== d.to_department_id, {
  message: 'לא ניתן להעביר מאותה מחלקה לעצמה',
  path: ['to_department_id'],
});

type FormData = z.infer<typeof schema>;

const UNITS = ['יחידה', 'ק"ג', 'גרם', 'ליטר', 'מ"ל', 'חבילה', 'קרטון', 'צרור'];

interface Props {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
  onSuccess: () => void;
}

let transferSeq = 0;
function generateTransferNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  transferSeq += 1;
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `TR-${y}${m}${d}-${seq}`;
}

export function TransferFormModal({ open, onClose, departments, onSuccess }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [pendingDup, setPendingDup] = useState<FormData | null>(null);

  const { data: allItems = [], isLoading: itemsLoading, error: itemsError } = useItems(open);
  const items = useMemo(() => allItems.filter(i => i.is_active), [allItems]);

  const { register, handleSubmit, reset, watch, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      transfer_date: todayISO(),
      transfer_time: nowTimeISO().slice(0, 5),
      status: 'draft',
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const totalValue = watchedItems.reduce((sum, item) => {
    return sum + transferItemTotal(item.quantity || 0, item.unit_price || 0);
  }, 0);

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      const transferNumber = generateTransferNumber();
      const total = data.items.reduce((s, i) => s + transferItemTotal(i.quantity, i.unit_price), 0);

      const { data: transfer, error: tErr } = await supabase
        .from('internal_transfers')
        .insert({
          transfer_number: transferNumber,
          from_department_id: data.from_department_id,
          to_department_id: data.to_department_id,
          status: data.status,
          transfer_date: data.transfer_date,
          transfer_time: data.transfer_time || null,
          total_value: total,
          notes: data.notes || null,
          created_by: user?.id,
        })
        .select('id')
        .single();
      if (tErr) throw tErr;

      const rows = data.items.map(item => {
        const name = item.name || items.find(i => i.key === keyOf(item))?.name || '';
        return {
          transfer_id: transfer.id,
          product_id: item.type === 'product' ? item.product_id ?? null : null,
          ingredient_id: item.type === 'ingredient' ? item.ingredient_id ?? null : null,
          item_name_snapshot: name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price_snapshot: item.unit_price,
          total_price_snapshot: transferItemTotal(item.quantity, item.unit_price),
          notes: item.notes || null,
        };
      });

      const { error: iErr } = await supabase.from('internal_transfer_items').insert(rows);
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      toast.success('ההעברה נוצרה בהצלחה');
      reset();
      onSuccess();
    },
    onError: () => toast.error('שגיאה ביצירת ההעברה'),
  });

  // Warn (don't block) if a near-identical transfer already exists:
  // same source+target departments, same date, same total value.
  async function checkAndSave(data: FormData, status: 'draft' | 'pending_approval') {
    const payload = { ...data, status };
    const total = Math.round(data.items.reduce((s, i) => s + transferItemTotal(i.quantity || 0, i.unit_price || 0), 0) * 100) / 100;
    const { data: existing } = await supabase
      .from('internal_transfers')
      .select('id')
      .eq('from_department_id', data.from_department_id)
      .eq('to_department_id', data.to_department_id)
      .eq('transfer_date', data.transfer_date)
      .eq('total_value', total)
      .not('status', 'in', '(rejected,cancelled)')
      .limit(1);
    if (existing && existing.length > 0) {
      setPendingDup(payload);
      return;
    }
    save.mutate(payload);
  }

  // One search over every item (price list + dishes)
  const searchOptions = useMemo<SearchOption[]>(() => items.map(i => ({
    id: i.key,
    name: i.name,
    keywords: `${i.category ?? ''} ${i.supplier_name ?? ''}`,
    meta: [i.supplier_name, i.category].filter(Boolean).join(' · ') || undefined,
    price: <>{formatCurrency(i.price)}<span className="text-xs font-normal text-gray-500"> / {i.unit}</span></>,
  })), [items]);

  const keyOf = (it: FormData['items'][number]) => it.type === 'product' ? `product:${it.product_id}` : `ingredient:${it.ingredient_id}`;
  const selectedIds = new Set(watchedItems.map(keyOf));

  function addFromSearch(option: SearchOption) {
    if (selectedIds.has(option.id)) {
      toast.info(`"${option.name}" כבר ברשימה — עדכן את הכמות בשורה`);
      return;
    }
    const i = items.find(x => x.key === option.id);
    if (!i) return;
    append({
      type: i.source,
      product_id: i.source === 'product' ? i.id : undefined,
      ingredient_id: i.source === 'ingredient' ? i.id : undefined,
      name: i.name, quantity: 1, unit: i.unit, unit_price: i.price, notes: '',
    });
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="יצירת העברה פנימית"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button variant="secondary" onClick={handleSubmit(d => checkAndSave(d, 'draft'))} loading={save.isPending}>
            שמור כטיוטה
          </Button>
          <Button onClick={handleSubmit(d => checkAndSave(d, 'pending_approval'))} loading={save.isPending}>
            שלח לאישור
          </Button>
        </>
      }
    >
      <form className="space-y-5">
        {/* Transfer meta */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="ממחלקה"
            required
            placeholder="בחר מחלקת מקור"
            error={errors.from_department_id?.message}
            {...register('from_department_id')}
          >
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select
            label="למחלקה"
            required
            placeholder="בחר מחלקת יעד"
            error={errors.to_department_id?.message}
            {...register('to_department_id')}
          >
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input label="תאריך" type="date" required error={errors.transfer_date?.message} {...register('transfer_date')} />
          <Input label="שעה" type="time" {...register('transfer_time')} />
        </div>
        <Textarea label="הערות" rows={2} {...register('notes')} />

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">פריטים להעברה</p>
            {fields.length > 0 && <span className="text-xs text-gray-500">{fields.length} פריטים</span>}
          </div>

          <ItemSearch
            options={searchOptions}
            onSelect={addFromSearch}
            selectedIds={selectedIds}
            placeholder={itemsLoading ? 'טוען פריטים…' : `חפש פריט להוספה (מתוך ${items.length.toLocaleString('he-IL')} פריטים)…`}
          />
          {itemsError ? (
            <p className="text-xs text-red-600 mt-1">שגיאה בטעינת הפריטים: {(itemsError as { message?: string }).message}</p>
          ) : (
            <p className="text-[11px] text-gray-400 mt-1">הקלד חלק מהשם, מילה מתוכו או שם ספק — המחיר והיחידה ממולאים אוטומטית.</p>
          )}

          {errors.items?.root && (
            <p className="text-xs text-red-500 mt-2">{errors.items.root.message}</p>
          )}
          {typeof errors.items?.message === 'string' && (
            <p className="text-xs text-red-500 mt-2">{errors.items.message}</p>
          )}

          <div className="space-y-2 mt-3">
            {fields.map((field, idx) => {
              const item = watchedItems[idx];
              return (
                <div key={field.id} className="p-2.5 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{item?.name}</span>
                    <button type="button" onClick={() => remove(idx)} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0" aria-label="הסר פריט">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 items-end">
                    <Input
                      label="כמות"
                      type="number" step="0.001" inputMode="decimal"
                      error={errors.items?.[idx]?.quantity?.message}
                      {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                    />
                    <Select label="יחידה" {...register(`items.${idx}.unit`)}>
                      {Array.from(new Set([item?.unit, ...UNITS].filter(Boolean) as string[])).map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                    <Input
                      label="מחיר ליח׳ (₪)"
                      type="number" step="0.01" inputMode="decimal"
                      {...register(`items.${idx}.unit_price`, { valueAsNumber: true })}
                    />
                    <div className="col-span-3 sm:col-span-1 text-left sm:text-center pb-2">
                      <span className="text-xs text-gray-500 sm:block">סה"כ: </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(transferItemTotal(item?.quantity || 0, item?.unit_price || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {fields.length > 0 && (
            <div className="mt-3 flex justify-end">
              <div className="bg-teal-50 rounded-lg px-4 py-2 text-sm">
                <span className="text-teal-600">סה"כ ערך ההעברה: </span>
                <strong className="text-teal-800">{formatCurrency(totalValue)}</strong>
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>

    <ConfirmModal
      open={!!pendingDup}
      onClose={() => setPendingDup(null)}
      onConfirm={() => { if (pendingDup) save.mutate(pendingDup); setPendingDup(null); }}
      title="העברה דומה כבר קיימת"
      message="קיימת כבר העברה עם אותן מחלקות, אותו תאריך ואותו סכום. ייתכן שזו כפילות (אולי הצד השני כבר הזין אותה). האם להמשיך בכל זאת?"
      confirmLabel="כן, המשך"
      loading={save.isPending}
    />
    </>
  );
}
