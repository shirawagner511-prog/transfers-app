import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChefHat } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  email: z.string().email('כתובת מייל לא תקינה'),
  password: z.string().min(6, 'סיסמה חייבת להכיל לפחות 6 תווים'),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setServerError('');
    try {
      await signIn(data.email, data.password);
    } catch {
      setServerError('מייל או סיסמה שגויים. בדוק את פרטיך ונסה שוב.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600 rounded-2xl mb-4 shadow-lg">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">מערכת ניהול</h1>
          <p className="text-gray-500 text-sm mt-1">העברות פנימיות ומלאי</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">כניסה למערכת</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="כתובת מייל"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              autoComplete="email"
              dir="ltr"
              {...register('email')}
            />
            <Input
              label="סיסמה"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              autoComplete="current-password"
              dir="ltr"
              {...register('password')}
            />

            {serverError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full mt-2"
              size="lg"
            >
              כניסה
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            אין לך חשבון?{' '}
            <Link to="/signup" className="text-teal-600 font-medium hover:underline">הרשמה</Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          גישה למורשים בלבד · לפרטים פנה למנהל המערכת
        </p>
      </div>
    </div>
  );
}
