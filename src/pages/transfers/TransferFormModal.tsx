import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import type { Ingredient } from '@/types/database.types';

const itemSchema = z.object({
  type: z.enum(['product', 'ingredient']),
  product_id: z.string().optional(),
  ingredient_id: z.string().optional(),
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

interface Props {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
  onSuccess: () => void;
}

interface ProductWithRecipe {
  id: string;
  name: string;
  product_ingredients: { quantity: number; waste_percentage: number; ingredient: { current_price: number } | null }[];
}

// A product's internal-transfer price is its recipe cost (live from current ingredient prices).
function productCost(p: ProductWithRecipe): number {
  return p.product_ingredients.reduce((sum, pi) => {
    const price = pi.ingredient?.current_price ?? 0;
    return sum + pi.quantity * price * (1 + (pi.waste_percentage || 0) / 100);
  }, 0);
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
  const [itemType, setItemType] = useState<'product' | 'ingredient'>('product');
  const [pendingDup, setPendingDup] = useState<FormData | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id,name,product_ingredients(quantity,waste_percentage,ingredient:ingredients(current_price))')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as unknown as ProductWithRecipe[];
    },
    enabled: open,
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ingredients').select('id,name,unit,current_price').eq('is_active', true).order('name');
      if (error) throw error;
      return data as Ingredient[];
    },
    enabled: open,
  });

  const { register, handleSubmit, reset, watch, control, setValue, formState: { errors } } = useForm<FormData>({
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
        let name = '';
        if (item.type === 'product') {
          name = products.find(p => p.id === item.product_id)?.name ?? '';
        } else {
          name = ingredients.find(i => i.id === item.ingredient_id)?.name ?? '';
        }
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

  function addItem() {
    if (itemType === 'product') {
      append({ type: 'product', product_id: '', quantity: 1, unit: 'יחידה', unit_price: 0, notes: '' });
    } else {
      append({ type: 'ingredient', ingredient_id: '', quantity: 1, unit: 'ק"ג', unit_price: 0, notes: '' });
    }
  }

  function handleProductChange(idx: number, productId: string) {
    const product = products.find(p => p.id === productId);
    if (product) {
      setValue(`items.${idx}.unit_price`, productCost(product));
    }
  }

  function handleIngredientChange(idx: number, ingredientId: string) {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (ing) {
      setValue(`items.${idx}.unit`, ing.unit);
      setValue(`items.${idx}.unit_price`, ing.current_price);
    }
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">פריטים להעברה</p>
            <div className="flex items-center gap-2">
              <select
                value={itemType}
                onChange={e => setItemType(e.target.value as 'product' | 'ingredient')}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
              >
                <option value="product">מוצר</option>
                <option value="ingredient">מרכיב</option>
              </select>
              <Button type="button" variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={addItem}>
                הוסף פריט
              </Button>
            </div>
          </div>

          {errors.items?.root && (
            <p className="text-xs text-red-500 mb-2">{errors.items.root.message}</p>
          )}
          {typeof errors.items?.message === 'string' && (
            <p className="text-xs text-red-500 mb-2">{errors.items.message}</p>
          )}

          <div className="space-y-2">
            {fields.map((field, idx) => {
              const type = watchedItems[idx]?.type ?? 'product';
              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg items-end">
                  <div className="col-span-4">
                    {type === 'product' ? (
                      <Select
                        label={idx === 0 ? 'מוצר' : undefined}
                        placeholder="בחר מוצר"
                        {...register(`items.${idx}.product_id`, {
                          onChange: e => handleProductChange(idx, e.target.value),
                        })}
                      >
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    ) : (
                      <Select
                        label={idx === 0 ? 'מרכיב' : undefined}
                        placeholder="בחר מרכיב"
                        {...register(`items.${idx}.ingredient_id`, {
                          onChange: e => handleIngredientChange(idx, e.target.value),
                        })}
                      >
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </Select>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'כמות' : undefined}
                      type="number" step="0.001"
                      error={errors.items?.[idx]?.quantity?.message}
                      {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select label={idx === 0 ? 'יחידה' : undefined} {...register(`items.${idx}.unit`)}>
                      {['יחידה', 'ק"ג', 'גרם', 'ליטר', 'מ"ל', 'חבילה', 'צרור'].map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'מחיר ליח׳ (₪)' : undefined}
                      type="number" step="0.01"
                      {...register(`items.${idx}.unit_price`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="col-span-1 flex justify-center items-end pb-0.5">
                    {watchedItems[idx] && (
                      <span className="text-xs text-gray-600 font-medium">
                        {formatCurrency(transferItemTotal(watchedItems[idx].quantity || 0, watchedItems[idx].unit_price || 0))}
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end items-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {fields.length > 0 && (
            <div className="mt-3 flex justify-end">
              <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm">
                <span className="text-blue-600">סה"כ ערך ההעברה: </span>
                <strong className="text-blue-800">{formatCurrency(totalValue)}</strong>
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
