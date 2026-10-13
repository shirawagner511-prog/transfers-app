import type { PostgrestError } from '@supabase/supabase-js';

// Supabase caps every response (1000 rows by default, sometimes less), and the
// price list is bigger than that. Keep asking for the next slice until an empty
// one comes back, so whatever the server's cap is, nothing gets cut off.
// Callers must add a unique tiebreaker to the order (e.g. .order('id')) so
// rows don't shift between pages.
const PAGE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const from = all.length;
    const { data, error } = await page(from, from + PAGE - 1);
    // Asking past the last row can come back as "range not satisfiable"
    // instead of an empty list — that just means we have everything.
    if (error && from > 0 && (error.code === 'PGRST103' || /range/i.test(error.message))) return all;
    if (error) throw error;
    if (!data || data.length === 0) return all;
    all.push(...(data as T[]));
  }
}
