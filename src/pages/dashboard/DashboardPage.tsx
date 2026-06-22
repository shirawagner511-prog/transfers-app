import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Clock, TrendingUp, Building2, CalendarDays, Plus, Scale, Wheat, Package, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, StatCard } from '@/components/ui/Card';
import { TransferStatusBadge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/formatCurrency';
import { todayISO, formatTime } from '@/lib/dateUtils';
import { useAuth } from '@/hooks/useAuth';

async function fetchDashboardData() {
  const today = todayISO();

  const [transfers, departments, ingredients, pendingResult] = await Promise.all([
    supabase.from('internal_transfers').select('*,from_department:departments!from_department_id(name),to_department:departments!to_department_id(name)').eq('transfer_date', today).order('created_at', { ascending: false }),
    supabase.from('departments').select('id').eq('is_active', true),
    supabase.from('ingredients').select('id,current_price,updated_at').eq('is_active', true).order('updated_at', { ascending: false }).limit(5),
    supabase.from('internal_transfers').select('id').eq('status', 'pending_approval'),
  ]);

  return {
    todayTransfers: transfers.data ?? [],
    activeDepts: departments.data?.length ?? 0,
    recentPriceUpdates: ingredients.data ?? [],
    pendingApprovals: pendingResult.data?.length ?? 0,
  };
}

export function DashboardPage() {
  const { profile, canEdit } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData,
    refetchInterval: 30000,
  });

  if (isLoading) return <PageSpinner />;

  const todayTotal = data?.todayTransfers.reduce((s, t) => s + t.total_value, 0) ?? 0;
  const recentTransfers = data?.todayTransfers.slice(0, 5) ?? [];

  const actions = [
    { label: 'העברה חדשה', icon: Plus, to: '/transfers', primary: true, show: canEdit() },
    { label: 'מאזן בין מחלקות', icon: Scale, to: '/balances', show: true },
    { label: 'סיכום יומי', icon: CalendarDays, to: '/daily-summary', show: true },
    { label: 'מרכיבים', icon: Wheat, to: '/ingredients', show: true },
    { label: 'מוצרים', icon: Package, to: '/products', show: true },
    { label: 'ספקים', icon: Truck, to: '/suppliers', show: true },
  ].filter(a => a.show);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          שלום, {profile?.full_name?.split(' ')[0] ?? 'משתמש'} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">לוח הבקרה הראשי</p>
      </div>

      {/* Quick actions — the primary focus */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">פעולות מהירות</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {actions.map(a => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => navigate(a.to)}
                className={`flex flex-col items-center justify-center gap-2.5 rounded-2xl p-6 transition-all ${
                  a.primary
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/25 hover:bg-teal-700'
                    : 'bg-white border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50'
                }`}
              >
                <Icon className={`w-8 h-8 ${a.primary ? 'text-white' : 'text-teal-600'}`} />
                <span className={`font-semibold text-sm ${a.primary ? 'text-white' : 'text-gray-800'}`}>{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats — secondary glance */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">מבט מהיר על היום</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="העברות היום" value={data?.todayTransfers.length ?? 0} icon={<ArrowLeftRight className="w-5 h-5" />} onClick={() => navigate('/daily-summary')} />
          <StatCard label="ממתינות לאישור" value={data?.pendingApprovals ?? 0} icon={<Clock className="w-5 h-5" />} onClick={() => navigate('/transfers')} />
          <StatCard label="ערך היום" value={formatCurrency(todayTotal)} icon={<TrendingUp className="w-5 h-5" />} onClick={() => navigate('/daily-summary')} />
          <StatCard label="מחלקות פעילות" value={data?.activeDepts ?? 0} icon={<Building2 className="w-5 h-5" />} onClick={() => navigate('/departments')} />
        </div>
      </div>

      {/* Recent transfers today */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">העברות היום</h2>
        {recentTransfers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">אין העברות היום</p>
        ) : (
          <div className="space-y-2">
            {recentTransfers.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {t.transfer_time && (
                    <span className="text-xs text-gray-400 font-mono">{formatTime(t.transfer_time)}</span>
                  )}
                  <span className="text-gray-700">
                    {(t as any).from_department?.name} → {(t as any).to_department?.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TransferStatusBadge status={t.status} />
                  <span className="font-semibold">{formatCurrency(t.total_value)}</span>
                </div>
              </div>
            ))}
            {(data?.todayTransfers.length ?? 0) > 5 && (
              <button
                onClick={() => navigate('/daily-summary')}
                className="text-xs text-teal-600 hover:underline mt-1"
              >
                ועוד {(data?.todayTransfers.length ?? 0) - 5} נוספות...
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
