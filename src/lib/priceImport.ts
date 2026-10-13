import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Same logic as supabase/prices_import.sql, run from the app so nobody has to
// copy a huge SQL file. Safe to run again: unchanged items are skipped.
//   • item with the same name exists → price updated (+ price history)
//   • new item                       → created with price, supplier, category
//   • supplier missing               → created
//   • dish (products) with the same name → its cost price updated

type Row = [name: string, price: number, unit: string, supplier: string, category: string, date: string];

export interface ImportResult { added: number; updated: number; unchanged: number; suppliersAdded: number }

const key = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const fmtDate = (iso: string) => iso.split('-').reverse().join('/');

async function inChunks<T>(list: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size));
}

export async function importPriceList(userId: string | undefined, onProgress?: (msg: string) => void): Promise<ImportResult> {
  const rows = (await import('@/data/priceList.json')).default as unknown as Row[];

  onProgress?.('טוען נתונים קיימים…');
  const [suppliers, ingredients, products] = await Promise.all([
    fetchAll<{ id: string; name: string }>((f, t) => supabase.from('suppliers').select('id,name').order('created_at').order('id').range(f, t)),
    fetchAll<{ id: string; name: string; current_price: number; supplier_id: string | null; category: string | null }>((f, t) =>
      supabase.from('ingredients').select('id,name,current_price,supplier_id,category').order('id').range(f, t)),
    fetchAll<{ id: string; name: string; internal_transfer_price: number }>((f, t) =>
      supabase.from('products').select('id,name,internal_transfer_price').order('id').range(f, t)),
  ]);

  // 1) suppliers
  const supplierId = new Map<string, string>();
  for (const s of suppliers) if (!supplierId.has(key(s.name))) supplierId.set(key(s.name), s.id);
  const newSuppliers = Array.from(new Set(rows.map(r => r[3]).filter(n => n && !supplierId.has(key(n)))));
  if (newSuppliers.length) {
    onProgress?.(`מוסיף ${newSuppliers.length} ספקים…`);
    const { data, error } = await supabase.from('suppliers').insert(newSuppliers.map(name => ({ name }))).select('id,name');
    if (error) throw error;
    for (const s of data ?? []) supplierId.set(key(s.name), s.id);
  }

  // 2) split into new / changed / unchanged
  const byName = new Map<string, typeof ingredients>();
  for (const i of ingredients) byName.set(key(i.name), [...(byName.get(key(i.name)) ?? []), i]);

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; old: number; row: Row; supplier_id: string | null; category: string | null }[] = [];
  let unchanged = 0;
  for (const row of rows) {
    const [name, price, unit, supplier, category, date] = row;
    const existing = byName.get(key(name));
    const sid = supplierId.get(key(supplier)) ?? null;
    if (!existing) {
      toInsert.push({
        name, unit, current_price: price, category, supplier_id: sid, is_active: true,
        notes: `מחירון רכש · קנייה אחרונה ${fmtDate(date)}`, created_by: userId, updated_by: userId,
      });
      continue;
    }
    for (const ing of existing) {
      if (Number(ing.current_price) !== price || !ing.supplier_id || !ing.category) {
        toUpdate.push({ id: ing.id, old: Number(ing.current_price), row, supplier_id: ing.supplier_id ?? sid, category: ing.category || category });
      } else unchanged++;
    }
  }

  // 3) insert new items
  let added = 0;
  await inChunks(toInsert, 200, async chunk => {
    onProgress?.(`מוסיף פריטים… ${added}/${toInsert.length}`);
    const { error } = await supabase.from('ingredients').insert(chunk);
    if (error) throw error;
    added += chunk.length;
  });

  // 4) update changed items (+ history)
  let updated = 0;
  await inChunks(toUpdate, 10, async chunk => {
    onProgress?.(`מעדכן מחירים… ${updated}/${toUpdate.length}`);
    await Promise.all(chunk.map(async u => {
      const [, price, , , , date] = u.row;
      if (u.old !== price) {
        const { error: hErr } = await supabase.from('ingredient_price_history').insert({
          ingredient_id: u.id, old_price: u.old, new_price: price, changed_by: userId,
          note: `עדכון ממחירון רכש (קנייה אחרונה ${fmtDate(date)})`,
        });
        if (hErr) throw hErr;
      }
      const { error } = await supabase.from('ingredients')
        .update({ current_price: price, supplier_id: u.supplier_id, category: u.category, updated_by: userId })
        .eq('id', u.id);
      if (error) throw error;
    }));
    updated += chunk.length;
  });

  // 5) dishes with exactly the same name
  const priceByName = new Map(rows.map(r => [key(r[0]), r[1]]));
  const productUpdates = products.filter(p => priceByName.has(key(p.name)) && Number(p.internal_transfer_price) !== priceByName.get(key(p.name)));
  for (const p of productUpdates) {
    const { error } = await supabase.from('products')
      .update({ internal_transfer_price: priceByName.get(key(p.name)), updated_by: userId }).eq('id', p.id);
    if (error) throw error;
  }

  return { added, updated: updated + productUpdates.length, unchanged, suppliersAdded: newSuppliers.length };
}
