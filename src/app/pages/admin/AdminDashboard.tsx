import { useEffect, useState } from 'react';
import {
  Users, Coins, Hash, MessageSquare, Mail, TrendingUp,
  ArrowUpRight, AlertTriangle, Megaphone, LifeBuoy, AlertCircle, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { Link } from 'react-router';
import { useComplaints, STATUS_CONFIG, PRIORITY_CONFIG } from '../../contexts/ComplaintsContext';
import { useEmbedWidgets } from '../../contexts/EmbedWidgetsContext';
import { getAdminDashboard } from '../../../lib/api.js';


const typeConfig: Record<string, { color: string; bg: string; icon: typeof Hash }> = {
  OTP:   { color: 'text-purple-700', bg: 'bg-purple-100', icon: Hash },
  SMS:   { color: 'text-blue-700',   bg: 'bg-blue-100',   icon: MessageSquare },
  Email: { color: 'text-indigo-700', bg: 'bg-indigo-100', icon: Mail },
};

const statusBadge: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  sent:      'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
  pending:   'bg-amber-100 text-amber-700',
};

const emptyDashboard = {
  top_metrics: {
    total_users: 0,
    users_this_week: 0,
    wallet_balance: 0,
    otp_orders: 0,
    otp_today: 0,
    otp_change_vs_yesterday: 0,
    sms_sent_month: 0,
    emails_sent_month: 0,
    total_revenue: 0,
    revenue_change_vs_last_month: 0,
    total_profit: 0,
    profit_margin: 0,
    failed_deliveries: 0,
  },
  rates: {
    otp_success_rate: 0,
    sms_delivery_rate: 0,
    email_success_rate: 0,
    active_campaigns: 0,
  },
  charts: {
    revenue_trend: [],
    channel_usage: [],
    delivery_outcomes: [],
    channel_breakdown: [
      { name: 'SMS', value: 0, color: '#3B82F6' },
      { name: 'Email', value: 0, color: '#8B5CF6' },
      { name: 'OTP', value: 0, color: '#10B981' },
    ],
  },
  support: {
    open: 0,
    high_priority: 0,
    resolved_today: 0,
    recent_tickets: [],
    unread_count: 0,
  },
  recent_activity: [],
  widgets: {
    active: 0,
    sends_today: 0,
    failed_today: 0,
  },
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString();
}

