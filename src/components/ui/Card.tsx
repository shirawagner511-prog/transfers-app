import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', padding = true, onClick }: CardProps) {
  return (
    <div onClick={onClick} className={`bg-white rounded-xl border border-gray-200 shadow-sm ${padding ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, icon, trend, className = '', onClick }: StatCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer hover:border-teal-300 hover:shadow-md transition-all' : ''} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
