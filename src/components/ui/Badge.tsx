import type { ReactNode } from 'react';
import type { TransferStatus, OrderStatus, UserRole } from '@/types/database.types';

type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
};

export function Badge({ variant = 'gray', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const map: Record<TransferStatus, { label: string; variant: BadgeVariant }> = {
    draft: { label: 'טיוטה', variant: 'gray' },
    pending_approval: { label: 'ממתין לאישור', variant: 'yellow' },
    approved: { label: 'אושר', variant: 'blue' },
    rejected: { label: 'נדחה', variant: 'red' },
    completed: { label: 'הושלם', variant: 'green' },
    reconciled: { label: 'גויס', variant: 'purple' },
    cancelled: { label: 'בוטל', variant: 'orange' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
    draft: { label: 'טיוטה', variant: 'gray' },
    confirmed: { label: 'מאושר', variant: 'blue' },
    in_progress: { label: 'בביצוע', variant: 'yellow' },
    completed: { label: 'הושלם', variant: 'green' },
    cancelled: { label: 'בוטל', variant: 'red' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, { label: string; variant: BadgeVariant }> = {
    admin: { label: 'מנהל מערכת', variant: 'purple' },
    manager: { label: 'מנהל', variant: 'blue' },
    editor: { label: 'עורך', variant: 'green' },
    viewer: { label: 'צופה', variant: 'gray' },
  };
  const { label, variant } = map[role] ?? { label: role, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}
