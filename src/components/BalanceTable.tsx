import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatCurrency';
import type { BalanceResult } from '@/lib/balanceCalculations';

function netClass(net: number): string {
  return net > 0 ? 'text-green-600' : net < 0 ? 'text-red-600' : 'text-gray-400';
}

function netLabel(net: number): string {
  return `${net > 0 ? '+' : ''}${formatCurrency(net)}`;
}

/**
 * Interactive inter-department balance table: a summary row per department,
 * and a detail panel (who owes it / whom it owes) for the selected department.
 */
export function BalanceTable({ result }: { result: BalanceResult }) {
  const { summary, details } = result;
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  const selected = selectedDept ? summary.find(r => r.department_id === selectedDept) : null;
  const detail = selectedDept ? details[selectedDept] : null;

  return (
    <div className="space-y-4">
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מחלקה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">חייבים לה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">היא חייבת</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">יתרה נטו</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map(row => {
                const isSel = row.department_id === selectedDept;
                return (
                  <tr
                    key={row.department_id}
                    onClick={() => setSelectedDept(isSel ? null : row.department_id)}
                    className={`cursor-pointer transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{row.department_name}</td>
                    <td className="px-4 py-3 text-gray-600">{row.owed_to > 0 ? formatCurrency(row.owed_to) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{row.owes > 0 ? formatCurrency(row.owes) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${netClass(row.net)}`}>{netLabel(row.net)}</span>
                    </td>
                    <td className="px-4 py-3 text-left">
                      <ArrowLeft className={`w-4 h-4 inline ${isSel ? 'text-blue-500' : 'text-gray-300'}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                    <div key={e.department_id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-green-50">
                      <span className="text-sm text-gray-800">{e.department_name}</span>
                      <span className="text-sm font-bold text-green-700">{formatCurrency(e.amount)}</span>
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
                    <div key={e.department_id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-red-50">
                      <span className="text-sm text-gray-800">{e.department_name}</span>
                      <span className="text-sm font-bold text-red-700">{formatCurrency(e.amount)}</span>
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
