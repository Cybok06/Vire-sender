import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Bell, BellRing, CheckCheck, Trash2, ExternalLink,
  MessageSquare, Mail, CreditCard, Code2, Users, FileText,
  LifeBuoy, Info, Search, CheckCircle2, Circle, Hash,
} from 'lucide-react';
import {
  useNotifications,
  AppNotification,
  NotificationType,
} from '../../contexts/NotificationsContext';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const PRIMARY   = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const DEEP_NAVY = '#06142B';

// ─── Notification meta ────────────────────────────────────────────────────────
const NOTIF_META: Record<NotificationType, {
  icon: React.ElementType; color: string; bg: string; label: string;
}> = {
  sms:       { icon: MessageSquare,  color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: 'SMS'        },
  email:     { icon: Mail,           color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  label: 'Email'      },
  wallet:    { icon: CreditCard,     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'Wallet'     },
  api:       { icon: Code2,          color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  label: 'API'        },
  contacts:  { icon: Users,          color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)',  label: 'Contacts'   },
  templates: { icon: FileText,       color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  label: 'Templates'  },
  otp:       { icon: Hash,           color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: 'OTP Numbers' },
  system:    { icon: Info,           color: '#64748b', bg: 'rgba(100,116,139,0.1)', label: 'System'     },
  support:   { icon: LifeBuoy,       color: '#f97316', bg: 'rgba(249,115,22,0.1)',  label: 'Support'    },
};

const FILTERS: { key: NotificationType | 'all'; label: string }[] = [
  { key: 'all',       label: 'All'        },
  { key: 'sms',       label: 'SMS'        },
  { key: 'email',     label: 'Email'      },
  { key: 'wallet',    label: 'Wallet'     },
  { key: 'api',       label: 'API'        },
  { key: 'contacts',  label: 'Contacts'   },
  { key: 'templates', label: 'Templates'  },
  { key: 'otp',       label: 'OTP Numbers' },
  { key: 'system',    label: 'System'     },
  { key: 'support',   label: 'Support'    },
];

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Related link map ─────────────────────────────────────────────────────────
function getRelatedPath(type: NotificationType, relatedId?: string): string | null {
  if (!relatedId) return null;
  const map: Record<NotificationType, string> = {
    sms:       '/user/sms-campaigns',
    email:     '/user/email-sender',
    wallet:    '/user/wallet',
    api:       '/user/api-access',
    contacts:  '/user/contacts',
    templates: '/user/templates',
    otp:       '/user/otp-receives',
    support:   '/user/support',
    system:    '/user/dashboard',
  };
  return map[type] || null;
}

