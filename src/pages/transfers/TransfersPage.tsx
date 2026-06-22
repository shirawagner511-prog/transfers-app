import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, Eye, ArrowLeftRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InternalTransfer, TransferStatus } from '@/types/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { TransferStatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate, formatTime } from '@/lib/dateUtils';
import { ExportButton } from '@/components/ui/ExportButton';
import { TransferFormModal } from './TransferFormModal';
import { TransferDetailModal } from './TransferDetailModal';

const STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה', pending_approval: 'ממתין לאישור', approved: 'אושר',
  rejected: 'נדחה', completed: 'הושלם', reconciled: 'גויס', cancelled: 'בוטל',
};

async function fetchTransfers() {
  const { data, error } = await supabase
    .from('internal_transfers')
    .select(`
      *,
      from_department:departments!from_department_id(id,name),
      to_department:departments!to_department_id(id,name)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as InternalTransfer[];
}

export function TransfersPage() {
  const { canEdit, canApprove, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const [view, setView] = useState<'create' | 'history'>('history');
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<TransferStatus | ''>('');
  const [filterDept, setFilterDept] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setView('create');
      setCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: transfers = [], isLoading } = useQuery({ queryKey: ['transfers'], queryFn: fetchTransfers });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id,name').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TransferStatus }) => {
      const update: Record<string, unknown> = { status };
      if (status === 'approved') { update.approved_by = user?.id; update.approved_at = new Date().toISOString(); }
      if (status === 'reconciled') update.reconciled_at = new Date().toISOString();
      const { error } = await supabase.from('internal_transfers').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('הסטטוס עודכן');
    },
    onError: () => toast.error('שגיאה בעדכון הסטטוס'),
  });

  const filtered = transfers.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterDept && t.from_department_id !== filterDept && t.to_department_id !== filterDept) return false;
    if (search && !t.transfer_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportRows = filtered.map(t => ({
    'מספר': t.transfer_number,
    'תאריך': formatDate(t.transfer_date),
    'ממחלקה': t.from_department?.name ?? '',
    'למחלקה': t.to_department?.name ?? '',
    'ערך (₪)': t.total_value,
    'סטטוס': STATUS_LABELS[t.status] ?? t.status,
  }));

  if (isLoading) return <PageSpinner />;

  const tabBase = 'px-4 py-1.5 text-sm font-medium rounded-md transition-colors';
  const tabOn = 'bg-white text-teal-600 shadow-sm';
  const tabOff = 'text-gray-500 hover:text-gray-700';

  function openCreate() {
    setView('create');
    setCreateOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="העברות פנימיות"
        subtitle={`${transfers.length} העברות סה"כ`}
        actions={canEdit() && (
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>העברה חדשה</Button>
        )}
      />

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={openCreate} className={`${tabBase} ${view === 'create' ? tabOn : tabOff}`}>
          העברה חדשה
        </button>
        <button onClick={() => { setView('history'); setCreateOpen(false); }} className={`${tabBase} ${view === 'history' ? tabOn : tabOff}`}>
          היסטוריה ({transfers.length})
        </button>
      </div>

      {view === 'create' ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex p-3 bg-teal-50 rounded-2xl text-teal-600 mb-4">
              <ArrowLeftRight className="w-8 h-8" />
            </div>
            <p className="text-gray-700 font-medium mb-1">יצירת העברה פנימית חדשה</p>
            <p className="text-gray-400 text-sm mb-5">מלא/י את פרטי ההעברה בטופס</p>
            <Button onClick={() => setCreateOpen(true)} icon={<Plus className="w-4 h-4" />}>
              פתח טופס העברה
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <Card className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Filter className="w-4 h-4" />
                <span>סינון</span>
              </div>
              <ExportButton filename="העברות" rows={exportRows} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                placeholder="חפש לפי מספר העברה..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                startIcon={<Search className="w-4 h-4" />}
              />
              <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value as TransferStatus | '')} placeholder="כל הסטטוסים">
                <option value="draft">טיוטה</option>
                <option value="pending_approval">ממתין לאישור</option>
                <option value="approved">אושר</option>
                <option value="rejected">נדחה</option>
                <option value="completed">הושלם</option>
                <option value="reconciled">גויס</option>
                <option value="cancelled">בוטל</option>
              </Select>
              <Select value={filterDept} onChange={e => setFilterDept(e.target.value)} placeholder="כל המחלקות">
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState
              title="לא נמצאו העברות"
              description="צור העברה חדשה כדי להתחיל"
              action={canEdit() ? { label: 'העברה חדשה', onClick: openCreate, icon: <Plus className="w-4 h-4" /> } : undefined}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">מספר</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">ממחלקה</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">למחלקה</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">ערך</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-teal-600 font-medium">{t.transfer_number}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(t.transfer_date)}
                        {t.transfer_time && <span className="text-gray-400 text-xs mr-1">{formatTime(t.transfer_time)}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{t.from_department?.name}</td>
                      <td className="px-4 py-3 text-gray-700">{t.to_department?.name}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(t.total_value)}</td>
                      <td className="px-4 py-3"><TransferStatusBadge status={t.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setDetailId(t.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canApprove() && t.status === 'pending_approval' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: t.id, status: 'approved' })}>
                                אשר
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600" onClick={() => updateStatus.mutate({ id: t.id, status: 'rejected' })}>
                                דחה
                              </Button>
                            </>
                          )}
                          {canEdit() && t.status === 'approved' && (
                            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: t.id, status: 'completed' })}>
                              סיים
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <TransferFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departments={departments}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['transfers'] });
          setCreateOpen(false);
          setView('history');
        }}
      />

      <TransferDetailModal
        transferId={detailId}
        onClose={() => setDetailId(null)}
        onStatusChange={() => queryClient.invalidateQueries({ queryKey: ['transfers'] })}
      />
    </div>
  );
}
