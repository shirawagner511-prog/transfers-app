-- ============================================================
-- TRANSFERS APP — POST-MIGRATION UPDATES
-- Run this in Supabase Dashboard > SQL Editor.
-- Safe to run multiple times (idempotent).
-- Covers: user-profile trigger fix, permanent-delete permissions,
-- and the settlement (קיזוז) feature.
-- ============================================================

-- 1) Harden the auto-profile trigger (fixes "Database error creating new user")
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email, 'משתמש חדש'), 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2) Permanent-delete permissions (for "מחק לצמיתות" in the archives)
drop policy if exists "products_delete" on products;
create policy "products_delete" on products for delete to authenticated
  using (current_user_role() in ('admin','manager'));

drop policy if exists "departments_delete" on departments;
create policy "departments_delete" on departments for delete to authenticated
  using (current_user_role() in ('admin','manager'));

drop policy if exists "suppliers_delete" on suppliers;
create policy "suppliers_delete" on suppliers for delete to authenticated
  using (current_user_role() in ('admin','manager'));

drop policy if exists "ingredients_delete" on ingredients;
create policy "ingredients_delete" on ingredients for delete to authenticated
  using (current_user_role() in ('admin','manager'));

-- 3) Settlement / קיזוז feature
create table if not exists settlements (
  id          uuid primary key default uuid_generate_v4(),
  settled_at  timestamptz not null default now(),
  settled_by  uuid references auth.users(id) on delete set null,
  note        text,
  snapshot    jsonb,
  created_at  timestamptz not null default now()
);

alter table internal_transfers add column if not exists settlement_id uuid references settlements(id) on delete set null;
create index if not exists idx_transfers_settlement on internal_transfers(settlement_id);

alter table settlements enable row level security;
drop policy if exists "settlements_select" on settlements;
create policy "settlements_select" on settlements for select to authenticated using (true);
drop policy if exists "settlements_insert" on settlements;
create policy "settlements_insert" on settlements for insert to authenticated with check (true);

create or replace function perform_settlement(p_note text, p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  insert into settlements (settled_by, note, snapshot)
  values (auth.uid(), p_note, p_snapshot)
  returning id into new_id;

  update internal_transfers
     set settlement_id = new_id
   where settlement_id is null
     and status not in ('rejected','cancelled');

  return new_id;
end;
$$;

grant execute on function perform_settlement(text, jsonb) to authenticated;
