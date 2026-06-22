import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ArrowLeftRight, TrendingUp, AlertCircle, Clock, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InternalTransfer, TransferStatus } from '@/types/database.types';
import { Card, StatCard } from '@/components/ui/Card';
import { TransferStatusBadge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/formatCurrency';
import { todayISO, formatTime } from '@/lib/dateUtils';
import { dailyTotalValue } from '@/lib/transferCalculations';
import { TransferDetailModal } from '../transfers/TransferDetailModal';
import { useQueryClient } from '@tanstack/react-query';

async function fetchDayTransfers(date: string) {
  const { data, error } = await supabase
    .from('internal_transfers')
    .select(`
      *,
      from_department:departments!from_department_id(id,name),
      to_department:departments!to_department_id(id,name),
      transfer_items:internal_transfer_items(*)
    `)
    .eq('transfer_date', date)
    .order('transfer_time', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as InternalTransfer[];
}

export function DailySummaryPage() {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [detailId, setDetailId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: transfers = [], isLoading, error } = useQuery({
    queryKey: ['daily-summary', selectedDate],
    queryFn: () => fetchDayTransfers(selectedDate),
  });

  const totalValue = dailyTotalValue(transfers);
  const pending = transfers.filter(t => t.status === 'pending_approval');
  const drafts = transfers.filter(t => t.status === 'draft');
  const rejected = transfers.filter(t => t.status === 'rejected');

  const timeline = [...transfers]
    .filter(t => t.status !== 'cancelled')
    .sort((a, b) => {
      const ta = a.transfer_time ?? '00:00';
      const tb = b.transfer_time ?? '00:00';
      return ta.localeCompare(tb);
    });

  const isToday = selectedDate === todayISO();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isToday ? 'סיכום יומי — היום' : 'סיכום יומי'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">תמונת מצב תפעולית של העברות פנימיות</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={todayISO()}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {isLoading && <PageSpinner />}

      {error && (
        <Card>
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">לא ניתן לטעון את הסיכום היומי. נסה שוב.</p>
          </div>
        </Card>
      )}

      {!isLoading && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label={'סה"כ העברות'}
              value={transfers.filter(t => t.status !== 'cancelled').length}
              icon={<ArrowLeftRight className="w-5 h-5" />}
            />
            <StatCard
              label="ערך כולל"
              value={formatCurrency(totalValue)}
              icon={<TrendingUp className="w-5 h-5" />}
            />
            <StatCard
              label="ממתינות לאישור"
              value={pending.length}
              icon={<Clock className="w-5 h-5" />}
            />
            <StatCard
              label="טיוטות פתוחות"
              value={drafts.length}
              icon={<AlertCircle className="w-5 h-5" />}
            />
          </div>

          {transfers.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <ArrowLeftRight className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">אין העברות ליום זה</p>
                <p className="text-gray-400 text-sm mt-1">לא נרשמו העברות פנימיות</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Timeline */}
              <Card>
                <h2 className="text-base font-semibold text-gray-900 mb-4">ציר זמן העברות</h2>
                <div className="space-y-0">
                  {timeline.map((t, idx) => {
                    const itemCount = t.transfer_items?.length ?? 0;
                    const firstItem = t.transfer_items?.[0];
                    const summary = firstItem
                      ? itemCount > 1
                        ? `${firstItem.item_name_snapshot} ועוד ${itemCount - 1}`
                        : `${firstItem.item_name_snapshot} ×${firstItem.quantity}`
                      : 'ללא פריטים';

                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-4 py-3 px-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group border-b border-gray-100 last:border-0"
                        onClick={() => setDetailId(t.id)}
                      >
                        {/* Time */}
                        <div className="w-12 text-xs text-gray-400 font-mono flex-shrink-0 text-center">
                          {t.transfer_time ? formatTime(t.transfer_time) : '—'}
                        </div>

                        {/* Timeline dot */}
                        <div className="relative flex flex-col items-center flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            t.status === 'completed' || t.status === 'reconciled' ? 'bg-green-500' :
                            t.status === 'rejected' ? 'bg-red-400' :
                            t.status === 'pending_approval' ? 'bg-yellow-400' :
                            'bg-teal-400'
                          }`} />
                          {idx < timeline.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 mt-1 h-full absolute top-3" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {t.from_department?.name} → {t.to_department?.name}
                            </span>
                            <TransferStatusBadge status={t.status as TransferStatus} />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>
                        </div>

                        {/* Value */}
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(t.total_value)}</span>
                        </div>

                        {/* Arrow hint */}
                        <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0 rotate-180" />
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Pending actions */}
              {(pending.length > 0 || drafts.length > 0 || rejected.length > 0) && (
                <Card>
                  <h2 className="text-base font-semibold text-gray-900 mb-4">פעולות נדרשות</h2>
                  <div className="space-y-2">
                    {pending.length > 0 && (
                      <ActionGroup
                        label="ממתינות לאישור"
                        items={pending}
                        color="yellow"
                        onSelect={setDetailId}
                      />
                    )}
                    {drafts.length > 0 && (
                      <ActionGroup
                        label="טיוטות פתוחות"
                        items={drafts}
                        color="gray"
                        onSelect={setDetailId}
                      />
                    )}
                    {rejected.length > 0 && (
                      <ActionGroup
                        label="נדחו"
                        items={rejected}
                        color="red"
                        onSelect={setDetailId}
                      />
                    )}
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      <TransferDetailModal
        transferId={detailId}
        onClose={() => setDetailId(null)}
        onStatusChange={() => {
          queryClient.invalidateQueries({ queryKey: ['daily-summary', selectedDate] });
        }}
      />
    </div>
  );
}

interface ActionGroupProps {
  label: string;
  items: InternalTransfer[];
  color: 'yellow' | 'gray' | 'red';
  onSelect: (id: string) => void;
}

function ActionGroup({ label, items, color, onSelect }: ActionGroupProps) {
  const bg = { yellow: 'bg-yellow-50 border-yellow-200', gray: 'bg-gray-50 border-gray-200', red: 'bg-red-50 border-red-200' };
  const text = { yellow: 'text-yellow-700', gray: 'text-gray-600', red: 'text-red-700' };

  return (
    <div className={`rounded-lg border p-3 ${bg[color]}`}>
      <p className={`text-xs font-semibold uppercase mb-2 ${text[color]}`}>{label} ({items.length})</p>
      <div className="space-y-1">
        {items.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="w-full flex items-center justify-between text-sm hover:opacity-70 transition-opacity"
          >
            <span className="font-mono text-gray-600">{t.transfer_number}</span>
            <span className="text-gray-500">
              {t.from_department?.name} → {t.to_department?.name} · {formatCurrency(t.total_value)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
