import { useState } from 'react';
import {
  Code2, MessageSquare, Mail, Layers, Activity, ToggleRight,
  ToggleLeft, Eye, ExternalLink, Shield, AlertTriangle,
  CheckCircle, XCircle, Search, BarChart2, Clock,
  Zap, Users, TrendingUp
} from 'lucide-react';
import { useEmbedWidgets, EmbedWidget, WidgetLog } from '../../contexts/EmbedWidgetsContext';
import { toast } from 'sonner';

// ─── Brand ───────────────────────────────────────────────────────────────────
const PRIMARY = '#2563EB';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';
const CYAN    = '#0EA5E9';
const SLATE   = '#64748B';
const DARK    = '#0F172A';
const NAVY    = '#06142B';

const typeConfig: Record<string, any> = {
  sms:      { label: 'SMS',      Icon: MessageSquare, color: PRIMARY,   bg: `${PRIMARY}10`  },
  email:    { label: 'Email',    Icon: Mail,          color: '#8b5cf6', bg: '#8b5cf610'      },
  combined: { label: 'Combined', Icon: Layers,        color: CYAN,      bg: `${CYAN}10`      },
};

const statusColors: Record<string, { color: string; bg: string }> = {
  active:   { color: SUCCESS, bg: `${SUCCESS}12` },
  disabled: { color: DANGER,  bg: `${DANGER}12`  },
  pending:  { color: WARNING, bg: `${WARNING}12` },
};

