import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/ui/Toast';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { DailySummaryPage } from './pages/daily-summary/DailySummaryPage';
import { TransfersPage } from './pages/transfers/TransfersPage';
import { IngredientsPage } from './pages/ingredients/IngredientsPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { DepartmentsPage } from './pages/departments/DepartmentsPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { BalancesPage } from './pages/balances/BalancesPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { PageSpinner } from './components/ui/Spinner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><PageSpinner /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppLayout>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/daily-summary" element={<DailySummaryPage />} />
                <Route path="/transfers" element={<TransfersPage />} />
                <Route path="/ingredients" element={<IngredientsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/departments" element={<DepartmentsPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/balances" element={<BalancesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </AuthGuard>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
