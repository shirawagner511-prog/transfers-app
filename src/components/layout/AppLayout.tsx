import { useState, type ReactNode } from 'react';
import { Menu, X, Plus, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/hooks/useAuth';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { canEdit } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" dir="rtl">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="תפריט"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button onClick={() => navigate('/dashboard')} className="font-semibold text-gray-900">
            מערכת ניהול
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="לוח בקרה"
          >
            <Home className="w-5 h-5" />
          </button>
        </div>

        {/* Page */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24">
            {children}
          </div>
        </main>
      </div>

      {/* Floating "new transfer" action — always visible */}
      {canEdit() && (
        <button
          onClick={() => navigate('/transfers')}
          className="fixed bottom-5 left-5 z-30 flex items-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold rounded-full shadow-xl shadow-teal-600/30 ps-4 pe-5 py-3.5 transition-all"
          aria-label="העברה חדשה"
        >
          <Plus className="w-5 h-5" />
          <span>העברה חדשה</span>
        </button>
      )}
    </div>
  );
}
