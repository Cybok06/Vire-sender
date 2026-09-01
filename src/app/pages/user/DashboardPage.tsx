import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Wallet, CheckCircle, XCircle, AlertCircle,
  MessageSquare, Mail, Hash, Code2,
  ArrowUpRight, Activity, ChevronRight, Lock, RefreshCw, Loader2, Copy, Phone
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

import { useAuth } from '../../contexts/AuthContext';
import { getActiveOtpOrders, getUserDashboard } from '../../../lib/api.js';
import { playNotificationSound } from '../../utils/notificationSound';

const PRIMARY = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const CYAN = '#0EA5E9';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const DANGER = '#EF4444';
const NAVY = '#06142B';
const DARK_TEXT = '#0F172A';
const SLATE = '#64748B';
const BG = '#F1F5F9';

type ServiceStatus = {
  status: string;
  unavailable_message?: string;
};

type DashboardActivity = {
  id: string;
  type: 'sms' | 'email' | 'api' | 'wallet';
  recipient: string;
  message: string;
  status: string;
  cost: number;
  currency: string;
  date: string | null;
  direction?: 'credit' | 'debit';
};

type DashboardData = {
  user: { name: string; email: string; initials: string; avatar_url: string };
  wallet: { balance: number; currency: string };
  stats: {
    sms_sent_total: number;
    sms_sent_today: number;
    emails_sent_total: number;
    emails_sent_today: number;
    api_requests_total: number;
    api_requests_today: number;
    otp_orders_total: number;
    otp_orders_today: number;
  };
  rates: {
    sms_delivery_rate: number;
    email_success_rate: number;
    otp_success_rate: number;
  };
  charts: {
    message_analytics: Array<{ date: string; day?: string; sms_count: number; email_count: number; api_count: number }>;
    otp_orders: Array<{ date: string; day?: string; count: number }>;
  };
  services: Record<string, ServiceStatus>;
  recent_activity: DashboardActivity[];
};

type ActiveOtpOrder = {
  id: string;
  service_name: string;
  phone_number: string;
  otp_code: string;
  expires_at: string | null;
  status: string;
};

const statusConfig: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  delivered: { label: 'Delivered', bg: '#dcfce7', color: SUCCESS, icon: CheckCircle },
  success: { label: 'Success', bg: '#dcfce7', color: SUCCESS, icon: CheckCircle },
  accepted: { label: 'Accepted', bg: '#dcfce7', color: SUCCESS, icon: CheckCircle },
  failed: { label: 'Failed', bg: '#fee2e2', color: DANGER, icon: XCircle },
  bounced: { label: 'Bounced', bg: '#fee2e2', color: DANGER, icon: XCircle },
  pending: { label: 'Pending', bg: '#fef9c3', color: WARNING, icon: AlertCircle },
  queued: { label: 'Queued', bg: '#fef9c3', color: WARNING, icon: AlertCircle },
  sent: { label: 'Sent', bg: '#dbeafe', color: PRIMARY, icon: CheckCircle },
};

const typeConfig: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  sms: { label: 'SMS', color: PRIMARY, bg: '#dbeafe', Icon: MessageSquare },
  email: { label: 'Email', color: '#8b5cf6', bg: '#ede9fe', Icon: Mail },
  api: { label: 'API', color: CYAN, bg: '#e0f2fe', Icon: Code2 },
  wallet: { label: 'Wallet', color: SUCCESS, bg: '#dcfce7', Icon: Wallet },
};

function numberFmt(value: number | undefined) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function moneyFmt(value: number | undefined, currency = 'GHS') {
  return `${currency} ${(value || 0).toFixed(2)}`;
}

function dateLabel(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function otpTimeLeft(expiresAt: string | null) {
  if (!expiresAt) return '0:00';
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function isLocked(service?: ServiceStatus) {
  return !!service && service.status !== 'available';
}

function serviceMessage(service?: ServiceStatus) {
  return service?.unavailable_message || 'This service is temporarily unavailable.';
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 shadow-xl" style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="text-xs mb-2" style={{ color: '#94a3b8', fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: '#e2e8f0' }}>{p.name}:</span>
          <span className="text-white" style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function LockBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]" style={{ background: '#fee2e2', color: DANGER, fontWeight: 700 }}>
      <Lock size={10} /> Locked
    </span>
  );
}

