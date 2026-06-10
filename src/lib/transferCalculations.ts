import type { TransferItem, DepartmentBreakdown, InternalTransfer } from '@/types/database.types';

export function transferItemTotal(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

export function transferTotal(items: TransferItem[]): number {
  return items.reduce((sum, item) => sum + item.total_price_snapshot, 0);
}

export function departmentBreakdown(transfers: InternalTransfer[]): DepartmentBreakdown[] {
  const map = new Map<string, DepartmentBreakdown>();

  for (const t of transfers) {
    const key = `${t.from_department_id}-${t.to_department_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.transfer_count += 1;
      existing.total_value += t.total_value;
    } else {
      map.set(key, {
        from_department_id: t.from_department_id,
        from_department_name: t.from_department?.name ?? '',
        to_department_id: t.to_department_id,
        to_department_name: t.to_department?.name ?? '',
        transfer_count: 1,
        total_value: t.total_value,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total_value - a.total_value);
}

export function dailyTotalValue(transfers: InternalTransfer[]): number {
  return transfers.reduce((sum, t) => sum + t.total_value, 0);
}
