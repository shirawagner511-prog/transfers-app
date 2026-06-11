export type UserRole = 'admin' | 'manager' | 'editor' | 'viewer';

export type TransferStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'reconciled'
  | 'cancelled';

export type OrderStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  current_price: number;
  supplier_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  supplier?: Supplier;
}

export interface IngredientPriceHistory {
  id: string;
  ingredient_id: string;
  old_price: number;
  new_price: number;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
  ingredient?: Ingredient;
  changer?: UserProfile;
}

export interface Product {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  selling_price: number;
  internal_transfer_price: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  product_ingredients?: ProductIngredient[];
}

export interface ProductIngredient {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  waste_percentage: number;
  created_at: string;
  updated_at: string;
  ingredient?: Ingredient;
}

export interface InternalTransfer {
  id: string;
  transfer_number: string;
  from_department_id: string;
  to_department_id: string;
  status: TransferStatus;
  transfer_date: string;
  transfer_time: string | null;
  total_value: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reconciled_at: string | null;
  settlement_id: string | null;
  created_at: string;
  updated_at: string;
  from_department?: Department;
  to_department?: Department;
  transfer_items?: TransferItem[];
  creator?: UserProfile;
  approver?: UserProfile;
}

export interface SettlementSnapshotRow {
  department_id: string;
  department_name: string;
  owed_to: number;
  owes: number;
  net: number;
}

export interface SettlementSnapshot {
  from?: string | null; // previous settlement timestamp this close covered from
  summary?: SettlementSnapshotRow[]; // global settlement: all balances at close time
  pair?: { aName: string; bName: string; amount: number }; // pair settlement
}

export interface Settlement {
  id: string;
  settled_at: string;
  settled_by: string | null;
  department_a: string | null; // null = global settlement
  department_b: string | null;
  amount: number | null;
  note: string | null;
  snapshot: SettlementSnapshot | null;
  created_at: string;
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  product_id: string | null;
  ingredient_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  unit: string;
  unit_price_snapshot: number;
  total_price_snapshot: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
  ingredient?: Ingredient;
}

export interface Order {
  id: string;
  name: string;
  customer_name: string | null;
  event_date: string | null;
  status: OrderStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  creator?: UserProfile;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  custom_price: number | null;
  price_snapshot: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface DailySummary {
  date: string;
  total_transfers: number;
  total_value: number;
  department_breakdown: DepartmentBreakdown[];
  timeline: TransferTimelineItem[];
  pending_approvals: number;
  draft_count: number;
  rejected_count: number;
}

export interface DepartmentBreakdown {
  from_department_id: string;
  from_department_name: string;
  to_department_id: string;
  to_department_name: string;
  transfer_count: number;
  total_value: number;
}

export interface TransferTimelineItem {
  id: string;
  transfer_number: string;
  transfer_time: string | null;
  from_department_name: string;
  to_department_name: string;
  status: TransferStatus;
  total_value: number;
  item_summary: string;
  item_count: number;
}