// ─── Row component ────────────────────────────────────────────────────────────
function NotifRow({
  notif, onMarkRead, onDelete, onViewRelated,
}: {
  notif: AppNotification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onViewRelated: (path: string) => void;
}) {
  const meta = NOTIF_META[notif.type] || NOTIF_META.system;
  const Icon = meta.icon;
  const relatedPath = notif.action_url || getRelatedPath(notif.type, notif.related_id);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px',
        background: notif.is_read ? 'white' : 'rgba(37,99,235,0.025)',
        borderBottom: '1px solid #f1f5f9',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = notif.is_read ? '#fafbff' : 'rgba(37,99,235,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = notif.is_read ? 'white' : 'rgba(37,99,235,0.025)')}
    >
      {/* Unread indicator */}
      <div style={{ width: 8, flexShrink: 0 }}>
        {!notif.is_read && (
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: PRIMARY, boxShadow: '0 0 6px rgba(37,99,235,0.4)',
          }} />
        )}
      </div>

      {/* Type icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: meta.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} style={{ color: meta.color }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, fontWeight: notif.is_read ? 500 : 700,
            color: notif.is_read ? '#374151' : '#0f172a',
          }}>
            {notif.title}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '1px 7px',
            borderRadius: 20, background: meta.bg, color: meta.color,
          }}>
            {NOTIF_META[notif.type].label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
          {notif.message}
        </div>
      </div>

      {/* Status */}
      <div className="hidden sm:flex" style={{ flexShrink: 0, alignItems: 'center', gap: 6 }}>
        {notif.is_read ? (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: '#94a3b8', fontWeight: 500,
          }}>
            <CheckCircle2 size={12} style={{ color: '#10b981' }} /> Read
          </span>
        ) : (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: PRIMARY, fontWeight: 600,
          }}>
            <Circle size={12} style={{ color: PRIMARY }} /> Unread
          </span>
        )}
      </div>

      {/* Date */}
      <div className="hidden md:block" style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, minWidth: 80, textAlign: 'right' }}>
        {formatDate(notif.created_at)}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {!notif.is_read && (
          <button
            onClick={() => onMarkRead(notif.id)}
            title="Mark as read"
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = PRIMARY; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            <CheckCheck size={14} />
          </button>
        )}
        {relatedPath && (
          <button
            onClick={() => onViewRelated(relatedPath)}
            title="View related"
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = PRIMARY; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            <ExternalLink size={13} />
          </button>
        )}
        <button
          onClick={() => onDelete(notif.id)}
          title="Delete"
          style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94a3b8', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<NotificationType | 'all'>('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'read' | 'unread'>('all');

  const filtered = useMemo(() => {
    let list = notifications;
    if (activeFilter !== 'all') list = list.filter(n => n.type === activeFilter);
    if (statusFilter === 'read')   list = list.filter(n =>  n.is_read);
    if (statusFilter === 'unread') list = list.filter(n => !n.is_read);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q)
      );
    }
    return list;
  }, [notifications, activeFilter, statusFilter, searchQuery]);

  const handleViewRelated = (path: string) => navigate(path);

  return (
    <div style={{ padding: 24, fontFamily: "'Poppins', 'Inter', sans-serif" }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            }}>
              <BellRing size={18} style={{ color: 'white' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, color: '#0f172a', fontSize: 20 }}>Notifications</h1>
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
              color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            }}
          >
            <CheckCheck size={15} /> Mark all as read
          </button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        {[
          { label: 'Total', value: notifications.length, color: '#64748b', bg: '#f8fafc' },
          { label: 'Unread', value: unreadCount, color: PRIMARY, bg: '#eff6ff' },
          { label: 'Read', value: notifications.length - unreadCount, color: '#10b981', bg: '#f0fdf4' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.bg, borderRadius: 14, padding: '14px 18px',
            border: `1px solid ${s.color}20`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Main card ── */}
      <div style={{
        background: 'white', borderRadius: 20,
        boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#f8fafc', borderRadius: 10,
            padding: '8px 12px', flex: '1 1 200px', minWidth: 0,
            border: '1px solid #e2e8f0',
          }}>
            <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: 'none', background: 'transparent', outline: 'none',
                fontSize: 13, color: '#0f172a', flex: 1, minWidth: 0,
              }}
            />
          </div>

          {/* Status filter */}
          <div style={{
            display: 'flex', gap: 4, background: '#f1f5f9',
            borderRadius: 10, padding: 3,
          }}>
            {(['all', 'unread', 'read'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: statusFilter === s ? 'white' : 'transparent',
                  color: statusFilter === s ? PRIMARY : '#64748b',
                  boxShadow: statusFilter === s ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Type filter tabs */}
        <div style={{
          display: 'flex', overflowX: 'auto', padding: '0 20px',
          borderBottom: '1px solid #f1f5f9', scrollbarWidth: 'none',
          gap: 2,
        }}>
          {FILTERS.map(f => {
            const count = f.key === 'all'
              ? notifications.length
              : notifications.filter(n => n.type === f.key).length;
            const isActive = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                style={{
                  padding: '11px 14px', border: 'none', background: 'transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  color: isActive ? PRIMARY : '#64748b',
                  borderBottom: isActive ? `2px solid ${PRIMARY}` : '2px solid transparent',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {f.label}
                {count > 0 && (
                  <span style={{
                    background: isActive ? `rgba(37,99,235,0.1)` : '#f1f5f9',
                    color: isActive ? PRIMARY : '#64748b',
                    borderRadius: 20, padding: '1px 6px',
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
            Loading notifications...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
              background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={24} style={{ color: '#94a3b8' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
              No notifications found
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {searchQuery ? 'Try adjusting your search query.' : 'Check back later for updates.'}
            </div>
          </div>
        ) : (
          filtered.map(notif => (
            <NotifRow
              key={notif.id}
              notif={notif}
              onMarkRead={markAsRead}
              onDelete={deleteNotification}
              onViewRelated={handleViewRelated}
            />
          ))
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fafbff',
          }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Showing {filtered.length} of {notifications.length} notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: PRIMARY, fontSize: 12, fontWeight: 600,
                }}
              >
                <CheckCheck size={13} /> Mark all as read
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

