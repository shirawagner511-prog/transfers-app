import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatCurrency';
import type { BalanceResult } from '@/lib/balanceCalculations';

export interface SettlePair {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  amount: number;
}

function netClass(net: number): string {
  return net > 0 ? 'text-green-600' : net < 0 ? 'text-red-600' : 'text-gray-400';
}

function netLabel(net: number): string {
  return `${net > 0 ? '+' : ''}${formatCurrency(net)}`;
}

/**
 * Inter-department balances. Summary is a mobile-friendly row list (no
 * horizontal scroll); tapping a department opens its detail (who owes it /
 * whom it owes), with an optional "קזז" action per pair.
 */
export function BalanceTable({ result, onSettlePair }: { result: BalanceResult; onSettlePair?: (pair: SettlePair) => void }) {
  const { summary, details } = result;
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  const selected = selectedDept ? summary.find(r => r.department_id === selectedDept) : null;
  const detail = selectedDept ? details[selectedDept] : null;

  return (
    <div className="space-y-4">
      <Card padding={false}>
        <div className="divide-y divide-gray-100">
          {summary.map(row => {
            const isSel = row.department_id === selectedDept;
            return (
              <button
                key={row.department_id}
                onClick={() => setSelectedDept(isSel ? null : row.department_id)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-right transition-colors ${isSel ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{row.department_name}</p>
                  <p className="text-xs text-gray-500">
                    חייבים לה {row.owed_to > 0 ? formatCurrency(row.owed_to) : '—'} · היא חייבת {row.owes > 0 ? formatCurrency(row.owes) : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`font-bold ${netClass(row.net)}`}>{netLabel(row.net)}</span>
                  <ArrowLeft className={`w-4 h-4 ${isSel ? 'text-teal-500' : 'text-gray-300'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {selected && detail && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {selected.department_name} — יתרה נטו{' '}
            <span className={netClass(selected.net)}>{netLabel(selected.net)}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase mb-2">חייבים ל{selected.department_name}</p>
              {detail.owesYou.length === 0 ? (
                <p className="text-sm text-gray-400">אף אחד לא חייב</p>
              ) : (
                <div className="space-y-1">
                  {detail.owesYou.map(e => (
                    <div key={e.department_id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-green-50">
                      <span className="text-sm text-gray-800">{e.department_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-green-700">{formatCurrency(e.amount)}</span>
                        {onSettlePair && (
                          <Button variant="outline" size="sm" onClick={() => onSettlePair({
                            aId: selected.department_id, aName: selected.department_name,
                            bId: e.department_id, bName: e.department_name, amount: e.amount,
                          })}>קזז</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-red-700 uppercase mb-2">{selected.department_name} חייבת ל</p>
              {detail.youOwe.length === 0 ? (
                <p className="text-sm text-gray-400">לא חייבת לאף אחד</p>
              ) : (
                <div className="space-y-1">
                  {detail.youOwe.map(e => (
                    <div key={e.department_id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-red-50">
                      <span className="text-sm text-gray-800">{e.department_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-red-700">{formatCurrency(e.amount)}</span>
                        {onSettlePair && (
                          <Button variant="outline" size="sm" onClick={() => onSettlePair({
                            aId: selected.department_id, aName: selected.department_name,
                            bId: e.department_id, bName: e.department_name, amount: e.amount,
                          })}>קזז</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {summary.length > 0 && !selected && (
        <p className="text-sm text-gray-400 text-center">לחצי על מחלקה כדי לראות מי חייב לה ולמי היא חייבת</p>
      )}
    </div>
  );
}
