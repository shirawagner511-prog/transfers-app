import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Truck, Phone, Mail, Search, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Supplier } from '@/types/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { ExportButton } from '@/components/ui/ExportButton';

const schema = z.object({
  name: z.string().min(1, 'שם הספק נדרש'),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('מייל לא תקין').optional().or(z.literal('')),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type View = 'active' | 'archive';

async function fetchSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return data as Supplier[];
}

export function SuppliersPage() {
  const { canEdit, canApprove } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const upsert = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, email: data.email || null, contact_name: data.contact_name || null };
      if (editing) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...payload, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(editing ? 'הספק עודכן בהצלחה' : 'הספק נוסף בהצלחה');
      closeModal();
    },
    onError: () => toast.error('שגיאה בשמירת הספק'),
  });

  const setActive = useMutation({
    mutationFn: async ({ supplier, active }: { supplier: Supplier; active: boolean }) => {
      const { error } = await supabase.from('suppliers').update({ is_active: active }).eq('id', supplier.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(vars.active ? 'הספק שוחזר' : 'הספק הועבר לארכיון');
    },
    onError: () => toast.error('שגיאה בעדכון הספק'),
  });

  const hardDelete = useMutation({
    mutationFn: async (supplier: Supplier) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', supplier.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('הספק נמחק לצמיתות');
      setConfirmDelete(null);
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        toast.error('לא ניתן למחוק — הספק משויך לרשומות קיימות. הוא יישאר בארכיון.');
      } else {
        toast.error('שגיאה במחיקת הספק');
      }
      setConfirmDelete(null);
    },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', contact_name: '', phone: '', email: '', notes: '' });
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    reset({
      name: s.name,
      contact_name: s.contact_name ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      notes: s.notes ?? '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    reset();
  }

  if (isLoading) return <PageSpinner />;

  const activeSuppliers = suppliers.filter(s => s.is_active);
  const archivedSuppliers = suppliers.filter(s => !s.is_active);
  const filtered = (view === 'active' ? activeSuppliers : archivedSuppliers).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const exportRows = filtered.map(s => ({
    'שם': s.name,
    'איש קשר': s.contact_name ?? '',
    'טלפון': s.phone ?? '',
    'מייל': s.email ?? '',
    'הערות': s.notes ?? '',
    'סטטוס': s.is_active ? 'פעיל' : 'בארכיון',
  }));

  const tabBase = 'px-4 py-1.5 text-sm font-medium rounded-md transition-colors';
  const tabOn = 'bg-white text-blue-600 shadow-sm';
  const tabOff = 'text-gray-500 hover:text-gray-700';

  return (
    <div>
      <PageHeader
        title="ספקים"
        subtitle={`${activeSuppliers.length} ספקים פעילים`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton filename="ספקים" rows={exportRows} />
            {canEdit() && (
              <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                הוסף ספק
              </Button>
            )}
          </div>
        }
      />

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setView('active')} className={`${tabBase} ${view === 'active' ? tabOn : tabOff}`}>
          פעילים ({activeSuppliers.length})
        </button>
        <button onClick={() => setView('archive')} className={`${tabBase} ${view === 'archive' ? tabOn : tabOff}`}>
          ארכיון ({archivedSuppliers.length})
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 max-w-sm">
        <Input
          placeholder="חפש ספק..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          startIcon={<Search className="w-4 h-4" />}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'לא נמצאו ספקים' : view === 'archive' ? 'הארכיון ריק' : 'אין ספקים עדיין'}
          description={search ? 'נסה לחפש מונח אחר' : view === 'archive' ? 'ספקים שתעבירי לארכיון יופיעו כאן' : 'הוסף ספקים כדי להתחיל'}
          icon={<Truck className="w-12 h-12" />}
          action={!search && view === 'active' && canEdit() ? { label: 'הוסף ספק', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${s.is_active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    {s.contact_name && <p className="text-xs text-gray-500">{s.contact_name}</p>}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                {s.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3.5 h-3.5" />
                    <span dir="ltr">{s.phone}</span>
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Mail className="w-3.5 h-3.5" />
                    <span dir="ltr">{s.email}</span>
                  </div>
                )}
                {s.notes && <p className="text-xs text-gray-500 mt-1">{s.notes}</p>}
              </div>

              {canEdit() && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  {s.is_active ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil className="w-3.5 h-3.5" />}
                        onClick={() => openEdit(s)}
                      >
                        עריכה
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Archive className="w-3.5 h-3.5" />}
                        onClick={() => setActive.mutate({ supplier: s, active: false })}
                      >
                        ארכיון
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                        onClick={() => setActive.mutate({ supplier: s, active: true })}
                      >
                        שחזר
                      </Button>
                      {canApprove() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                          onClick={() => setConfirmDelete(s)}
                        >
                          מחק לצמיתות
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'עריכת ספק' : 'הוספת ספק'}
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
          <Input label="שם הספק" required error={errors.name?.message} {...register('name')} />
          <Input label="איש קשר" error={errors.contact_name?.message} {...register('contact_name')} />
          <Input label="טלפון" type="tel" dir="ltr" {...register('phone')} />
          <Input label="מייל" type="email" dir="ltr" error={errors.email?.message} {...register('email')} />
          <Textarea label="הערות" {...register('notes')} />
        </form>
      </Modal>

      {/* Permanent delete confirm */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && hardDelete.mutate(confirmDelete)}
        title="מחיקה לצמיתות"
        message={`האם למחוק לצמיתות את הספק "${confirmDelete?.name}"? לא ניתן לשחזר פעולה זו.`}
        confirmLabel="מחק לצמיתות"
        danger
        loading={hardDelete.isPending}
      />
    </div>
  );
}
