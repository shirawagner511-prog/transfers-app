import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Clock, TrendingUp, Building2, CalendarDays, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          שלום, {profile?.full_name?.split(' ')[0] ?? 'משתמש'} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">לוח הבקרה הראשי</p>
      </div>

      {/* Daily Summary CTA */}
      <div
        className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-5 text-white cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all"
        onClick={() => navigate('/daily-summary')}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm mb-1">סיכום יומי — היום</p>
            <p className="text-3xl font-bold">{data?.todayTransfers.length ?? 0} העברות</p>
            <p className="text-blue-200 text-sm mt-1">ערך כולל: {formatCurrency(todayTotal)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CalendarDays className="w-10 h-10 text-blue-300" />
            <span className="text-xs text-blue-200">לחץ לפרטים →</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="העברות היום"
          value={data?.todayTransfers.length ?? 0}
          icon={<ArrowLeftRight className="w-5 h-5" />}
        />
        <StatCard
          label="ממתינות לאישור"
          value={data?.pendingApprovals ?? 0}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          label="ערך היום"
          value={formatCurrency(todayTotal)}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          label="מחלקות פעילות"
          value={data?.activeDepts ?? 0}
          icon={<Building2 className="w-5 h-5" />}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-3">פעולות מהירות</h2>
          <div className="grid grid-cols-2 gap-2">
            {canEdit() && (
              <Button variant="outline" size="sm" onClick={() => navigate('/transfers')} icon={<Plus className="w-4 h-4" />}>
                העברה חדשה
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/daily-summary')} icon={<CalendarDays className="w-4 h-4" />}>
              סיכום יומי
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/transfers')}>
              כל ההעברות
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/ingredients')}>
              מרכיבים
            </Button>
          </div>
        </Card>

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
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  וועוד {(data?.todayTransfers.length ?? 0) - 5} נוספות...
                </button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
