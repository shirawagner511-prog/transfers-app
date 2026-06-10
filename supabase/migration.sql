-- ============================================================
-- TRANSFERS APP — FULL DATABASE MIGRATION
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Departments
create table if not exists departments (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Suppliers
create table if not exists suppliers (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- User profiles (linked to auth.users)
create table if not exists user_profiles (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  full_name     text not null,
  role          text not null default 'viewer' check (role in ('admin','manager','editor','viewer')),
  department_id uuid references departments(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

-- Ingredients
create table if not exists ingredients (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  category      text,
  unit          text not null,
  current_price numeric(12,4) not null default 0,
  supplier_id   uuid references suppliers(id) on delete set null,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null
);

-- Ingredient price history
create table if not exists ingredient_price_history (
  id            uuid primary key default uuid_generate_v4(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  old_price     numeric(12,4) not null,
  new_price     numeric(12,4) not null,
  changed_by    uuid references auth.users(id) on delete set null,
  changed_at    timestamptz not null default now(),
  note          text
);

-- Products
create table if not exists products (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null,
  category                text,
  description             text,
  selling_price           numeric(12,4) not null default 0,
  internal_transfer_price numeric(12,4) not null default 0,
  notes                   text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null,
  updated_by              uuid references auth.users(id) on delete set null
);

-- Product ingredients (recipe)
create table if not exists product_ingredients (
  id             uuid primary key default uuid_generate_v4(),
  product_id     uuid not null references products(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete restrict,
  quantity       numeric(12,4) not null,
  unit           text not null,
  waste_percentage numeric(5,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Internal transfers
create table if not exists internal_transfers (
  id                 uuid primary key default uuid_generate_v4(),
  transfer_number    text not null unique,
  from_department_id uuid not null references departments(id) on delete restrict,
  to_department_id   uuid not null references departments(id) on delete restrict,
  status             text not null default 'draft'
                     check (status in ('draft','pending_approval','approved','rejected','completed','reconciled','cancelled')),
  transfer_date      date not null default current_date,
  transfer_time      time,
  total_value        numeric(12,2) not null default 0,
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  approved_by        uuid references auth.users(id) on delete set null,
  approved_at        timestamptz,
  reconciled_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Internal transfer items
create table if not exists internal_transfer_items (
  id                   uuid primary key default uuid_generate_v4(),
  transfer_id          uuid not null references internal_transfers(id) on delete cascade,
  product_id           uuid references products(id) on delete set null,
  ingredient_id        uuid references ingredients(id) on delete set null,
  item_name_snapshot   text not null,
  quantity             numeric(12,4) not null,
  unit                 text not null,
  unit_price_snapshot  numeric(12,4) not null,
  total_price_snapshot numeric(12,4) not null,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (product_id is not null or ingredient_id is not null)
);

-- Orders / Events
create table if not exists orders (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  customer_name text,
  event_date    date,
  status        text not null default 'draft'
                check (status in ('draft','confirmed','in_progress','completed','cancelled')),
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Order items
create table if not exists order_items (
  id             uuid primary key default uuid_generate_v4(),
  order_id       uuid not null references orders(id) on delete cascade,
  product_id     uuid not null references products(id) on delete restrict,
  quantity       numeric(12,4) not null,
  custom_price   numeric(12,4),
  price_snapshot numeric(12,4) not null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_internal_transfers_date on internal_transfers(transfer_date);
create index if not exists idx_internal_transfers_status on internal_transfers(status);
create index if not exists idx_internal_transfers_from_dept on internal_transfers(from_department_id);
create index if not exists idx_internal_transfers_to_dept on internal_transfers(to_department_id);
create index if not exists idx_transfer_items_transfer on internal_transfer_items(transfer_id);
create index if not exists idx_price_history_ingredient on ingredient_price_history(ingredient_id);
create index if not exists idx_user_profiles_user_id on user_profiles(user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare
  t text;
begin
  for t in select unnest(array[
    'departments','suppliers','user_profiles','ingredients',
    'products','product_ingredients','internal_transfers',
    'internal_transfer_items','orders','order_items'
  ]) loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I for each row execute function handle_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN UP
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (user_id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'משתמש חדש'),
    'viewer'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table departments             enable row level security;
alter table suppliers               enable row level security;
alter table user_profiles           enable row level security;
alter table ingredients             enable row level security;
alter table ingredient_price_history enable row level security;
alter table products                enable row level security;
alter table product_ingredients     enable row level security;
alter table internal_transfers      enable row level security;
alter table internal_transfer_items enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;

-- Helper: get current user's role
create or replace function current_user_role()
returns text language sql security definer as $$
  select role from user_profiles where user_id = auth.uid()
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- DEPARTMENTS: everyone can read, editors+ can write
drop policy if exists "departments_select" on departments;
create policy "departments_select" on departments for select to authenticated using (true);

drop policy if exists "departments_insert" on departments;
create policy "departments_insert" on departments for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "departments_update" on departments;
create policy "departments_update" on departments for update to authenticated
  using (current_user_role() in ('admin','manager','editor'));

-- SUPPLIERS: everyone can read, editors+ can write
drop policy if exists "suppliers_select" on suppliers;
create policy "suppliers_select" on suppliers for select to authenticated using (true);

drop policy if exists "suppliers_insert" on suppliers;
create policy "suppliers_insert" on suppliers for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "suppliers_update" on suppliers;
create policy "suppliers_update" on suppliers for update to authenticated
  using (current_user_role() in ('admin','manager','editor'));

-- USER PROFILES: users can see their own, admins see all
drop policy if exists "profiles_select_own" on user_profiles;
create policy "profiles_select_own" on user_profiles for select to authenticated
  using (user_id = auth.uid() or current_user_role() in ('admin','manager'));

drop policy if exists "profiles_update_admin" on user_profiles;
create policy "profiles_update_admin" on user_profiles for update to authenticated
  using (current_user_role() = 'admin');

drop policy if exists "profiles_insert_trigger" on user_profiles;
create policy "profiles_insert_trigger" on user_profiles for insert to authenticated
  with check (user_id = auth.uid() or current_user_role() = 'admin');

-- INGREDIENTS: everyone can read, editors+ can write
drop policy if exists "ingredients_select" on ingredients;
create policy "ingredients_select" on ingredients for select to authenticated using (true);

drop policy if exists "ingredients_insert" on ingredients;
create policy "ingredients_insert" on ingredients for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "ingredients_update" on ingredients;
create policy "ingredients_update" on ingredients for update to authenticated
  using (current_user_role() in ('admin','manager','editor'));

-- INGREDIENT PRICE HISTORY: everyone can read, editors+ can insert
drop policy if exists "price_history_select" on ingredient_price_history;
create policy "price_history_select" on ingredient_price_history for select to authenticated using (true);

drop policy if exists "price_history_insert" on ingredient_price_history;
create policy "price_history_insert" on ingredient_price_history for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

-- PRODUCTS: everyone can read, editors+ can write
drop policy if exists "products_select" on products;
create policy "products_select" on products for select to authenticated using (true);

drop policy if exists "products_insert" on products;
create policy "products_insert" on products for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "products_update" on products;
create policy "products_update" on products for update to authenticated
  using (current_user_role() in ('admin','manager','editor'));

-- PRODUCT INGREDIENTS: everyone can read, editors+ can write
drop policy if exists "product_ingredients_select" on product_ingredients;
create policy "product_ingredients_select" on product_ingredients for select to authenticated using (true);

drop policy if exists "product_ingredients_insert" on product_ingredients;
create policy "product_ingredients_insert" on product_ingredients for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "product_ingredients_update" on product_ingredients;
create policy "product_ingredients_update" on product_ingredients for update to authenticated
  using (current_user_role() in ('admin','manager','editor'));

drop policy if exists "product_ingredients_delete" on product_ingredients;
create policy "product_ingredients_delete" on product_ingredients for delete to authenticated
  using (current_user_role() in ('admin','manager','editor'));

-- INTERNAL TRANSFERS: everyone can read, editors+ can create, managers+ can approve
drop policy if exists "transfers_select" on internal_transfers;
create policy "transfers_select" on internal_transfers for select to authenticated using (true);

drop policy if exists "transfers_insert" on internal_transfers;
create policy "transfers_insert" on internal_transfers for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "transfers_update" on internal_transfers;
create policy "transfers_update" on internal_transfers for update to authenticated
  using (
    current_user_role() in ('admin','manager','editor')
    or (
      current_user_role() in ('admin','manager')
      and status in ('pending_approval','approved','completed')
    )
  );

-- TRANSFER ITEMS: everyone can read, editors+ can write
drop policy if exists "transfer_items_select" on internal_transfer_items;
create policy "transfer_items_select" on internal_transfer_items for select to authenticated using (true);

drop policy if exists "transfer_items_insert" on internal_transfer_items;
create policy "transfer_items_insert" on internal_transfer_items for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

-- ORDERS: everyone can read, editors+ can write
drop policy if exists "orders_select" on orders;
create policy "orders_select" on orders for select to authenticated using (true);

drop policy if exists "orders_insert" on orders;
create policy "orders_insert" on orders for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

drop policy if exists "orders_update" on orders;
create policy "orders_update" on orders for update to authenticated
  using (current_user_role() in ('admin','manager','editor'));

-- ORDER ITEMS: everyone can read, editors+ can write
drop policy if exists "order_items_select" on order_items;
create policy "order_items_select" on order_items for select to authenticated using (true);

drop policy if exists "order_items_insert" on order_items;
create policy "order_items_insert" on order_items for insert to authenticated
  with check (current_user_role() in ('admin','manager','editor'));

-- ============================================================
-- SEED DATA
-- ============================================================

-- Departments
insert into departments (name, description, is_active) values
  ('מטבח',       'מטבח ראשי',                        true),
  ('בר',          'בר משקאות ואלכוהול',               true),
  ('אירועים',    'מחלקת אירועים וקייטרינג',           true),
  ('בר בריאות',  'בר מיצים ושייקים',                  true),
  ('מחסן',       'מחסן מרכזי',                        true),
  ('הנהלה',      'הנהלה ומשרד',                       true)
on conflict do nothing;

-- Suppliers
insert into suppliers (name, contact_name, phone, email) values
  ('ירקות טרי בע"מ',    'יוסף כהן',   '050-1234567', 'yosef@yerakot.co.il'),
  ('טוב הבשר',          'מיכאל לוי',  '052-9876543', 'michael@tovhabasar.co.il'),
  ('מאפיית לחם הארץ',   'שרה מזרחי',  '054-5555555', 'sara@lechemhaaretz.co.il'),
  ('משק חלב גן עדן',   'רחל ישראלי', '053-7777777', 'rachel@ganeden.co.il')
on conflict do nothing;

-- Ingredients (using subquery for supplier IDs)
insert into ingredients (name, category, unit, current_price, supplier_id, is_active)
select 'עגבניות', 'ירקות', 'ק"ג', 8.50, id, true from suppliers where name='ירקות טרי בע"מ' limit 1
on conflict do nothing;

insert into ingredients (name, category, unit, current_price, supplier_id, is_active)
select 'מלפפון', 'ירקות', 'ק"ג', 6.00, id, true from suppliers where name='ירקות טרי בע"מ' limit 1
on conflict do nothing;

insert into ingredients (name, category, unit, current_price, supplier_id, is_active)
select 'חזה עוף', 'עוף', 'ק"ג', 45.00, id, true from suppliers where name='טוב הבשר' limit 1
on conflict do nothing;

insert into ingredients (name, category, unit, current_price, supplier_id, is_active)
select 'לחם פרוס', 'לחם ואפייה', 'יחידה', 12.00, id, true from suppliers where name='מאפיית לחם הארץ' limit 1
on conflict do nothing;

insert into ingredients (name, category, unit, current_price, supplier_id, is_active)
select 'גבינה לבנה 5%', 'מוצרי חלב', 'ק"ג', 22.00, id, true from suppliers where name='משק חלב גן עדן' limit 1
on conflict do nothing;

insert into ingredients (name, category, unit, current_price, is_active)
values
  ('שמן זית', 'שמנים', 'ליטר', 35.00, true),
  ('מלח', 'תבלינים', 'ק"ג', 4.00, true),
  ('פלפל שחור', 'תבלינים', 'גרם', 0.12, true),
  ('לימון', 'פירות', 'יחידה', 1.50, true),
  ('בצל', 'ירקות', 'ק"ג', 5.00, true)
on conflict do nothing;

-- Products
insert into products (name, category, selling_price, internal_transfer_price, is_active)
values
  ('סלט עגבניות מלפפון', 'סלט',          35.00,  18.00, true),
  ('חזה עוף צלוי',        'מנה עיקרית',   65.00,  40.00, true),
  ('טוסט גבינה',          'חטיף',         22.00,  12.00, true),
  ('פלטת פירות גדולה',   'חבילה',        180.00, 120.00, true),
  ('מיץ לימון טרי',       'משקה',         18.00,  10.00, true)
on conflict do nothing;