const logStatusConfig: Record<string, any> = {
  delivered: { Icon: CheckCircle, color: SUCCESS },
  sent:      { Icon: CheckCircle, color: PRIMARY  },
  failed:    { Icon: XCircle,     color: DANGER   },
  pending:   { Icon: AlertTriangle, color: WARNING },
  blocked:   { Icon: AlertTriangle, color: WARNING },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, sub }: any) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl mb-0.5" style={{ color: DARK, fontWeight: 800 }}>{value}</div>
      <div className="text-sm" style={{ color: SLATE }}>{label}</div>
      {sub && <div className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

// ─── Widget row ───────────────────────────────────────────────────────────────
function AdminWidgetRow({ widget, onToggle, onSelect }: {
  widget: EmbedWidget;
  onToggle: () => void;
  onSelect: (w: EmbedWidget) => void;
}) {
  const tc = typeConfig[widget.type] || typeConfig.sms;
  const sc = statusColors[widget.status] || statusColors.disabled;

  return (
    <tr
      onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tc.bg }}>
            <tc.Icon size={14} style={{ color: tc.color }} />
          </div>
          <div>
            <div className="text-sm" style={{ color: DARK, fontWeight: 700 }}>{widget.name}</div>
            <div className="text-[10px] font-mono" style={{ color: '#94a3b8' }}>{widget.id}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="text-sm" style={{ color: DARK, fontWeight: 600 }}>{widget.userName}</div>
        <div className="text-[10px]" style={{ color: SLATE }}>{widget.userId}</div>
      </td>
      <td className="px-5 py-4">
        <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: tc.bg, color: tc.color, fontWeight: 600 }}>{tc.label}</span>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />
          <span className="text-xs" style={{ color: sc.color, fontWeight: 600, textTransform: 'capitalize' }}>{widget.status}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-sm" style={{ color: DARK, fontWeight: 700 }}>{widget.totalSends.toLocaleString()}</td>
      <td className="px-5 py-4 text-sm" style={{ color: DARK, fontWeight: 600 }}>GHS {widget.totalCost.toFixed(2)}</td>
      <td className="px-5 py-4 text-xs" style={{ color: SLATE }}>{widget.lastUsed}</td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onSelect(widget)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-blue-50"
            style={{ color: PRIMARY, fontWeight: 600 }}
          >
            <Eye size={12} /> View Logs
          </button>
          <button
            onClick={() => {
              if (widget.status !== 'disabled') {
                toast.error(`Widget "${widget.name}" flagged for abuse review`);
              } else {
                toast.info('Widget already disabled');
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-amber-50"
            style={{ color: WARNING, fontWeight: 600 }}
          >
            <AlertTriangle size={12} /> Review
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              color: widget.status === 'active' ? DANGER : SUCCESS,
              fontWeight: 600,
              background: widget.status === 'active' ? `${DANGER}08` : `${SUCCESS}08`,
            }}
          >
            {widget.status === 'active' ? <><ToggleRight size={12} /> Disable</> : <><ToggleLeft size={12} /> Enable</>}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Logs modal ───────────────────────────────────────────────────────────────
function LogsModal({ widget, logs, onClose }: { widget: EmbedWidget; logs: WidgetLog[]; onClose: () => void }) {
  const widgetLogs = logs.filter(l => l.widgetId === widget.id);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16" style={{ background: 'rgba(6,20,43,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f8faff' }}>
          <div>
            <div className="text-base" style={{ color: DARK, fontWeight: 800 }}>Widget Logs</div>
            <div className="text-xs mt-0.5" style={{ color: SLATE }}>{widget.name} · {widget.id}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors" style={{ color: SLATE }}>
            <XCircle size={18} />
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {widgetLogs.length === 0 ? (
            <div className="p-12 text-center">
              <BarChart2 size={32} style={{ color: '#e2e8f0', margin: '0 auto 12px' }} />
              <p className="text-sm" style={{ color: SLATE }}>No logs for this widget.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#f8faff' }}>
                    {['Type', 'Recipient', 'Status', 'Cost', 'Date'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[11px] uppercase tracking-wide" style={{ color: SLATE, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {widgetLogs.map((log, i) => {
                    const s = logStatusConfig[log.status] || logStatusConfig.pending;
                    const t = log.type === 'sms'
                      ? { label: 'SMS', color: PRIMARY, bg: `${PRIMARY}10` }
                      : { label: 'Email', color: '#8b5cf6', bg: '#8b5cf610' };
                    return (
                      <tr key={log.id} style={{ borderBottom: i < widgetLogs.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                        <td className="px-5 py-3.5">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: t.bg, color: t.color, fontWeight: 600 }}>{t.label}</span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm" style={{ color: SLATE }}>{log.recipient}</td>
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-1 text-xs" style={{ color: s.color, fontWeight: 600 }}>
                            <s.Icon size={11} />{log.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm" style={{ color: SLATE }}>{log.cost > 0 ? `GHS ${log.cost.toFixed(2)}` : '—'}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: '#94a3b8' }}>{log.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminEmbedWidgets() {
  const { widgets, logs, stats, toggleWidgetStatus } = useEmbedWidgets();
  const [search, setSearch]       = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedWidget, setSelectedWidget] = useState<EmbedWidget | null>(null);

  // Stats
  const activeWidgets = Number(stats.active ?? widgets.filter(w => w.status === 'active').length);
  const totalSendsToday = Number(stats.sends_today ?? 0);
  const failedToday = Number(stats.failed_today ?? 0);
  const abuseAlerts = Number(stats.abuse_alerts ?? 0);
  const totalCost = Number(stats.revenue ?? widgets.reduce((s, w) => s + w.totalCost, 0));

  const filtered = widgets.filter(w => {
    const matchSearch = w.name.toLowerCase().includes(search.toLowerCase()) || w.userName.toLowerCase().includes(search.toLowerCase());
    const matchType   = filterType === 'all'   || w.type === filterType;
    const matchStatus = filterStatus === 'all' || w.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <>
      {selectedWidget && <LogsModal widget={selectedWidget} logs={logs} onClose={() => setSelectedWidget(null)} />}

      <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>

        {/* Header */}
        <div>
          <h1 className="text-2xl" style={{ color: DARK, fontWeight: 800 }}>Embed Widgets Management</h1>
          <p className="text-sm mt-0.5" style={{ color: SLATE }}>Monitor, control, and audit all embeddable widgets across users.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Activity}      label="Active Widgets"        value={activeWidgets}   color={SUCCESS}   bg={`${SUCCESS}10`}   sub="Platform-wide" />
          <StatCard icon={TrendingUp}    label="Sends Today"           value={totalSendsToday} color={PRIMARY}   bg={`${PRIMARY}10`}   sub="Through widgets" />
          <StatCard icon={XCircle}       label="Failed Sends Today"    value={failedToday}     color={DANGER}    bg={`${DANGER}10`}    sub="Needs review" />
          <StatCard icon={AlertTriangle} label="Abuse Alerts"          value={abuseAlerts}     color={WARNING}   bg={`${WARNING}10`}   sub="High-volume widgets" />
          <StatCard icon={Zap}           label="Total Widget Revenue"  value={`GHS ${totalCost.toFixed(2)}`} color={CYAN} bg={`${CYAN}10`} sub="All time" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by widget name or owner..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{ border: '1.5px solid #e2e8f0', background: 'white', fontFamily: 'inherit' }}
              onFocus={e => (e.currentTarget.style.borderColor = PRIMARY)}
              onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1.5px solid #e2e8f0', fontFamily: 'inherit', background: 'white', color: DARK }}
          >
            <option value="all">All Types</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="combined">Combined</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1.5px solid #e2e8f0', fontFamily: 'inherit', background: 'white', color: DARK }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        {/* Main table */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#f8faff' }}>
            <div className="text-sm" style={{ color: DARK, fontWeight: 700 }}>All Embed Widgets ({filtered.length})</div>
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: `${WARNING}10`, color: WARNING, fontWeight: 600 }}>
              <Shield size={11} /> Security Monitoring Active
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  {['Widget Name', 'Owner', 'Type', 'Status', 'Total Sends', 'Revenue', 'Last Used', 'Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: SLATE, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(widget => (
                  <AdminWidgetRow
                    key={widget.id}
                    widget={widget}
                    onToggle={async () => {
                      try {
                        await toggleWidgetStatus(widget.id);
                        toast.success(`Widget "${widget.name}" ${widget.status === 'active' ? 'disabled' : 'enabled'}`);
                      } catch (error: any) {
                        toast.error(error.message || 'Could not update widget');
                      }
                    }}
                    onSelect={setSelectedWidget}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center">
              <Code2 size={32} style={{ color: '#e2e8f0', margin: '0 auto 12px' }} />
              <p className="text-sm" style={{ color: SLATE }}>No widgets match your filters.</p>
            </div>
          )}
          <div className="px-5 py-3 text-xs" style={{ borderTop: '1px solid rgba(0,0,0,0.04)', color: '#94a3b8', background: '#fafafa' }}>
            Showing {filtered.length} of {widgets.length} widgets · All sends are validated against wallet balance before execution
          </div>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: `${NAVY}05`, border: `1px solid rgba(6,20,43,0.08)` }}>
          <Shield size={16} style={{ color: PRIMARY, flexShrink: 0, marginTop: 2 }} />
          <div className="text-sm" style={{ color: DARK }}>
            <span style={{ fontWeight: 700 }}>Security Enforcement:</span> API keys are never exposed in embed widgets. Each widget uses a scoped token. Wallet balance checks and HTML sanitization are enforced on every request. Disable abusive widgets immediately using the controls above.
          </div>
        </div>
      </div>
    </>
  );
}




