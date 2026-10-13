import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// The database keeps two tables (ingredients = price list, products = dishes),
// but the app shows them as one list of "פריטים".
export type ItemSource = 'ingredient' | 'product';

export interface Item {
  key: string; // `${source}:${id}` — unique across both tables
  source: ItemSource;
  id: string;
  name: string;
  category: string | null;
  unit: string;
  price: number;
  supplier_id: string | null;
  supplier_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface IngredientRow {
  id: string; name: string; category: string | null; unit: string; current_price: number;
  supplier_id: string | null; supplier: { name: string } | null; notes: string | null;
  is_active: boolean; created_by: string | null; created_at: string; updated_at: string;
}

interface ProductRow {
  id: string; name: string; category: string | null; internal_transfer_price: number;
  notes: string | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string;
}

export async function fetchItems(): Promise<Item[]> {
  const [ingredients, products] = await Promise.all([
    fetchAll<IngredientRow>((from, to) => supabase
      .from('ingredients')
      .select('id,name,category,unit,current_price,supplier_id,supplier:suppliers(name),notes,is_active,created_by,created_at,updated_at')
      .order('name').order('id').range(from, to)),
    fetchAll<ProductRow>((from, to) => supabase
      .from('products')
      .select('id,name,category,internal_transfer_price,notes,is_active,created_by,created_at,updated_at')
      .order('name').order('id').range(from, to)),
  ]);
  const items: Item[] = [
    ...ingredients.map(i => ({
      key: `ingredient:${i.id}`, source: 'ingredient' as const, id: i.id, name: i.name.trim(), category: i.category,
      unit: i.unit, price: Number(i.current_price), supplier_id: i.supplier_id, supplier_name: i.supplier?.name ?? null,
      notes: i.notes, is_active: i.is_active, created_by: i.created_by, created_at: i.created_at, updated_at: i.updated_at,
    })),
    ...products.map(p => ({
      key: `product:${p.id}`, source: 'product' as const, id: p.id, name: p.name.trim(), category: p.category,
      unit: 'יחידה', price: Number(p.internal_transfer_price), supplier_id: null, supplier_name: null,
      notes: p.notes, is_active: p.is_active, created_by: p.created_by, created_at: p.created_at, updated_at: p.updated_at,
    })),
  ];
  return items.sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function useItems(enabled = true) {
  // The list is big — refresh every few minutes (and on focus) instead of every 20s.
  return useQuery({ queryKey: ['items'], queryFn: fetchItems, enabled, refetchInterval: 5 * 60_000 });
}

export const itemSearchText = (i: Item) => `${i.name} ${i.category ?? ''} ${i.supplier_name ?? ''}`;
