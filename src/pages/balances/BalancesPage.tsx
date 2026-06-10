import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scale, ChevronRight, ChevronLeft, History as HistoryIcon, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InternalTransfer, Settlement } from '@/types/database.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { BalanceTable } from '@/components/BalanceTable';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  type PeriodType, todayISO, periodRange, periodLabel, shiftPeriod, formatDate, formatDateTime,
} from '@/lib/dateUtils';
import { computeBalances } from '@/lib/balanceCalculations';
import { ExportButton } from '@/components/ui/ExportButton';
import type { DepartmentBalanceRow } from '@/lib/balanceCalculations';

function balanceRows(summary: DepartmentBalanceRow[]) {
  return summary.map(r => ({
    'מחלקה': r.department_name,
    'חייבים לה (₪)': r.owed_to,
    'היא חייבת (₪)': r.owes,
    'יתרה נטו (₪)': r.net,
  }));
}

const TRANSFER_SELECT = `
  *,
  from_department:departments!from_department_id(id,name),
  to_department:departments!to_department_id(id,name)
`;

type Mode = 'open' | 'period' | 'history';

const PERIOD_LABELS: Record<PeriodType, string> = { day: 'יומי', week: 'שבועי', month: 'חודשי' };

export function BalancesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('open');
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [anchor, setAnchor] = useState(todayISO());
  const [confirmSettle, setConfirmSettle] = useState(false);

  // --- Open (unsettled) balance ---
  const { data: openTransfers = [], isLoading: openLoading } = useQuery({
    queryKey: ['balances-open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_transfers')
        .select(TRANSFER_SELECT)
        .is('settlement_id', null);
      if (error) throw error;
      return data as InternalTransfer[];
    },
  });

  const { data: lastSettlement } = useQuery({
    queryKey: ['last-settlement'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .order('settled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Settlement | null;
    },
  });

  // --- Period browse ---
  const { start, end } = periodRange(periodType, anchor);
  const { data: periodTransfers = [], isLoading: periodLoading } = useQuery({
    queryKey: ['balances-period', start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_transfers')
        .select(TRANSFER_SELECT)
        .gte('transfer_date', start)
        .lte('transfer_date', end);
      if (error) throw error;
      return data as InternalTransfer[];
    },
    enabled: mode === 'period',
  });

  // --- Settlement history ---
  const { data: settlements = [], isLoading: historyLoading } = useQuery({
    queryKey: ['settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .order('settled_at', { ascending: false });
      if (error) throw error;
      return data as Settlement[];
    },
    enabled: mode === 'history',
  });

  const openResult = computeBalances(openTransfers);
  const periodResult = computeBalances(periodTransfers);

  const settle = useMutation({
    mutationFn: async () => {
      const snapshot = { from: lastSettlement?.settled_at ?? null, summary: openResult.summary };
      const { error } = await supabase.rpc('perform_settlement', { p_note: null, p_snapshot: snapshot });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances-open'] });
      queryClient.invalidateQueries({ queryKey: ['last-settlement'] });
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('הקיזוז בוצע — המאזן אופס');
      setConfirmSettle(false);
    },
    onError: () => toast.error('שגיאה בביצוע הקיזוז'),
  });

  const tabBase = 'px-4 py-1.5 text-sm font-medium rounded-md transition-colors';
  const tabOn = 'bg-white text-blue-600 shadow-sm';
  const tabOff = 'text-gray-500 hover:text-gray-700';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">מאזן בין מחלקות</h1>
        <p className="text-sm text-gray-500 mt-1">מי חייב למי וכמה — יתרה נטו</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setMode('open')} className={`${tabBase} ${mode === 'open' ? tabOn : tabOff}`}>מאזן פתוח</button>
        <button onClick={() => setMode('period')} className={`${tabBase} ${mode === 'period' ? tabOn : tabOff}`}>לפי תקופה</button>
        <button onClick={() => setMode('history')} className={`${tabBase} ${mode === 'history' ? tabOn : tabOff}`}>היסטוריית קיזוזים</button>
      </div>

      {/* OPEN BALANCE */}
      {mode === 'open' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              מאזן פתוח —{' '}
              {lastSettlement
                ? <span>מאז הקיזוז האחרון ({formatDate(lastSettlement.settled_at)})</span>
                : <span>מתחילת השימוש</span>}
            </p>
            <div className="flex items-center gap-2">
              <ExportButton filename="מאזן-פתוח" rows={balanceRows(openResult.summary)} />
              <Button
                variant="primary"
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => setConfirmSettle(true)}
                disabled={openResult.summary.length === 0 || settle.isPending}
              >
                בצע קיזוז
              </Button>
            </div>
          </div>

          {openLoading ? (
            <PageSpinner />
          ) : openResult.summary.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-green-200 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">אין חובות פתוחים</p>
                <p className="text-gray-400 text-sm mt-1">הכול מקוזז — אין יתרות בין מחלקות</p>
              </div>
            </Card>
          ) : (
            <BalanceTable result={openResult} />
          )}
        </>
      )}

      {/* PERIOD BROWSE */}
      {mode === 'period' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
              {(['day', 'week', 'month'] as PeriodType[]).map(p => (
                <button key={p} onClick={() => setPeriodType(p)} className={`${tabBase} ${periodType === p ? tabOn : tabOff}`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setAnchor(a => shiftPeriod(periodType, a, -1))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="הקודם">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-gray-800 min-w-[11rem] text-center">{periodLabel(periodType, anchor)}</span>
              <button
                onClick={() => setAnchor(a => shiftPeriod(periodType, a, 1))}
                disabled={end >= todayISO()}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title="הבא"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <ExportButton filename="מאזן-תקופה" rows={balanceRows(periodResult.summary)} />
            </div>
          </div>

          {periodLoading ? (
            <PageSpinner />
          ) : periodResult.summary.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <Scale className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">אין העברות בתקופה זו</p>
              </div>
            </Card>
          ) : (
            <BalanceTable key={`${start}-${end}`} result={periodResult} />
          )}
        </>
      )}

      {/* HISTORY */}
      {mode === 'history' && (
        historyLoading ? (
          <PageSpinner />
        ) : settlements.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <HistoryIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">עדיין לא בוצעו קיזוזים</p>
              <p className="text-gray-400 text-sm mt-1">קיזוזים שתבצעי יישמרו כאן</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {settlements.map(s => (
              <SettlementCard key={s.id} settlement={s} />
            ))}
          </div>
        )
      )}

      <ConfirmModal
        open={confirmSettle}
        onClose={() => setConfirmSettle(false)}
        onConfirm={() => settle.mutate()}
        title="ביצוע קיזוז"
        message="כל החובות הפתוחים ייסגרו והמאזן יתאפס. לאחר מכן הספירה מתחילה מחדש. לא ניתן לבטל פעולה זו."
        confirmLabel="בצע קיזוז"
        danger
        loading={settle.isPending}
      />
    </div>
  );
}

