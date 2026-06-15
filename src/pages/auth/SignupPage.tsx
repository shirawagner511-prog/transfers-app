import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChefHat, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  full_name: z.string().min(2, 'יש להזין שם מלא'),
  email: z.string().email('כתובת מייל לא תקינה'),
  password: z.string().min(6, 'סיסמה חייבת להכיל לפחות 6 תווים'),
});

type FormData = z.infer<typeof schema>;

export function SignupPage() {
  const { signUp } = useAuth();
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setServerError('');
    try {
      await signUp(data.email, data.password, data.full_name);
      // If email confirmation is off, useAuth picks up the session and the
      // app redirects automatically. Otherwise show the confirmation note.
      setDone(true);
    } catch {
      setServerError('לא ניתן להירשם. ייתכן שכתובת המייל אינה מורשית או שכבר קיים חשבון.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">מערכת ניהול</h1>
          <p className="text-gray-500 text-sm mt-1">העברות פנימיות ומלאי</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {done ? (
            <div className="text-center py-4">
              <div className="inline-flex p-3 bg-green-50 rounded-2xl text-green-600 mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">החשבון נוצר!</h2>
              <p className="text-gray-500 text-sm mb-6">
                אם נדרש אישור מייל — בדוק/י את תיבת הדואר. אחרת המערכת תכניס אותך אוטומטית.
              </p>
              <Link to="/login">
                <Button className="w-full" size="lg">לכניסה למערכת</Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">הרשמה למערכת</h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="שם מלא"
                  placeholder="שם המנהל/ת"
                  error={errors.full_name?.message}
                  autoComplete="name"
                  {...register('full_name')}
                />
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
                  autoComplete="new-password"
                  dir="ltr"
                  {...register('password')}
                />

                {serverError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {serverError}
                  </div>
                )}

                <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
                  הרשמה
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                כבר רשום/ה?{' '}
                <Link to="/login" className="text-blue-600 font-medium hover:underline">כניסה</Link>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          הרשמה מותרת למנהלי המחלקות המורשים בלבד
        </p>
      </div>
    </div>
  );
}
