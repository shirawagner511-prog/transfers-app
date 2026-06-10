import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, ShoppingBag, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/types/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/dateUtils';

const schema = z.object({
  name: z.string().min(1, 'שם האירוע נדרש'),
  customer_name: z.string().optional(),
  event_date: z.string().optional(),
  status: z.enum(['draft', 'confirmed', 'in_progress', 'completed', 'cancelled']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Order[];
}

export function OrdersPage() {
  const { canEdit, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'draft' },
  });

  const upsert = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, customer_name: data.customer_name || null, event_date: data.event_date || null, notes: data.notes || null };
      if (editing) {
        const { error } = await supabase.from('orders').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('orders').insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(editing ? 'האירוע עודכן' : 'האירוע נוסף');
      closeModal();
    },
    onError: () => toast.error('שגיאה בשמירה'),
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', customer_name: '', event_date: '', status: 'draft', notes: '' });
    setModalOpen(true);
  }

  function openEdit(o: Order) {
    setEditing(o);
    reset({ name: o.name, customer_name: o.customer_name ?? '', event_date: o.event_date ?? '', status: o.status, notes: o.notes ?? '' });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditing(null); reset(); }

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="הזמנות / אירועים"
        subtitle={`${orders.length} אירועים`}
        actions={
          canEdit() && (
            <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>אירוע חדש</Button>
          )
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          title="אין אירועים עדיין"
          icon={<ShoppingBag className="w-12 h-12" />}
          action={canEdit() ? { label: 'אירוע חדש', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map(o => (
            <Card key={o.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{o.name}</p>
                  {o.customer_name && <p className="text-sm text-gray-600">{o.customer_name}</p>}
                  {o.event_date && <p className="text-xs text-gray-400 mt-0.5">{formatDate(o.event_date)}</p>}
                </div>
                <OrderStatusBadge status={o.status} />
              </div>
              {o.notes && <p className="text-xs text-gray-500">{o.notes}</p>}
              {canEdit() && (
                <div className="pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => openEdit(o)}>עריכה</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'עריכת אירוע' : 'אירוע חדש'}
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
          <Input label="שם האירוע" required error={errors.name?.message} {...register('name')} />
          <Input label="שם לקוח" {...register('customer_name')} />
          <Input label="תאריך אירוע" type="date" {...register('event_date')} />
          <Select label="סטטוס" {...register('status')}>
            <option value="draft">טיוטה</option>
            <option value="confirmed">מאושר</option>
            <option value="in_progress">בביצוע</option>
            <option value="completed">הושלם</option>
            <option value="cancelled">בוטל</option>
          </Select>
          <Textarea label="הערות" {...register('notes')} />
        </form>
      </Modal>
    </div>
  );
}
