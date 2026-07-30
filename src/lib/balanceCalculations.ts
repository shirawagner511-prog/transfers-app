import type { InternalTransfer } from '@/types/database.types';

// Transfers in these statuses are void and do not create a debt.
const EXCLUDED_STATUSES = new Set(['rejected', 'cancelled']);

export interface DepartmentBalanceRow {
  department_id: string;
  department_name: string;
  owed_to: number; // how much others owe this department
  owes: number; // how much this department owes others
  net: number; // owed_to - owes  (positive = net creditor)
}

export interface BalanceEntry {
  department_id: string;
  department_name: string;
  amount: number;
}

export interface DepartmentDetail {
  owesYou: BalanceEntry[]; // counterparts that owe this department (net)
  youOwe: BalanceEntry[]; // counterparts this department owes (net)
}

export interface BalanceResult {
  summary: DepartmentBalanceRow[];
  details: Record<string, DepartmentDetail>;
}

/**
 * Turn a list of transfers into net inter-department balances.
 * Rule: the receiving department (to_department) owes the sending department
 * (from_department) the transfer value. Balances between any two departments
 * are netted against each other.
 */
export function computeBalances(transfers: InternalTransfer[]): BalanceResult {
  const names = new Map<string, string>();
  // gross[creditorId][debtorId] = total value the debtor owes the creditor
  const gross = new Map<string, Map<string, number>>();

  for (const t of transfers) {
    if (EXCLUDED_STATUSES.has(t.status)) continue;
    const creditor = t.from_department_id;
    const debtor = t.to_department_id;
    if (!creditor || !debtor || creditor === debtor) continue;

    names.set(creditor, t.from_department?.name ?? '—');
    names.set(debtor, t.to_department?.name ?? '—');

    if (!gross.has(creditor)) gross.set(creditor, new Map());
    const inner = gross.get(creditor)!;
    inner.set(debtor, (inner.get(debtor) ?? 0) + t.total_value);
  }

  const deptIds = Array.from(names.keys());
  const details: Record<string, DepartmentDetail> = {};
  const summary: DepartmentBalanceRow[] = [];

  for (const a of deptIds) {
    let owedTo = 0;
    let owes = 0;
    const owesYou: BalanceEntry[] = [];
    const youOwe: BalanceEntry[] = [];

    for (const b of deptIds) {
      if (a === b) continue;
      const bOwesA = gross.get(a)?.get(b) ?? 0; // a sent to b → b owes a
      const aOwesB = gross.get(b)?.get(a) ?? 0; // b sent to a → a owes b
      const net = bOwesA - aOwesB;
      if (net > 0) {
        owedTo += net;
        owesYou.push({ department_id: b, department_name: names.get(b)!, amount: net });
      } else if (net < 0) {
        owes += -net;
        youOwe.push({ department_id: b, department_name: names.get(b)!, amount: -net });
      }
    }

    owesYou.sort((x, y) => y.amount - x.amount);
    youOwe.sort((x, y) => y.amount - x.amount);
    details[a] = { owesYou, youOwe };
    summary.push({
      department_id: a,
      department_name: names.get(a)!,
      owed_to: owedTo,
      owes,
      net: owedTo - owes,
    });
  }

  summary.sort((x, y) => y.net - x.net);
  return { summary, details };
}

export interface PairSettlement {
  creditor_id: string;
  creditor_name: string;
  debtor_id: string;
  debtor_name: string;
  amount: number;
}

/**
 * Turn partial settlements into synthetic "repayment" transfers (debtor → creditor).
 * Feeding these alongside the real open transfers into computeBalances / pairwiseDebts
 * nets the debtor's open debt down by the settled amount, without touching any real
 * transfer record. A full settlement is simply a repayment equal to the whole debt.
 */
export function settlementTransfers(settlements: PairSettlement[]): InternalTransfer[] {
  return settlements.map(s => ({
    status: 'approved',
    from_department_id: s.debtor_id,
    to_department_id: s.creditor_id,
    from_department: { id: s.debtor_id, name: s.debtor_name },
    to_department: { id: s.creditor_id, name: s.creditor_name },
    total_value: s.amount,
  }) as unknown as InternalTransfer);
}

export interface PairDebt {
  debtorId: string;
  debtorName: string;
  creditorId: string;
  creditorName: string;
  amount: number;
}

/**
 * Flat list of net debts between department pairs (each pair once),
 * for showing a "קזז" action next to every debt.
 */
export function pairwiseDebts(transfers: InternalTransfer[]): PairDebt[] {
  const names = new Map<string, string>();
  const gross = new Map<string, Map<string, number>>();

  for (const t of transfers) {
    if (EXCLUDED_STATUSES.has(t.status)) continue;
    const creditor = t.from_department_id;
    const debtor = t.to_department_id;
    if (!creditor || !debtor || creditor === debtor) continue;
    names.set(creditor, t.from_department?.name ?? '—');
    names.set(debtor, t.to_department?.name ?? '—');
    if (!gross.has(creditor)) gross.set(creditor, new Map());
    const inner = gross.get(creditor)!;
    inner.set(debtor, (inner.get(debtor) ?? 0) + t.total_value);
  }

  const ids = Array.from(names.keys());
  const debts: PairDebt[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const bOwesA = gross.get(a)?.get(b) ?? 0;
      const aOwesB = gross.get(b)?.get(a) ?? 0;
      const net = bOwesA - aOwesB;
      if (net > 0) {
        debts.push({ debtorId: b, debtorName: names.get(b)!, creditorId: a, creditorName: names.get(a)!, amount: net });
      } else if (net < 0) {
        debts.push({ debtorId: a, debtorName: names.get(a)!, creditorId: b, creditorName: names.get(b)!, amount: -net });
      }
    }
  }

  return debts.sort((x, y) => y.amount - x.amount);
}
