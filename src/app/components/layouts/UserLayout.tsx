import {
  useState, useEffect, useRef, useLayoutEffect, useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router';
import {
  LayoutDashboard, Hash, Wallet, Settings, LogOut, Menu, X,
  ChevronRight, Bell, Megaphone, Users, Mail, ScrollText,
  FileText, Code2, LifeBuoy, Inbox, ChevronDown,
  User, Shield, HelpCircle, Globe, Lock,
  MessageSquare, CreditCard, BellRing,
  CheckCheck, Info, ShoppingCart, ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOtpSession } from '../../contexts/OtpSessionContext';
import { useComplaints } from '../../contexts/ComplaintsContext';
import { useServiceAvailability, ServiceKey } from '../../contexts/ServiceAvailabilityContext';
import { useNotifications, AppNotification, NotificationType } from '../../contexts/NotificationsContext';
import { formatCurrency } from '../../utils/currency';
import AiAssistantBubble from '../assistant/AiAssistantBubble';
import { getSmsPackages } from '../../../lib/api.js';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const DEEP_NAVY = '#06142B';
const DARK_NAVY = '#0B1F3F';
const PRIMARY   = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const CYAN      = '#0EA5E9';

// ─── Animation keyframes (injected once) ───────────────────────��─────────────
const ANIM_CSS = `
@keyframes vs-dropdown-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes vs-sheet-in {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0);    }
}
.vs-dropdown-anim { animation: vs-dropdown-in 0.18s cubic-bezier(.22,.68,0,1.2) forwards; }
.vs-sheet-anim    { animation: vs-sheet-in    0.22s cubic-bezier(.22,.68,0,1.2) forwards; }
`;
let animInjected = false;
function injectAnim() {
  if (animInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = ANIM_CSS;
  document.head.appendChild(s);
  animInjected = true;
}

// ─── Notification helpers ─────────────────────────────────────────────────────
const NOTIF_META: Record<NotificationType, {
  icon: React.ElementType; color: string; bg: string;
}> = {
  sms:       { icon: MessageSquare,  color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  email:     { icon: Mail,           color: '#6366f1', bg: 'rgba(99,102,241,0.1)'  },
  wallet:    { icon: CreditCard,     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  api:       { icon: Code2,          color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  contacts:  { icon: Users,          color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)'  },
  templates: { icon: FileText,       color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
  support:   { icon: LifeBuoy,       color: '#f97316', bg: 'rgba(249,115,22,0.1)'  },
  system:    { icon: Info,           color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Portal dropdown wrapper ──────────────────────────────────────────────────
function PortalDropdown({
  anchorRef, dropRef, open, width, align = 'right', children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  dropRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  width: number;
  align?: 'right' | 'left';
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState({ top: 0, right: 0, left: 0 });
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const MARGIN = 8;
    const right = Math.max(MARGIN, window.innerWidth - rect.right);
    const left = Math.max(MARGIN, rect.left);
    setPos({ top: rect.bottom + 6, right, left });
  }, [open, anchorRef]);

  if (!open) return null;

  // Mobile: bottom sheet
  if (isMobile) {
    return createPortal(
      <div
        ref={dropRef as React.RefObject<HTMLDivElement>}
        className="vs-sheet-anim"
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          zIndex: 99999,
          background: 'white',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '8px 0 32px',
        }}
      >
        {/* Sheet handle */}
        <div className="flex justify-center pt-2 pb-3">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
        </div>
        {children}
      </div>,
      document.body
    );
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    width,
    zIndex: 99999,
    ...(align === 'right' ? { right: pos.right } : { left: pos.left }),
  };

  return createPortal(
    <div
      ref={dropRef as React.RefObject<HTMLDivElement>}
      className="vs-dropdown-anim"
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}

// ─── Profile Dropdown content ─────────────────────────────────────────────────
function ProfileDropdownContent({
  user, initials, onNavigate, onLogout,
}: {
  user: any; initials: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  const links = [
    { icon: User,       label: 'My Profile', path: '/user/profile'  },
    { icon: Wallet,     label: 'Wallet',      path: '/user/wallet'   },
    { icon: Settings,   label: 'Settings',    path: '/user/profile'  },
    { icon: LifeBuoy,   label: 'Support',     path: '/user/support'  },
  ];

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 100%)`,
          padding: '18px 20px 16px',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
              border: '2px solid rgba(255,255,255,0.15)',
            }}
          >
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/5734950d-93f7-412b-e89a-da4e265c1b00/public"
              alt="avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div className="min-w-0">
            <div style={{ color: 'white', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>
        </div>

        {/* Balance mini card */}
        <div
          style={{
            marginTop: 12,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 500, marginBottom: 2 }}>Wallet Balance</div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>
              {formatCurrency(user?.balance)}
            </div>
          </div>
          <button
            onClick={() => onNavigate('/user/wallet')}
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
              border: 'none', borderRadius: 8, padding: '6px 12px',
              color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            Top Up <ChevronRight size={10} />
          </button>
        </div>
      </div>

      {/* Nav links */}
      <div style={{ padding: '6px 8px' }}>
        {links.map(({ icon: Icon, label, path }) => (
          <button
            key={label}
            onClick={() => onNavigate(path)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 12, border: 'none',
              background: 'transparent', cursor: 'pointer', textAlign: 'left',
              color: '#374151', fontSize: 13, fontWeight: 500,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={14} style={{ color: PRIMARY }} />
            </div>
            {label}
          </button>
        ))}
      </div>

      {/* Sign out */}
      <div style={{ padding: '0 8px 8px', borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>
        <button
          onClick={onLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 12, border: 'none',
            background: 'transparent', cursor: 'pointer', textAlign: 'left',
            color: '#ef4444', fontSize: 13, fontWeight: 600,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LogOut size={14} style={{ color: '#ef4444' }} />
          </div>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── Notification Dropdown content ───────────────────────────────────────────
function NotificationDropdownContent({
  notifications, onMarkAllRead, onMarkRead, onNavigate,
}: {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const unread = notifications.filter(n => !n.is_read).length;
  const recent = notifications.slice(0, 8);

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 18px 12px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div className="flex items-center gap-2">
          <BellRing size={16} style={{ color: PRIMARY }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Notifications</span>
          {unread > 0 && (
            <span style={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
              color: 'white', borderRadius: 20, padding: '1px 7px',
              fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: 'center',
            }}>
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer',
              color: PRIMARY, fontSize: 11, fontWeight: 600, padding: '4px 8px',
              borderRadius: 8, transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <CheckCheck size={13} /> Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 380, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {recent.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No notifications yet
          </div>
        ) : (
          recent.map(notif => {
            const meta = NOTIF_META[notif.type] || NOTIF_META.system;
            const Icon = meta.icon;
            return (
              <div
                key={notif.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 16px',
                  background: notif.is_read ? 'transparent' : 'rgba(37,99,235,0.03)',
                  borderBottom: '1px solid #f8fafc',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onClick={() => !notif.is_read && onMarkRead(notif.id)}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                onMouseLeave={e => (e.currentTarget.style.background = notif.is_read ? 'transparent' : 'rgba(37,99,235,0.03)')}
              >
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: meta.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 2,
                }}>
                  <Icon size={16} style={{ color: meta.color }} />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: notif.is_read ? 500 : 700,
                    color: notif.is_read ? '#374151' : '#0f172a',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {notif.title}
                  </div>
                  <div style={{
                    fontSize: 11, color: '#64748b', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {notif.message}
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    {timeAgo(notif.created_at)}
                  </div>
                </div>

                {/* Unread dot */}
                {!notif.is_read && (
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: PRIMARY, flexShrink: 0, marginTop: 6,
                  }} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
        <button
          onClick={() => onNavigate('/user/notifications')}
          style={{
            width: '100%', padding: '9px', borderRadius: 12, border: 'none',
            background: '#f8faff', cursor: 'pointer', color: PRIMARY,
            fontSize: 12, fontWeight: 700, transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
          onMouseLeave={e => (e.currentTarget.style.background = '#f8faff')}
        >
          View all notifications <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Top Header ───────────────────────────────────────────────────────────────
function TopHeader({
  onMenuClick, user, initials, balance,
}: {
  onMenuClick: () => void; user: any; initials: string; balance: number;
}) {
  injectAnim();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const location = useLocation();
  const [headerSmsBalance, setHeaderSmsBalance] = useState(0);
  useEffect(() => { getSmsPackages().then((result:any) => setHeaderSmsBalance(result.sms_balance || 0)).catch(() => {}); }, [location.pathname]);

  const [profileOpen, setProfileOpen]  = useState(false);
  const [notifOpen,   setNotifOpen]    = useState(false);

  const profileBtnRef  = useRef<HTMLButtonElement>(null);
  const profileDropRef = useRef<HTMLDivElement>(null);
  const notifBtnRef    = useRef<HTMLButtonElement>(null);
  const notifDropRef   = useRef<HTMLDivElement>(null);

  // Click-outside for both portals
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        profileOpen &&
        profileBtnRef.current && !profileBtnRef.current.contains(t) &&
        profileDropRef.current && !profileDropRef.current.contains(t)
      ) setProfileOpen(false);

      if (
        notifOpen &&
        notifBtnRef.current && !notifBtnRef.current.contains(t) &&
        notifDropRef.current && !notifDropRef.current.contains(t)
      ) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen, notifOpen]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setProfileOpen(false); setNotifOpen(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = useCallback(() => {
    logout(); navigate('/login');
  }, [logout, navigate]);

  const handleNavigate = useCallback((path: string) => {
    setProfileOpen(false); setNotifOpen(false); navigate(path);
  }, [navigate]);

  const toggleProfile = () => { setNotifOpen(false); setProfileOpen(p => !p); };
  const toggleNotif   = () => { setProfileOpen(false); setNotifOpen(p => !p); };

  return (
    <>
      <header
        className="flex items-center px-4 lg:px-6 py-3.5 flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 12px rgba(0,0,0,0.04)',
          position: 'relative', zIndex: 10,
        }}
      >
        {/* Hamburger */}
        <button
          className="lg:hidden p-2 rounded-xl transition-colors hover:bg-slate-100 mr-2"
          style={{ color: '#64748b' }}
          onClick={onMenuClick}
        >
          <Menu size={20} />
        </button>

        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-1.5">
          {/* Wallet pill */}
          <Link
            to="/user/wallet"
            className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all hover:opacity-90"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
              boxShadow: `0 4px 12px rgba(37,99,235,0.3)`,
            }}
          >
            <Wallet size={14} className="text-white" />
            <span className="text-white text-sm" style={{ fontWeight: 700 }}>
              {formatCurrency(balance)}
            </span>
          </Link>

          <Link to="/user/sms-packages" className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-50 text-cyan-800 border border-cyan-100">
            <MessageSquare size={14}/><span className="text-sm font-bold">SMS: {headerSmsBalance.toLocaleString()}</span>
          </Link>

          {/* ── Notification bell ── */}
          <button
            ref={notifBtnRef}
            onClick={toggleNotif}
            className="relative p-2.5 rounded-xl transition-all"
            style={{
              color: notifOpen ? PRIMARY : '#64748b',
              background: notifOpen ? '#eff6ff' : 'transparent',
            }}
            onMouseEnter={e => { if (!notifOpen) e.currentTarget.style.background = '#f1f5f9'; }}
            onMouseLeave={e => { if (!notifOpen) e.currentTarget.style.background = 'transparent'; }}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute', top: 5, right: 5,
                  minWidth: unreadCount > 9 ? 18 : 16,
                  height: 16, borderRadius: 8,
                  background: '#ef4444',
                  color: 'white', fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                  boxShadow: '0 1px 4px rgba(239,68,68,0.5)',
                  border: '1.5px solid white',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* ── Profile button ── */}
          <button
            ref={profileBtnRef}
            onClick={toggleProfile}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all"
            style={{
              background: profileOpen ? '#eff6ff' : 'transparent',
              border: profileOpen ? `1px solid rgba(37,99,235,0.2)` : '1px solid transparent',
            }}
            onMouseEnter={e => { if (!profileOpen) e.currentTarget.style.background = '#f1f5f9'; }}
            onMouseLeave={e => { if (!profileOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <div
              style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                border: '2px solid rgba(37,99,235,0.25)',
              }}
            >
              <img
                src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/5734950d-93f7-412b-e89a-da4e265c1b00/public"
                alt="avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <span className="hidden sm:block text-sm" style={{ color: '#0f172a', fontWeight: 600 }}>
              {user?.name?.split(' ')[0]}
            </span>
            <ChevronDown
              size={13}
              style={{
                color: '#94a3b8',
                transition: 'transform 0.2s',
                transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>
      </header>

      {/* ── Profile Portal ── */}
      <PortalDropdown anchorRef={profileBtnRef} dropRef={profileDropRef} open={profileOpen} width={300}>
        <ProfileDropdownContent
          user={user}
          initials={initials}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      </PortalDropdown>

      {/* ── Notification Portal ── */}
      <PortalDropdown anchorRef={notifBtnRef} dropRef={notifDropRef} open={notifOpen} width={360}>
        <NotificationDropdownContent
          notifications={notifications}
          onMarkAllRead={markAllAsRead}
          onMarkRead={markAsRead}
          onNavigate={handleNavigate}
        />
      </PortalDropdown>
    </>
  );
}

// ─── Sidebar nav structure ────────────────────────────────────────────────────
const sidebarSections = [
  {
    label: 'Main',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',       path: '/user/dashboard',      badge: null      },
      { icon: Wallet,          label: 'Wallet',          path: '/user/wallet',          badge: null      },
    ],
  },
  {
    label: 'OTP System',
    items: [
      { icon: Hash,            label: 'OTP & Numbers',   path: '/user/buy-number',      badge: 'otp'     },
      { icon: ClipboardList,   label: 'OTP Receives',    path: '/user/otp-receives',   badge: 'otp'     },
    ],
  },
  {
    label: 'Messaging',
    items: [
      {
        icon: MessageSquare,
        label: 'SMS',
        badge: null,
        children: [
          { icon: MessageSquare, label: 'Send SMS',      path: '/user/send-sms',       badge: null },
          { icon: CreditCard,    label: 'Recharge SMS',  path: '/user/sms-packages',   badge: null },
          { icon: Shield,        label: 'Sender IDs',    path: '/user/sender-ids',     badge: null },
          { icon: Megaphone,     label: 'SMS Campaigns', path: '/user/sms-campaigns', badge: null },
        ],
      },
      {
        icon: Mail,
        label: 'Email',
        badge: null,
        children: [
          { icon: Mail,  label: 'Send Email',       path: '/user/email-sender',    badge: null },
          { icon: ClipboardList, label: 'Copy & Paste Mode', path: '/user/email/copy-paste-mode', badge: null },
          { icon: Mail,  label: 'Email Accounts',    path: '/user/email-accounts',  badge: null },
          { icon: ScrollText, label: 'Message Logs', path: '/user/email-message-logs', badge: null },
          { icon: Inbox, label: 'Email Campaigns',  path: '/user/email-campaigns', badge: null },
        ],
      },
      { icon: Users,           label: 'Contacts',        path: '/user/contacts',        badge: null      },
      { icon: ShoppingCart,    label: 'Buy Contacts',    path: '/user/contact-marketplace', badge: null  },
      { icon: FileText,        label: 'Templates',       path: '/user/templates',       badge: null      },
    ],
  },
  {
    label: 'Developer',
    items: [
      { icon: Code2,           label: 'API Access',      path: '/user/api-access',      badge: 'dev'     },
      { icon: ScrollText,      label: 'Logs',            path: '/user/logs',            badge: null      },
      { icon: Globe,           label: 'Embed Widgets',   path: '/user/embed-widgets',   badge: null      },
    ],
  },
  {
    label: 'Account',
    items: [
      { icon: Bell,            label: 'Notifications',   path: '/user/notifications',   badge: 'notif'   },
      { icon: LifeBuoy,        label: 'Support',         path: '/user/support',         badge: 'support' },
      { icon: Settings,        label: 'Settings',        path: '/user/profile',         badge: null      },
    ],
  },
];

// ─── Map sidebar paths → service keys ────────────────────────────────────────
const PATH_SERVICE_MAP: Record<string, ServiceKey> = {
  '/user/buy-number':      'otp_virtual_numbers',
  '/user/otp-receives':    'otp_virtual_numbers',
  '/user/otp-session':     'otp_virtual_numbers',
  '/user/send-sms':        'sms_sender',
  '/user/sender-ids':      'sms_sender',
  '/user/sms-campaigns':   'sms_campaigns',
  '/user/email-sender':    'email_sender',
  '/user/email/copy-paste-mode': 'email_sender',
  '/user/email-campaigns': 'email_campaigns',
  '/user/email-message-logs': 'email_sender',
  '/user/api-access':      'developer_api',
  '/user/embed-widgets':   'embed_widgets',
  '/user/contact-marketplace': 'buy_contacts',
  '/user/wallet':          'wallet_topup',
  '/user/templates':       'templates',
  '/user/support':         'complaints_support',
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({
  open, onClose, user, otpStatus, myOpenTickets, initials, onLogout,
}: {
  open: boolean; onClose: () => void; user: any; otpStatus: string;
  myOpenTickets: number; initials: string; onLogout: () => void;
}) {
  const { isEnabled } = useServiceAvailability();
  const { unreadCount } = useNotifications();
  const location = useLocation();
  const [smsBalance, setSmsBalance] = useState(0);
  useEffect(() => { getSmsPackages().then((result:any) => setSmsBalance(result.sms_balance || 0)).catch(() => {}); }, [location.pathname]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    SMS: location.pathname.startsWith('/user/send-sms') || location.pathname.startsWith('/user/sms-campaigns'),
    Email: location.pathname.startsWith('/user/email-sender') || location.pathname.startsWith('/user/email/copy-paste-mode') || location.pathname.startsWith('/user/email-campaigns') || location.pathname.startsWith('/user/email-accounts') || location.pathname.startsWith('/user/email-message-logs'),
  });

  const renderNavLink = ({ icon: Icon, label, path, badge, compact = false }: any) => {
    const serviceKey = PATH_SERVICE_MAP[path];
    const isLocked = serviceKey ? !isEnabled(serviceKey) : false;

    return (
      <NavLink
        key={path}
        to={path}
        onClick={onClose}
        className={({ isActive }) =>
          `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm mb-0.5 transition-all group ${
            compact ? 'ml-4' : ''
          } ${
            isActive
              ? 'text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`
        }
        style={({ isActive }) => isActive ? {
          background: isLocked
            ? `linear-gradient(135deg, #7f1d1d, #991b1b)`
            : `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
          boxShadow: isLocked
            ? `0 4px 16px rgba(239,68,68,0.3)`
            : `0 4px 16px rgba(37,99,235,0.35)`,
        } : {}}
      >
        {({ isActive }) => (
          <>
            <Icon
              size={compact ? 13 : 15}
              className="flex-shrink-0 transition-transform group-hover:scale-110"
              style={{ color: isActive ? 'white' : isLocked ? '#f87171' : CYAN }}
            />
            <span className="flex-1 text-sm" style={{ fontWeight: isActive ? 600 : 400 }}>
              {label}
            </span>

            {isLocked && (
              <span
                className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontWeight: 700 }}
                title="Service unavailable"
              >
                <Lock size={8} />
              </span>
            )}

            {!isLocked && badge === 'otp' && otpStatus !== 'idle' && (
              <span className="relative flex items-center justify-center w-2.5 h-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${otpStatus === 'received' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${otpStatus === 'received' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </span>
            )}

            {badge === 'notif' && unreadCount > 0 && (
              <span
                style={{
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: '#ef4444', color: 'white',
                  fontSize: 9, fontWeight: 800, padding: '0 4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}

            {badge === 'support' && myOpenTickets > 0 && (
              <span
                className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px]"
                style={{ background: '#f59e0b', color: DEEP_NAVY, fontWeight: 800 }}
              >
                {myOpenTickets}
              </span>
            )}

            {!isLocked && badge === 'dev' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.15)', color: CYAN, fontWeight: 600 }}>
                DEV
              </span>
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      style={{
        width: 252,
        background: `linear-gradient(180deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 100%)`,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 py-5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <Link to="/user/dashboard" className="flex items-center gap-3" onClick={onClose}>
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
            alt="VireSend icon"
            style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
              alt="VireSend"
              style={{ height: 22, width: 'auto', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </Link>
        <button
          className="lg:hidden text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      {/* Wallet balance */}
      <Link
        to="/user/wallet"
        onClick={onClose}
        className="mx-4 mt-4 mb-1 p-3.5 rounded-2xl flex items-center justify-between group transition-all hover:scale-[1.01]"
        style={{
          background: `linear-gradient(135deg, rgba(37,99,235,0.25), rgba(14,165,233,0.15))`,
          border: '1px solid rgba(37,99,235,0.3)',
        }}
      >
        <div>
          <div className="text-[10px] mb-1" style={{ color: '#94a3b8', fontWeight: 500 }}>Wallet Balance</div>
          <div className="text-white text-lg" style={{ fontWeight: 800 }}>
            {formatCurrency(user?.balance)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Wallet size={16} style={{ color: CYAN }} />
          <div className="flex items-center gap-1 text-[10px]" style={{ color: CYAN, fontWeight: 600 }}>
            Top up <ChevronRight size={10} />
          </div>
        </div>
      </Link>

      <Link
        to="/user/sms-packages"
        onClick={onClose}
        className="mx-4 mt-2 mb-1 p-3 rounded-2xl flex items-center justify-between transition-all hover:scale-[1.01]"
        style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.24)' }}
      >
        <div><div className="text-[10px] text-slate-400 mb-1">SMS Balance</div><div className="text-white text-lg font-extrabold">{smsBalance.toLocaleString()} <span className="text-[10px] text-slate-400">SMS</span></div></div>
        <div className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1">Recharge <ChevronRight size={10}/></div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {sidebarSections.map(section => (
          <div key={section.label} className="mb-2">
            <div
              className="px-3 py-2 text-[9px] uppercase tracking-widest"
              style={{ color: '#334155', fontWeight: 700 }}
            >
              {section.label}
            </div>
            {section.items.map((item: any) => {
              if (item.children) {
                const isOpen = !!openGroups[item.label];
                const isActiveGroup = item.children.some((child: any) => location.pathname.startsWith(child.path));
                const Icon = item.icon;

                return (
                  <div key={item.label} className="mb-0.5">
                    <button
                      onClick={() => setOpenGroups(prev => ({ ...prev, [item.label]: !prev[item.label] }))}
                      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm mb-0.5 transition-all group w-full ${
                        isActiveGroup ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                      style={isActiveGroup ? {
                        background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
                        boxShadow: `0 4px 16px rgba(37,99,235,0.35)`,
                      } : {}}
                    >
                      <Icon size={15} className="flex-shrink-0 transition-transform group-hover:scale-110" style={{ color: isActiveGroup ? 'white' : CYAN }} />
                      <span className="flex-1 text-left text-sm" style={{ fontWeight: isActiveGroup ? 600 : 400 }}>{item.label}</span>
                      <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </button>
                    {isOpen && (
                      <div className="mt-1 mb-1">
                        {item.children.map((child: any) => renderNavLink({ ...child, compact: true }))}
                      </div>
                    )}
                  </div>
                );
              }

              return renderNavLink(item);
            })}
          </div>
        ))}
      </nav>

      {/* User profile footer */}
      <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 mb-3 p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className="w-9 h-9 rounded-xl flex-shrink-0"
            style={{ overflow: 'hidden', border: '2px solid rgba(255,255,255,0.12)' }}
          >
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/5734950d-93f7-412b-e89a-da4e265c1b00/public"
              alt="avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm truncate" style={{ fontWeight: 600 }}>{user?.name}</div>
            <div className="text-[10px] truncate" style={{ color: '#64748b' }}>{user?.email}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-red-500/15"
          style={{ color: '#64748b' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
        >
          <LogOut size={14} />
          <span style={{ fontWeight: 500 }}>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Layout root ──────────────────────────────────────────────────────────────
export default function UserLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { otpStatus } = useOtpSession();
  const { tickets } = useComplaints();

  const myOpenTickets = tickets.filter(t => t.status === 'waiting_user' || t.status === 'in_review').length;

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div
      className="flex h-dvh w-full max-w-full overflow-hidden"
      style={{ background: '#f1f5f9', fontFamily: "'Poppins', 'Inter', sans-serif" }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(6,20,43,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        otpStatus={otpStatus}
        myOpenTickets={myOpenTickets}
        initials={initials}
        onLogout={handleLogout}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopHeader
          onMenuClick={() => setSidebarOpen(true)}
          user={user}
          initials={initials}
          balance={user?.balance || 0}
        />
        <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <AiAssistantBubble />
    </div>
  );
}
