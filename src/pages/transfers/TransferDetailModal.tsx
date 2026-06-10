import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TransferStatusBadge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate, formatTime } from '@/lib/dateUtils';
import type { InternalTransfer } from '@/types/database.types';

interface Props {
  transferId: string | null;
  onClose: () => void;
  onStatusChange: () => void;
}

async function fetchTransferDetail(id: string) {
  const { data, error } = await supabase
    .from('internal_transfers')
    .select(`
      *,
      from_department:departments!from_department_id(id,name),
      to_department:departments!to_department_id(id,name),
      transfer_items:internal_transfer_items(*)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as InternalTransfer;
}

export function TransferDetailModal({ transferId, onClose, onStatusChange }: Props) {
  const { canApprove, canEdit, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: transfer, isLoading } = useQuery({
    queryKey: ['transfer-detail', transferId],
    queryFn: () => fetchTransferDetail(transferId!),
    enabled: !!transferId,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: InternalTransfer['status']) => {
      const update: Record<string, unknown> = { status };
      if (status === 'approved') { update.approved_by = user?.id; update.approved_at = new Date().toISOString(); }
      if (status === 'reconciled') update.reconciled_at = new Date().toISOString();
      const { error } = await supabase.from('internal_transfers').update(update).eq('id', transferId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-detail', transferId] });
      onStatusChange();
      toast.success('הסטטוס עודכן');
    },
    onError: () => toast.error('שגיאה בעדכון הסטטוס'),
  });

  return (
    <Modal
      open={!!transferId}
      onClose={onClose}
      title={transfer ? `העברה ${transfer.transfer_number}` : 'פרטי העברה'}
      size="lg"
      footer={
        transfer ? (
          <div className="flex items-center gap-2 flex-wrap">
            {canApprove() && transfer.status === 'pending_approval' && (
              <>
                <Button variant="danger" size="sm" onClick={() => updateStatus.mutate('rejected')}>דחה</Button>
                <Button size="sm" onClick={() => updateStatus.mutate('approved')}>אשר</Button>
              </>
            )}
            {canEdit() && transfer.status === 'approved' && (
              <Button size="sm" onClick={() => updateStatus.mutate('completed')}>סמן כהושלם</Button>
            )}
            {canApprove() && transfer.status === 'completed' && (
              <Button variant="secondary" size="sm" onClick={() => updateStatus.mutate('reconciled')}>סמן כגויס</Button>
            )}
            <Button variant="ghost" onClick={onClose}>סגור</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={onClose}>סגור</Button>
        )
      }
    >
      {isLoading ? (
        <PageSpinner />
      ) : !transfer ? (
        <p className="text-gray-500 text-center py-8">לא נמצאה ההעברה</p>
      ) : (
        <div className="space-y-5">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-0.5">תאריך</p>
              <p className="font-medium">{formatDate(transfer.transfer_date)}{transfer.transfer_time ? ` ${formatTime(transfer.transfer_time)}` : ''}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">סטטוס</p>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">ממחלקה</p>
              <p className="font-medium">{transfer.from_department?.name}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">למחלקה</p>
              <p className="font-medium">{transfer.to_department?.name}</p>
            </div>
          </div>

          {transfer.notes && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
              <p className="text-xs text-gray-400 mb-1">הערות</p>
              {transfer.notes}
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">פריטים</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">פריט</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">כמות</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">יחידה</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">מחיר ליח׳</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">סה"כ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(transfer.transfer_items ?? []).map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{item.item_name_snapshot}</td>
                      <td className="px-3 py-2.5 text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-gray-600">{item.unit}</td>
                      <td className="px-3 py-2.5 text-gray-600">{formatCurrency(item.unit_price_snapshot)}</td>
                      <td className="px-3 py-2.5 font-semibold">{formatCurrency(item.total_price_snapshot)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-sm font-semibold text-gray-700 text-left">סה"כ ערך ההעברה</td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">{formatCurrency(transfer.total_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