function SettlementCard({ settlement }: { settlement: Settlement }) {
  const [open, setOpen] = useState(false);
  const rows = settlement.snapshot?.summary ?? [];

  return (
    <Card padding={false}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">קיזוז — {formatDateTime(settlement.settled_at)}</p>
            <p className="text-xs text-gray-500">
              {settlement.snapshot?.from
                ? `כיסה מ-${formatDate(settlement.snapshot.from)} עד ${formatDate(settlement.settled_at)}`
                : 'כיסה מתחילת השימוש'}
            </p>
          </div>
        </div>
        <span className="text-xs text-blue-600">{open ? 'הסתר' : 'הצג יתרות'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400">לא נשמרו יתרות לקיזוז זה</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="text-right py-2 font-medium">מחלקה</th>
                  <th className="text-right py-2 font-medium">חייבים לה</th>
                  <th className="text-right py-2 font-medium">היא חייבת</th>
                  <th className="text-right py-2 font-medium">יתרה נטו</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.department_id}>
                    <td className="py-2 font-medium text-gray-900">{r.department_name}</td>
                    <td className="py-2 text-gray-600">{r.owed_to > 0 ? formatCurrency(r.owed_to) : '—'}</td>
                    <td className="py-2 text-gray-600">{r.owes > 0 ? formatCurrency(r.owes) : '—'}</td>
                    <td className="py-2 font-bold">
                      <span className={r.net > 0 ? 'text-green-600' : r.net < 0 ? 'text-red-600' : 'text-gray-400'}>
                        {r.net > 0 ? '+' : ''}{formatCurrency(r.net)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
