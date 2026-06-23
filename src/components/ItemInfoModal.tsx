import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/dateUtils';

interface ItemInfoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
}

/** Small modal showing who added an item and when. */
export function ItemInfoModal({ open, onClose, title, createdBy, createdAt, updatedAt }: ItemInfoModalProps) {
  const { data: creatorName } = useQuery({
    queryKey: ['profile-name', createdBy],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('full_name').eq('user_id', createdBy!).maybeSingle();
      return data?.full_name ?? null;
    },
    enabled: open && !!createdBy,
  });

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<Button variant="ghost" onClick={onClose}>סגור</Button>}>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">נוסף על ידי</p>
          <p className="font-medium text-gray-900">{creatorName ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">תאריך ושעת הוספה</p>
          <p className="font-medium text-gray-900">{createdAt ? formatDateTime(createdAt) : '—'}</p>
        </div>
        {updatedAt && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">עודכן לאחרונה</p>
            <p className="font-medium text-gray-900">{formatDateTime(updatedAt)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