function formatMoney(value: number) {
  return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-4 py-3">
        <div className="text-xs text-gray-500 mb-1" style={{ fontWeight: 600 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="text-sm" style={{ color: p.color, fontWeight: 600 }}>
            {p.name}: {p.name === 'revenue' || p.name === 'profit' ? `$${p.value}` : p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function AdminDashboard() {
  const { tickets, adminUnreadCount } = useComplaints();
  const { widgets, logs: widgetLogs } = useEmbedWidgets();
  const [dashboard, setDashboard] = useState<any>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminDashboard();
      setDashboard({
        ...emptyDashboard,
        ...response,
        charts: { ...emptyDashboard.charts, ...(response.charts || {}) },
        top_metrics: { ...emptyDashboard.top_metrics, ...(response.top_metrics || {}) },
        rates: { ...emptyDashboard.rates, ...(response.rates || {}) },
        support: { ...emptyDashboard.support, ...(response.support || {}) },
        widgets: { ...emptyDashboard.widgets, ...(response.widgets || {}) },
      });
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const complaintStats = {
    open: dashboard.support.open ?? tickets.filter(t => t.status === 'open').length,
    highPriority: dashboard.support.high_priority ?? tickets.filter(t => t.priority === 'high' && (t.status === 'open' || t.status === 'in_review')).length,
    resolvedToday: dashboard.support.resolved_today ?? tickets.filter(t => t.resolvedAt && new Date(t.resolvedAt).toDateString() === new Date().toDateString()).length,
  };

  const recentTickets = (dashboard.support.recent_tickets?.length ? dashboard.support.recent_tickets : tickets
    .filter(t => t.status !== 'closed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5).map(t => ({
      id: t.id,
      subject: t.subject,
      user_name: t.userName,
      status: t.status,
      priority: t.priority,
      created_at: t.createdAt,
    })));

  // Widget stats
  const activeWidgets = dashboard.widgets.active ?? widgets.filter(w => w.status === 'active').length;
  const widgetSendsToday = dashboard.widgets.sends_today ?? 0;
  const failedWidgetSends = dashboard.widgets.failed_today ?? 0;
  const widgetAbuseAlerts = widgets.filter(w => w.totalSends > 500).length;
  const metrics = dashboard.top_metrics;
  const topMetrics = [
    { label: 'Total Users', value: formatNumber(metrics.total_users), change: `+${formatNumber(metrics.users_this_week)} this week`, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Wallet Balance', value: formatMoney(metrics.wallet_balance), change: 'Held across users', icon: Coins, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'OTP Orders', value: formatNumber(metrics.otp_orders), change: `${formatNumber(metrics.otp_today)} today`, icon: Hash, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'SMS Sent', value: formatNumber(metrics.sms_sent_month), change: 'This month', icon: MessageSquare, color: 'text-cyan-600', bg: 'bg-cyan-100' },
    { label: 'Emails Sent', value: formatNumber(metrics.emails_sent_month), change: 'This month', icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: 'Total Revenue', value: formatMoney(metrics.total_revenue), change: `${formatPercent(metrics.revenue_change_vs_last_month)} vs last month`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Total Profit', value: formatMoney(metrics.total_profit), change: `${formatPercent(metrics.profit_margin)} margin`, icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Failed Deliveries', value: formatNumber(metrics.failed_deliveries), change: 'SMS + Email', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
  ];
  const rateCards = [
    { label: 'OTP Success Rate', value: formatPercent(dashboard.rates.otp_success_rate), icon: Hash, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    { label: 'SMS Delivery Rate', value: formatPercent(dashboard.rates.sms_delivery_rate), icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Email Success Rate', value: formatPercent(dashboard.rates.email_success_rate), icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { label: 'Active Campaigns', value: formatNumber(dashboard.rates.active_campaigns), icon: Megaphone, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  ];
  const revenueData = dashboard.charts.revenue_trend || [];
  const channelData = dashboard.charts.channel_usage || [];
  const deliveryData = dashboard.charts.delivery_outcomes || [];
  const channelPie = dashboard.charts.channel_breakdown || emptyDashboard.charts.channel_breakdown;
  const recentActivity = dashboard.recent_activity || [];

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="h-12 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-72 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-500" />
          <h1 className="text-xl text-gray-800 mb-1" style={{ fontWeight: 700 }}>Admin Dashboard unavailable</h1>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button onClick={loadDashboard} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm" style={{ fontWeight: 600 }}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Platform-wide overview — OTP, SMS &amp; Email.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>

      {/* 8 top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {topMetrics.map(m => (
          <div key={m.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${m.bg} rounded-xl flex items-center justify-center`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full whitespace-nowrap">{m.change}</span>
            </div>
            <div className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>{m.value}</div>
            <div className="text-gray-500 text-sm mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Rate cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {rateCards.map(r => (
          <div key={r.label} className={`${r.bg} border ${r.border} rounded-2xl p-4 flex items-center gap-4`}>
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <r.icon className={`w-5 h-5 ${r.color}`} />
            </div>
            <div>
              <div className={`text-xl ${r.color}`} style={{ fontWeight: 800 }}>{r.value}</div>
              <div className="text-gray-500 text-xs">{r.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Revenue &amp; Profit Trend</h2>
              <p className="text-gray-400 text-xs mt-0.5">Last 7 months</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500" />Revenue</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-400" />Profit</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34D399" stopOpacity={0.2} /><stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `GHS ${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
              <Area type="monotone" dataKey="profit" stroke="#34D399" strokeWidth={2} fill="url(#profGrad)" name="profit" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Channel pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Channel Breakdown</h2>
            <p className="text-gray-400 text-xs mt-0.5">SMS · Email · OTP volume</p>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={channelPie} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                {channelPie.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v}%`, '']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {channelPie.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-gray-600">{item.name}</span>
                </div>
                <span className="text-xs text-gray-800" style={{ fontWeight: 600 }}>{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Channel trend + Delivery success */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Channel usage chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>SMS vs Email vs OTP Usage</h2>
            <p className="text-gray-400 text-xs">Monthly volume by channel</p>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={channelData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sms"   fill="#3B82F6" radius={[4,4,0,0]} name="sms"   />
              <Bar dataKey="email" fill="#8B5CF6" radius={[4,4,0,0]} name="email" />
              <Bar dataKey="otp"   fill="#10B981" radius={[4,4,0,0]} name="otp"   />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {[['SMS','#3B82F6'],['Email','#8B5CF6'],['OTP','#10B981']].map(([l,c]) => (
              <div key={l} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: c }} />{l}</div>
            ))}
          </div>
        </div>

        {/* Delivery success/fail */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Delivered vs Failed</h2>
            <p className="text-gray-400 text-xs">This week's delivery outcomes</p>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={deliveryData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="success" fill="#10B981" radius={[4,4,0,0]} name="success" />
              <Bar dataKey="failed"  fill="#EF4444" radius={[4,4,0,0]} name="failed"  />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-400" />Delivered</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-400" />Failed</div>
          </div>
        </div>
      </div>

      {/* Complaint monitoring cards */}
      <div className="col-span-full">
        <h2 className="text-gray-700 mb-3" style={{ fontWeight: 600 }}>Support Overview</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Open Complaints',       value: complaintStats.open,         color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-100',    icon: AlertCircle },
            { label: 'High Priority',         value: complaintStats.highPriority, color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-100', icon: AlertCircle },
            { label: 'Resolved Today',        value: complaintStats.resolvedToday,color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',icon: LifeBuoy   },
          ].map(c => (
            <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4 flex items-center gap-4`}>
              <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div>
                <div className={`text-2xl ${c.color}`} style={{ fontWeight: 700 }}>{c.value}</div>
                <div className="text-gray-500 text-xs">{c.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Complaints widget */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-red-500" />
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Recent Complaints</h2>
            {adminUnreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>{adminUnreadCount} unresolved</span>
            )}
          </div>
          <Link to="/admin/complaints" className="text-sm text-blue-600 hover:text-blue-800" style={{ fontWeight: 500 }}>View all →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recentTickets.map(ticket => {
            const sc = STATUS_CONFIG[ticket.status];
            const pc = PRIORITY_CONFIG[ticket.priority];
            return (
              <div key={ticket.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${ticket.priority === 'high' ? 'bg-red-100' : ticket.priority === 'medium' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <span className={`text-xs ${ticket.priority === 'high' ? 'text-red-700' : ticket.priority === 'medium' ? 'text-blue-700' : 'text-gray-600'}`} style={{ fontWeight: 600 }}>
                      {(ticket.user_name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate" style={{ fontWeight: 500 }}>{ticket.subject}</div>
                    <div className="text-xs text-gray-400">{ticket.user_name} · {ticket.created_at}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${pc.color}`} style={{ fontWeight: 500 }}>{pc.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${sc.color}`} style={{ fontWeight: 500 }}>{sc.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Recent Activity</h2>
          <Link to="/admin/logs" className="text-xs text-blue-600 hover:text-blue-800">View all logs →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Type','User','Action','Status','Amount','Date'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentActivity.map(a => {
                const tc = typeConfig[a.type];
                return (
                  <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${tc.bg} ${tc.color}`} style={{ fontWeight: 600 }}>
                        <tc.icon className="w-3 h-3" />{a.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>{a.user}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[220px] truncate">{a.action}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${statusBadge[a.status] || 'bg-gray-100 text-gray-600'}`} style={{ fontWeight: 500 }}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700" style={{ fontWeight: 600 }}>GHS {a.amount.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">Today {a.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


