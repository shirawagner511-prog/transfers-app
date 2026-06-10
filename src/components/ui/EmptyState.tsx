import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; icon?: ReactNode };
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-gray-300">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-700 mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>}
      {action && (
        <Button onClick={action.onClick} icon={action.icon}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
