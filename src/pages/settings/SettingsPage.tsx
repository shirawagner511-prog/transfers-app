import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UserProfile, UserRole } from '@/types/database.types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { RoleBadge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime } from '@/lib/dateUtils';

async function fetchUsers() {
  const { data, error } = await supabase.from('user_profiles').select('*').order('full_name');
  if (error) throw error;
  return data as UserProfile[];
}

export function SettingsPage() {
  const { canManageUsers } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({ queryKey: ['user-profiles'], queryFn: fetchUsers });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { error } = await supabase.from('user_profiles').update({ role }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      toast.success('ההרשאה עודכנה');
    },
    onError: () => toast.error('שגיאה בעדכון ההרשאה'),
  });

  if (!canManageUsers()) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-500">אין לך הרשאות לגשת לדף זה.</p>
      </div>
    );
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="הגדרות" subtitle="ניהול משתמשים והרשאות" />

      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-4">משתמשי המערכת</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם מלא</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הרשאה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך הצטרפות</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שינוי הרשאה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={u.role}
                      onChange={e => updateRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                      className="w-36 text-sm"
                    >
                      <option value="admin">מנהל מערכת</option>
                      <option value="manager">מנהל</option>
                      <option value="editor">עורך</option>
                      <option value="viewer">צופה</option>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
