import { supabase } from '@/lib/supabase';
import type { Settlement } from '@/types/database.types';
import type { PairSettlement } from '@/lib/balanceCalculations';

/**
 * Partial pair settlements that still count toward the open balance — i.e. those
 * created after the most recent global settlement (which resets everything). Each
 * row stores the creditor (department_a), debtor (department_b) and settled amount.
 */
export async function fetchActivePartialSettlements(): Promise<PairSettlement[]> {
  const { data: lastGlobal } = await supabase
    .from('settlements')
    .select('settled_at')
    .is('department_a', null)
    .order('settled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase.from('settlements').select('*').eq('is_partial', true);
  if (lastGlobal?.settled_at) query = query.gt('settled_at', lastGlobal.settled_at);

  const { data, error } = await query;
  if (error) throw error;

  return (data as Settlement[])
    .filter(s => s.snapshot?.pair && s.amount != null && s.department_a && s.department_b)
    .map(s => ({
      creditor_id: s.department_a!,
      creditor_name: s.snapshot!.pair!.aName,
      debtor_id: s.department_b!,
      debtor_name: s.snapshot!.pair!.bName,
      amount: Number(s.amount),
    }));
}
