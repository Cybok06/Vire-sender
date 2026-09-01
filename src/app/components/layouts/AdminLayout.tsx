import { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router';
import {
  MessageSquare, LayoutDashboard, FileText, Users, Tag,
  Settings, CreditCard, LogOut, Menu, X, Bell, Shield,
  Send, Mail, Megaphone, BookOpen, ScrollText, Wallet,
  Plug, BarChart2, Hash, Code2, AlertTriangle, LifeBuoy, Globe, Lock, ShoppingCart
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useComplaints } from '../../contexts/ComplaintsContext';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { adminUnreadCount } = useComplaints();
  const { services } = useServiceAvailability();
  const lockedCount = services.filter(s => !s.isEnabled).length;

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'A';

  const sidebarSections = [
    {
      label: 'Overview',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard',         path: '/admin/dashboard',        badge: false },
        { icon: Users,           label: 'Users',             path: '/admin/users',            badge: false },
      ],
    },
    {
      label: 'OTP System',
      items: [
        { icon: Hash,            label: 'OTP Orders',        path: '/admin/orders',           badge: false },
        { icon: ScrollText,      label: 'SMS-MAN Requests',  path: '/admin/smsman-requests',  badge: false },
      ],
    },
    {
      label: 'Messaging',
      items: [
        { icon: Send,            label: 'SMS Management',    path: '/admin/sms',              badge: false },
        { icon: MessageSquare,   label: 'SMS Packages',      path: '/admin/sms-packages',     badge: false },
        { icon: Mail,            label: 'Email Management',  path: '/admin/email',            badge: false },
        { icon: Megaphone,       label: 'Campaigns',         path: '/admin/campaigns',        badge: false },
        { icon: ShoppingCart,    label: 'Contact Marketplace', path: '/admin/contact-marketplace', badge: false },
      ],
    },
    {
      label: 'Content & Logs',
      items: [
        { icon: BookOpen,        label: 'Contacts',          path: '/admin/contacts',         badge: false },
        { icon: FileText,        label: 'Templates',         path: '/admin/templates',        badge: false },
        { icon: ScrollText,      label: 'Message Logs',      path: '/admin/logs',             badge: false },
        { icon: LifeBuoy,        label: 'Complaints',        path: '/admin/complaints',       badge: true  },
        { icon: Globe,           label: 'Embed Widgets',     path: '/admin/embed-widgets',    badge: false },
      ],
    },
    {
      label: 'Finance & Config',
      items: [
        { icon: Wallet,          label: 'Wallet & Billing',    path: '/admin/billing',          badge: false },
        { icon: Plug,            label: 'Provider Settings',   path: '/admin/provider-settings',badge: false },
        { icon: Code2,           label: 'API Management',      path: '/admin/api-management',   badge: false },
        { icon: AlertTriangle,   label: 'Abuse Monitor',       path: '/admin/abuse',            badge: false },
        { icon: BarChart2,       label: 'Reports',             path: '/admin/reports',          badge: false },
        { icon: Globe,           label: 'Analytics / Cookies', path: '/admin/cookie-analytics', badge: false },
        { icon: Tag,             label: 'Pricing',             path: '/admin/pricing',          badge: false },
        { icon: CreditCard,      label: 'System Settings',     path: '/admin/payment-settings', badge: false },
        { icon: Lock,            label: 'Service Control',     path: '/admin/service-control',  badge: 'lock' },
      ],
    },
  ];

  return (
    <div className="flex h-dvh w-full max-w-full bg-gray-50 overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-blue-950 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-blue-900">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
              alt="VireSend icon"
              style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <img
                src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
                alt="VireSend"
                style={{ height: 22, width: 'auto', objectFit: 'contain', display: 'block', marginBottom: 3 }}
              />
              <div className="text-blue-400 text-xs" style={{ fontWeight: 500, letterSpacing: '0.05em' }}>Admin Panel</div>
            </div>
          </Link>
          <button className="lg:hidden text-blue-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin badge */}
        <div className="mx-4 my-3 bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 text-xs" style={{ fontWeight: 600 }}>Administrator Access</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {sidebarSections.map(section => (
            <div key={section.label} className="mb-1">
              <div className="text-blue-500 text-[10px] px-3 py-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>
                {section.label}
              </div>
              {section.items.map(({ icon: Icon, label, path, badge }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                      isActive ? 'bg-blue-600 text-white shadow-md' : 'text-blue-200 hover:bg-blue-900 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                      <span className="flex-1">{label}</span>
                      {/* Complaint badge */}
                      {badge && adminUnreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center" style={{ fontWeight: 700 }}>
                          {adminUnreadCount}
                        </span>
                      )}
                      {/* Service Control badge */}
                      {badge === 'lock' && lockedCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center" style={{ fontWeight: 700 }}>
                          Lock
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-blue-900 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm" style={{ fontWeight: 600 }}>{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm truncate" style={{ fontWeight: 500 }}>{user?.name}</div>
              <div className="text-blue-400 text-xs truncate">{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-blue-400 hover:bg-red-500/20 hover:text-red-300 transition-all text-sm">
            <LogOut className="w-4 h-4" />Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-full flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center justify-between flex-shrink-0">
          <button className="lg:hidden text-gray-500 hover:text-gray-700" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            {/* Complaints bell */}
            {adminUnreadCount > 0 && (
              <Link to="/admin/complaints" className="relative p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                <LifeBuoy className="w-5 h-5" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center" style={{ fontWeight: 700 }}>
                  {adminUnreadCount}
                </span>
              </Link>
            )}
            <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-xs" style={{ fontWeight: 600 }}>{initials}</span>
              </div>
              <div className="hidden sm:block">
                <div className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{user?.name?.split(' ')[0]}</div>
                <div className="text-xs text-amber-600">Administrator</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden"><Outlet /></main>
      </div>
    </div>
  );
}

export default AdminLayout;
