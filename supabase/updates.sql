-- ============================================================
-- TRANSFERS APP — POST-MIGRATION UPDATES  (safe to re-run)
-- Run in Supabase Dashboard > SQL Editor.
-- Covers: user-profile trigger fix, permanent-delete permissions,
-- and the settlement (קיזוז) feature — per-pair and global.
-- ============================================================

-- 1) Harden the auto-profile trigger (fixes "Database error creating new user")
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (user_id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email, 'משתמש חדש'), 'viewer')
  on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 2) Permanent-delete permissions (for "מחק לצמיתות")
drop policy if exists "products_delete" on products;
create policy "products_delete" on products for delete to authenticated using (current_user_role() in ('admin','manager'));
drop policy if exists "departments_delete" on departments;
create policy "departments_delete" on departments for delete to authenticated using (current_user_role() in ('admin','manager'));
drop policy if exists "suppliers_delete" on suppliers;
create policy "suppliers_delete" on suppliers for delete to authenticated using (current_user_role() in ('admin','manager'));
drop policy if exists "ingredients_delete" on ingredients;
create policy "ingredients_delete" on ingredients for delete to authenticated using (current_user_role() in ('admin','manager'));

-- 3) Settlement / קיזוז  (per-pair and global)
create table if not exists settlements (
  id           uuid primary key default uuid_generate_v4(),
  settled_at   timestamptz not null default now(),
  settled_by   uuid references auth.users(id) on delete set null,
  department_a uuid references departments(id) on delete set null,  -- null = global
  department_b uuid references departments(id) on delete set null,  -- null = global
  amount       numeric(12,2),
  note         text,
  snapshot     jsonb,
  created_at   timestamptz not null default now()
);
-- (safety if the table already existed without these columns)
alter table settlements add column if not exists department_a uuid references departments(id) on delete set null;
alter table settlements add column if not exists department_b uuid references departments(id) on delete set null;
alter table settlements add column if not exists amount numeric(12,2);

alter table internal_transfers add column if not exists settlement_id uuid references settlements(id) on delete set null;
create index if not exists idx_transfers_settlement on internal_transfers(settlement_id);

alter table settlements enable row level security;
drop policy if exists "settlements_select" on settlements;
create policy "settlements_select" on settlements for select to authenticated using (true);
drop policy if exists "settlements_insert" on settlements;
create policy "settlements_insert" on settlements for insert to authenticated with check (true);

-- Global settlement: clears every open balance at once
create or replace function perform_settlement(p_note text, p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into settlements (settled_by, note, snapshot)
  values (auth.uid(), p_note, p_snapshot)
  returning id into new_id;
  update internal_transfers set settlement_id = new_id
   where settlement_id is null and status not in ('rejected','cancelled');
  return new_id;
end; $$;
grant execute on function perform_settlement(text, jsonb) to authenticated;

-- Pair settlement: clears the open balance between two departments only
create or replace function settle_pair(p_dept_a uuid, p_dept_b uuid, p_amount numeric, p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into settlements (settled_by, department_a, department_b, amount, snapshot)
  values (auth.uid(), p_dept_a, p_dept_b, p_amount, p_snapshot)
  returning id into new_id;
  update internal_transfers set settlement_id = new_id
   where settlement_id is null
     and status not in ('rejected','cancelled')
     and ((from_department_id = p_dept_a and to_department_id = p_dept_b)
       or (from_department_id = p_dept_b and to_department_id = p_dept_a));
  return new_id;
end; $$;
grant execute on function settle_pair(uuid, uuid, numeric, jsonb) to authenticated;
