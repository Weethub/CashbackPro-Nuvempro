import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import {
  LayoutDashboard,
  Store,
  CreditCard,
  Receipt,
  Tag,
  DollarSign,
  FileText,
  HelpCircle,
  Activity,
  Shield,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-400' },
  { to: '/customers', label: 'Lojas', icon: Store, color: 'text-emerald-400' },
  { to: '/plans', label: 'Planos', icon: CreditCard, color: 'text-violet-400' },
  { to: '/subscriptions', label: 'Assinaturas', icon: Receipt, color: 'text-sky-400' },
  { to: '/coupons', label: 'Cupons', icon: Tag, color: 'text-amber-400' },
  { to: '/commissions', label: 'Comissoes', icon: DollarSign, color: 'text-green-400' },
  { to: '/terms', label: 'Termos', icon: FileText, color: 'text-orange-400' },
  { to: '/faq', label: 'FAQ', icon: HelpCircle, color: 'text-pink-400' },
  { to: '/logs', label: 'Logs', icon: Activity, color: 'text-red-400' },
  { to: '/security', label: 'Seguranca', icon: Shield, color: 'text-indigo-400' },
  { to: '/settings', label: 'Configuracoes', icon: Settings, color: 'text-slate-400' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col sidebar-transition z-50"
      style={{ width: collapsed ? '5rem' : '16rem' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold tracking-wide">NuvemPro</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
              }`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className={item.color} />
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-3">
        {!collapsed && admin?.email && (
          <p className="text-xs text-slate-400 truncate mb-2 px-1">{admin.email}</p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut size={20} />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
