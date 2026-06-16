import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Building2, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Department } from '@/types/database.types';
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

const schema = z.object({
  name: z.string().min(1, 'שם המחלקה נדרש'),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type View = 'active' | 'archive';

async function fetchDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as Department[];
}

export function DepartmentsPage() {
  const { canEdit, canApprove } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const upsert = useMutation({
    mutationFn: async (data: FormData) => {
      if (editing) {
        const { error } = await supabase.from('departments').update(data).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('departments').insert({ ...data, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(editing ? 'המחלקה עודכנה בהצלחה' : 'המחלקה נוספה בהצלחה');
      closeModal();
    },
    onError: () => toast.error('שגיאה בשמירת המחלקה'),
  });

  const setActive = useMutation({
    mutationFn: async ({ dept, active }: { dept: Department; active: boolean }) => {
      const { error } = await supabase
        .from('departments')
        .update({ is_active: active })
        .eq('id', dept.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(vars.active ? 'המחלקה שוחזרה' : 'המחלקה הועברה לארכיון');
    },
    onError: () => toast.error('שגיאה בעדכון המחלקה'),
  });

  const hardDelete = useMutation({
    mutationFn: async (dept: Department) => {
      const { error } = await supabase.from('departments').delete().eq('id', dept.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('המחלקה נמחקה לצמיתות');
      setConfirmDelete(null);
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        toast.error('לא ניתן למחוק — המחלקה משויכת להעברות קיימות. היא תישאר בארכיון.');
      } else {
        toast.error('שגיאה במחיקת המחלקה');
      }
      setConfirmDelete(null);
    },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', description: '' });
    setModalOpen(true);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    reset({ name: dept.name, description: dept.description ?? '' });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    reset();
  }

  if (isLoading) return <PageSpinner />;

  const activeDepts = departments.filter(d => d.is_active);
  const archivedDepts = departments.filter(d => !d.is_active);
  const shown = view === 'active' ? activeDepts : archivedDepts;

  const tabBase = 'px-4 py-1.5 text-sm font-medium rounded-md transition-colors';
  const tabOn = 'bg-white text-teal-600 shadow-sm';
  const tabOff = 'text-gray-500 hover:text-gray-700';

  return (
    <div>
      <PageHeader
        title="מחלקות"
        subtitle={`${activeDepts.length} מחלקות פעילות`}
        actions={
          canEdit() && (
            <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
              הוסף מחלקה
            </Button>
          )
        }
      />

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setView('active')} className={`${tabBase} ${view === 'active' ? tabOn : tabOff}`}>
          פעילים ({activeDepts.length})
        </button>
        <button onClick={() => setView('archive')} className={`${tabBase} ${view === 'archive' ? tabOn : tabOff}`}>
          ארכיון ({archivedDepts.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={view === 'active' ? 'אין מחלקות פעילות' : 'הארכיון ריק'}
          description={view === 'active' ? 'הוסף מחלקות כדי להתחיל לנהל העברות' : 'מחלקות שתעבירי לארכיון יופיעו כאן'}
          icon={<Building2 className="w-12 h-12" />}
          action={view === 'active' && canEdit() ? { label: 'הוסף מחלקה', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map(dept => (
            <Card key={dept.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${dept.is_active ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{dept.name}</p>
                    {dept.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{dept.description}</p>
                    )}
                  </div>
                </div>
              </div>

              {canEdit() && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  {dept.is_active ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil className="w-3.5 h-3.5" />}
                        onClick={() => openEdit(dept)}
                      >
                        עריכה
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Archive className="w-3.5 h-3.5" />}
                        onClick={() => setActive.mutate({ dept, active: false })}
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
                        onClick={() => setActive.mutate({ dept, active: true })}
                      >
                        שחזר
                      </Button>
                      {canApprove() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                          onClick={() => setConfirmDelete(dept)}
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

      {/* Form Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'עריכת מחלקה' : 'הוספת מחלקה'}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>ביטול</Button>
            <Button onClick={handleSubmit(d => upsert.mutate(d))} loading={isSubmitting || upsert.isPending}>
              {editing ? 'שמור שינויים' : 'הוסף מחלקה'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="שם המחלקה" required error={errors.name?.message} {...register('name')} />
          <Textarea label="תיאור" {...register('description')} />
        </form>
      </Modal>

      {/* Permanent delete confirm */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && hardDelete.mutate(confirmDelete)}
        title="מחיקה לצמיתות"
        message={`האם למחוק לצמיתות את המחלקה "${confirmDelete?.name}"? לא ניתן לשחזר פעולה זו.`}
        confirmLabel="מחק לצמיתות"
        danger
        loading={hardDelete.isPending}
      />
    </div>
  );
}
