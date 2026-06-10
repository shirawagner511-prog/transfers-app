import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, ArrowLeftRight, Package,
  Wheat, Truck, Building2, ShoppingBag, Settings, LogOut, ChefHat, Scale,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'לוח בקרה', icon: <LayoutDashboard className="w-5 h-5" /> },
  { to: '/daily-summary', label: 'סיכום יומי', icon: <CalendarDays className="w-5 h-5" /> },
  { to: '/transfers', label: 'העברות פנימיות', icon: <ArrowLeftRight className="w-5 h-5" /> },
  { to: '/balances', label: 'מאזן בין מחלקות', icon: <Scale className="w-5 h-5" /> },
  { to: '/ingredients', label: 'מרכיבים', icon: <Wheat className="w-5 h-5" /> },
  { to: '/products', label: 'מוצרים / מנות', icon: <Package className="w-5 h-5" /> },
  { to: '/suppliers', label: 'ספקים', icon: <Truck className="w-5 h-5" /> },
  { to: '/departments', label: 'מחלקות', icon: <Building2 className="w-5 h-5" /> },
  { to: '/orders', label: 'הזמנות / אירועים', icon: <ShoppingBag className="w-5 h-5" /> },
  { to: '/settings', label: 'הגדרות', icon: <Settings className="w-5 h-5" />, adminOnly: true },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white w-64">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-700">
        <div className="p-2 bg-blue-600 rounded-lg">
          <ChefHat className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm text-white">מערכת ניהול</p>
          <p className="text-xs text-gray-400">העברות ומלאי</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems
          .filter(item => !item.adminOnly || profile?.role === 'admin')
          .map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-gray-700">
        {profile && (
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{profile.full_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {{
                admin: 'מנהל מערכת',
                manager: 'מנהל',
                editor: 'עורך',
                viewer: 'צופה',
              }[profile.role]}
            </p>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>התנתקות</span>
        </button>
      </div>
    </div>
  );
}