function StatCard({ icon: Icon, label, value, trendLabel, color, link, linkLabel, accent = false, locked = false, unavailableMessage = '' }: {
  icon: any; label: string; value: string; trendLabel?: string; color: string; link?: string; linkLabel?: string; accent?: boolean; locked?: boolean; unavailableMessage?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-2xl p-5 flex flex-col transition-all hover:-translate-y-0.5 cursor-default"
      style={{
        background: accent ? `linear-gradient(135deg, ${NAVY}, ${ELEC_BLUE})` : 'white',
        boxShadow: accent ? `0 8px 32px rgba(37,99,235,0.25)` : '0 2px 12px rgba(0,0,0,0.05)',
        border: accent ? 'none' : '1px solid rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent ? 'rgba(255,255,255,0.15)' : `${color}14` }}>
          <Icon size={18} style={{ color: accent ? 'white' : color }} />
        </div>
        {locked && <LockBadge />}
      </div>
      <div className="text-2xl mb-0.5" style={{ color: accent ? 'white' : DARK_TEXT, fontWeight: 800 }}>{value}</div>
      <div className="text-sm mb-3" style={{ color: accent ? 'rgba(255,255,255,0.7)' : SLATE }}>{label}</div>
      {trendLabel && <div className="text-[11px]" style={{ color: accent ? 'rgba(255,255,255,0.5)' : '#94a3b8' }}>{trendLabel}</div>}
      {locked && unavailableMessage && <div className="text-[11px] mt-2 line-clamp-2" style={{ color: accent ? 'rgba(255,255,255,0.65)' : '#94a3b8' }}>{unavailableMessage}</div>}
      {link && (
        <button
          onClick={() => locked ? toast.info(unavailableMessage || 'This service is unavailable.') : navigate(link)}
          className="mt-auto pt-3 flex items-center gap-1 text-xs transition-colors disabled:opacity-60"
          style={{ color: accent ? 'rgba(255,255,255,0.7)' : color, fontWeight: 600 }}
        >
          {locked && <Lock size={12} />}
          {linkLabel} <ArrowUpRight size={12} />
        </button>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>
      <div className="h-36 rounded-2xl animate-pulse" style={{ background: '#e2e8f0' }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-36 rounded-2xl animate-pulse" style={{ background: '#e2e8f0' }} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-64 rounded-2xl animate-pulse" style={{ background: '#e2e8f0' }} />
        <div className="h-64 rounded-2xl animate-pulse" style={{ background: '#e2e8f0' }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activeOtpOrders, setActiveOtpOrders] = useState<ActiveOtpOrder[]>([]);
  const [highlightedOtpIds, setHighlightedOtpIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dashboardOtpInitializedRef = useRef(false);
  const announcedOtpRef = useRef<Set<string>>(new Set());

  const otpAnnouncementKey = (order: ActiveOtpOrder) => (
    order.otp_code ? `${order.id}:${order.otp_code}` : ''
  );

  const seedAnnouncedOtps = (orders: ActiveOtpOrder[]) => {
    orders.forEach(order => {
      const key = otpAnnouncementKey(order);
      if (key && order.status === 'received') announcedOtpRef.current.add(key);
    });
  };

  const announceDashboardOtp = (order: ActiveOtpOrder) => {
    const key = otpAnnouncementKey(order);
    if (!key || announcedOtpRef.current.has(key)) return;
    announcedOtpRef.current.add(key);
    playNotificationSound();
    setHighlightedOtpIds(prev => new Set(prev).add(order.id));
    window.setTimeout(() => {
      setHighlightedOtpIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }, 3200);
  };

  const applyActiveOtpOrders = (nextOrders: ActiveOtpOrder[]) => {
    setActiveOtpOrders(prev => {
      if (!dashboardOtpInitializedRef.current) {
        seedAnnouncedOtps(nextOrders);
        dashboardOtpInitializedRef.current = true;
        return nextOrders;
      }

      const previousById = new Map(prev.map(order => [order.id, order]));
      nextOrders.forEach(order => {
        if (!order.otp_code || order.status !== 'received') return;
        const previous = previousById.get(order.id);
        const statusChanged = previous?.status && previous.status !== 'received';
        const codeFirstAppeared = !previous?.otp_code;
        if (statusChanged || codeFirstAppeared) announceDashboardOtp(order);
      });
      return nextOrders;
    });
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [response, activeResponse] = await Promise.all([
        getUserDashboard(),
        getActiveOtpOrders().catch(() => ({ orders: [] })),
      ]);
      setDashboard(response as DashboardData);
      applyActiveOtpOrders(activeResponse.orders || []);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveOtpOrders(prev => [...prev]), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await getActiveOtpOrders();
        applyActiveOtpOrders(response.orders || []);
      } catch {
        // Keep dashboard polling quiet; manual refresh still surfaces load errors.
      }
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const chartData = useMemo(() => (dashboard?.charts.message_analytics || []).map(row => ({
    day: row.day || new Date(row.date).toLocaleDateString([], { weekday: 'short' }),
    sms: row.sms_count,
    email: row.email_count,
    api: row.api_count,
  })), [dashboard]);

  const otpChartData = useMemo(() => (dashboard?.charts.otp_orders || []).map(row => ({
    day: row.day || new Date(row.date).toLocaleDateString([], { weekday: 'short' }),
    otp: row.count,
  })), [dashboard]);

  if (loading) return <DashboardSkeleton />;

  if (error || !dashboard) {
    return (
      <div className="p-5 lg:p-7" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>
        <div className="rounded-2xl p-8 text-center" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <AlertCircle className="mx-auto mb-3" style={{ color: DANGER }} />
          <div className="text-lg mb-1" style={{ color: DARK_TEXT, fontWeight: 800 }}>Dashboard unavailable</div>
          <p className="text-sm mb-4" style={{ color: SLATE }}>{error || 'Unable to load dashboard data.'}</p>
          <button onClick={loadDashboard} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white" style={{ background: PRIMARY, fontWeight: 700 }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const services = dashboard.services || {};
  const smsLocked = isLocked(services.sms_sender);
  const emailLocked = isLocked(services.email_sender);
  const otpLocked = isLocked(services.otp_virtual_numbers);
  const displayName = dashboard.user.name || user?.name || 'User';

  const actions = [
    { label: 'Send SMS', path: '/user/send-sms', Icon: MessageSquare, primary: true, locked: smsLocked, message: serviceMessage(services.sms_sender) },
    { label: 'Send Email', path: '/user/email-sender', Icon: Mail, locked: emailLocked, message: serviceMessage(services.email_sender) },
    { label: 'Buy Number', path: '/user/buy-number', Icon: Hash, locked: otpLocked, message: serviceMessage(services.otp_virtual_numbers) },
  ];

  const buyNumberMedia = [
    'https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/wa.png/thumb',
    'https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/tg.png/thumb',
    'https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/lf.png/thumb',
    'https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/fu.png/thumb',
    'https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/am.png/thumb',
    'https://flagcdn.com/w40/us.png',
    'https://flagcdn.com/w40/fr.png',
    'https://flagcdn.com/w40/de.png',
    'https://flagcdn.com/w40/cn.png',
    'https://flagcdn.com/w40/gb.png',
  ];
  const hasHighlightedOtp = highlightedOtpIds.size > 0;

  const copyOtp = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('OTP copied');
  };

  return (
    <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>
      <style>{`
        @keyframes buyNumberMediaFlow {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes otpCardGlow {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45), 0 0 0 rgba(16,185,129,0); border-color: rgba(16,185,129,0.25); }
          45% { box-shadow: 0 0 0 6px rgba(16,185,129,0.12), 0 16px 36px rgba(16,185,129,0.2); border-color: rgba(16,185,129,0.55); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0), 0 0 0 rgba(16,185,129,0); border-color: rgba(243,244,246,1); }
        }
        @keyframes otpBellPulse {
          0%, 100% { transform: scale(1); }
          45% { transform: scale(1.18); }
        }
      `}</style>
      <div className="rounded-2xl p-6 md:p-8 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0d2563 60%, ${ELEC_BLUE} 100%)`, boxShadow: `0 16px 48px rgba(6,20,43,0.25)` }}>
        <svg className="absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="ddots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="white" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#ddots)" />
        </svg>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20 pointer-events-none" style={{ background: CYAN, filter: 'blur(60px)' }} />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${CYAN})` }}>
                {dashboard.user.avatar_url ? <img src={dashboard.user.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-white text-sm" style={{ fontWeight: 800 }}>{dashboard.user.initials}</span>}
              </div>
              <div>
                <div className="text-white text-xl" style={{ fontWeight: 800 }}>Hello, {displayName.split(' ')[0]}</div>
                <div className="text-sm" style={{ color: '#94a3b8' }}>Manage your OTP, SMS and Email activities in one place.</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap md:justify-end gap-2 w-full md:w-auto md:max-w-[560px]">
            {actions.map(({ label, path, Icon, primary, locked, message }) => {
              const featured = label === 'Buy Number';

              return (
                <button
                  key={label}
                  onClick={() => locked ? toast.info(message || 'This service is unavailable.') : navigate(path)}
                  disabled={locked}
                  className={[
                    'relative overflow-hidden flex items-center rounded-xl text-sm transition-all hover:scale-[1.03] disabled:hover:scale-100 disabled:opacity-70',
                    featured ? 'col-span-2 min-h-[72px] px-4 sm:min-w-[280px] sm:flex-1 md:flex-none md:w-[310px]' : 'justify-center gap-2 px-4 py-2.5',
                  ].join(' ')}
                  style={{
                    background: featured
                      ? `linear-gradient(135deg, rgba(6,20,43,0.94), rgba(37,99,235,0.9))`
                      : primary ? `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})` : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: featured ? '1px solid rgba(255,255,255,0.22)' : primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
                    fontWeight: 600,
                    boxShadow: featured ? `0 10px 28px rgba(14,165,233,0.28)` : primary ? `0 4px 16px rgba(37,99,235,0.4)` : 'none',
                  }}
                >
                  {featured && (
                    <>
                      <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(90deg, ${PRIMARY}30, ${CYAN}40, ${SUCCESS}20)` }} />
                      <div className="absolute inset-y-0 left-0 flex items-center gap-3 pr-3 pointer-events-none" style={{ animation: 'buyNumberMediaFlow 18s linear infinite', width: 'max-content' }}>
                        {[...buyNumberMedia, ...buyNumberMedia].map((src, index) => (
                          <span key={`${src}-${index}`} className="w-10 h-10 rounded-xl bg-white/95 flex items-center justify-center shadow-sm overflow-hidden">
                            <img src={src} alt="" loading="lazy" className="w-7 h-7 object-contain" />
                          </span>
                        ))}
                      </div>
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(6,20,43,0.94) 0%, rgba(6,20,43,0.72) 42%, rgba(6,20,43,0.5) 100%)' }} />
                    </>
                  )}

                  <span className={featured ? 'relative z-10 flex items-center gap-3 text-left' : 'relative z-10 flex items-center gap-2'}>
                    <span className={featured ? 'w-10 h-10 rounded-xl flex items-center justify-center bg-white/15 border border-white/20' : ''}>
                      {locked ? <Lock size={featured ? 18 : 14} /> : <Icon size={featured ? 18 : 14} />}
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span>{label}</span>
                      {featured && <span className="text-[11px] mt-1 text-white/70">Pick a service and country</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={MessageSquare} label="SMS Sent Today" value={numberFmt(dashboard.stats.sms_sent_today)} trendLabel={`${numberFmt(dashboard.stats.sms_sent_total)} all time`} color={PRIMARY} link="/user/send-sms" linkLabel="Send SMS" locked={smsLocked} unavailableMessage={serviceMessage(services.sms_sender)} />
        <StatCard icon={Mail} label="Emails Sent Today" value={numberFmt(dashboard.stats.emails_sent_today)} trendLabel={`${numberFmt(dashboard.stats.emails_sent_total)} all time`} color="#8b5cf6" link="/user/email-sender" linkLabel="Send Email" locked={emailLocked} unavailableMessage={serviceMessage(services.email_sender)} />
        <StatCard icon={Hash} label="OTP Orders" value={numberFmt(dashboard.stats.otp_orders_total)} trendLabel={`${numberFmt(dashboard.stats.otp_orders_today)} today`} color={SUCCESS} link="/user/buy-number" linkLabel="Buy Number" locked={otpLocked} unavailableMessage={serviceMessage(services.otp_virtual_numbers)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm" style={{ color: DARK_TEXT, fontWeight: 700 }}>Message Analytics</div>
              <div className="text-xs mt-0.5" style={{ color: SLATE }}>Last 7 days - all channels</div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: BG, color: SLATE, fontWeight: 500 }}>
              <Activity size={12} /> Live
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gSms" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PRIMARY} stopOpacity={0.25} /><stop offset="95%" stopColor={PRIMARY} stopOpacity={0} /></linearGradient>
                <linearGradient id="gEmail" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                <linearGradient id="gApi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CYAN} stopOpacity={0.2} /><stop offset="95%" stopColor={CYAN} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="sms" name="SMS" stroke={PRIMARY} strokeWidth={2} fill="url(#gSms)" dot={false} />
              <Area type="monotone" dataKey="email" name="Email" stroke="#8b5cf6" strokeWidth={2} fill="url(#gEmail)" dot={false} />
              <Area type="monotone" dataKey="api" name="API" stroke={CYAN} strokeWidth={2} fill="url(#gApi)" dot={false} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} formatter={(v) => <span style={{ color: SLATE }}>{v}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-5" style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="mb-5">
            <div className="flex items-center gap-2 text-sm" style={{ color: DARK_TEXT, fontWeight: 700 }}>OTP Orders {otpLocked && <Lock size={13} style={{ color: DANGER }} />}</div>
            <div className="text-xs mt-0.5" style={{ color: SLATE }}>{otpLocked ? serviceMessage(services.otp_virtual_numbers) : 'Daily breakdown'}</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={otpChartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="otp" name="OTP" fill={SUCCESS} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm flex items-center gap-2" style={{ color: DARK_TEXT, fontWeight: 700 }}>
              <Phone size={15} style={{ color: SUCCESS, animation: hasHighlightedOtp ? 'otpBellPulse 0.9s ease-in-out 3' : undefined }} />
              Current OTP Numbers
            </div>
            <div className="text-xs mt-0.5" style={{ color: SLATE }}>Active demo OTP numbers</div>
          </div>
          <Link to="/user/otp-receives" className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl transition-colors" style={{ color: PRIMARY, background: `${PRIMARY}10`, fontWeight: 600 }}>
            View all <ChevronRight size={12} />
          </Link>
        </div>
        {activeOtpOrders.length === 0 ? (
          <div className="text-sm text-center py-8 rounded-xl" style={{ color: SLATE, background: BG }}>No active OTP numbers.</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeOtpOrders.slice(0, 6).map(order => (
              <div
                key={order.id}
                className="rounded-xl border border-gray-100 p-3"
                style={{ animation: highlightedOtpIds.has(order.id) ? 'otpCardGlow 3.2s ease-out' : undefined }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm truncate" style={{ color: DARK_TEXT, fontWeight: 700 }}>{order.service_name}</div>
                  <span className="text-[11px] rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700" style={{ fontWeight: 700 }}>{order.status}</span>
                </div>
                <div className="font-mono text-sm mb-2" style={{ color: SLATE }}>{order.phone_number}</div>
                <div className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2" style={{ background: '#f8faff' }}>
                  <span className="font-mono text-lg tracking-[0.18em]" style={{ color: SUCCESS, fontWeight: 800 }}>{order.otp_code || '------'}</span>
                  <button onClick={() => order.otp_code && copyOtp(order.otp_code)} className="p-1.5 rounded-lg hover:bg-white text-gray-500">
                    <Copy size={14} />
                  </button>
                </div>
                <div className="text-xs mt-2" style={{ color: '#94a3b8' }}>Expires in {otpTimeLeft(order.expires_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm" style={{ color: DARK_TEXT, fontWeight: 700 }}>Recent Activity</div>
            <div className="text-xs mt-0.5" style={{ color: SLATE }}>Latest messages, API calls and wallet activity</div>
          </div>
          <Link to="/user/logs" className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl transition-colors" style={{ color: PRIMARY, background: `${PRIMARY}10`, fontWeight: 600 }}>
            View all <ChevronRight size={12} />
          </Link>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: '#f8faff', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  {['Type', 'Recipient', 'Message', 'Status', 'Cost', 'Date'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 whitespace-nowrap text-[11px] uppercase tracking-wide" style={{ color: SLATE, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.recent_activity.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm" style={{ color: SLATE }}>No recent activity yet.</td>
                  </tr>
                )}
                {dashboard.recent_activity.map((msg, i) => {
                  const sc = statusConfig[msg.status] || statusConfig.pending;
                  const tc = typeConfig[msg.type] || typeConfig.api;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={msg.id || `${msg.type}-${i}`} className="transition-colors" style={{ borderBottom: i < dashboard.recent_activity.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]" style={{ background: tc.bg, color: tc.color, fontWeight: 600 }}>
                          <tc.Icon size={10} /> {tc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm" style={{ color: SLATE }}>{msg.recipient || '-'}</td>
                      <td className="px-5 py-3.5"><p className="text-sm max-w-[240px] truncate" style={{ color: '#374151' }}>{msg.message || '-'}</p></td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]" style={{ background: sc.bg, color: sc.color, fontWeight: 600 }}>
                          <StatusIcon size={10} /> {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: SLATE, fontWeight: 600 }}>{moneyFmt(msg.cost, msg.currency)}</td>
                      <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: '#94a3b8' }}>{dateLabel(msg.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {loading && (
        <div className="fixed bottom-5 right-5 rounded-xl px-4 py-3 shadow-xl text-sm text-white flex items-center gap-2" style={{ background: NAVY }}>
          <Loader2 size={14} className="animate-spin" /> Refreshing dashboard
        </div>
      )}
    </div>
  );
}
