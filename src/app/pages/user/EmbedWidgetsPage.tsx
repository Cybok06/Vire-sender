import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  Code2, Plus, MessageSquare, Mail, Layers, Activity, ToggleRight,
  ToggleLeft, Trash2, Eye, Edit2, Copy, ExternalLink, ChevronRight,
  Search, Filter, BarChart2, CheckCircle, XCircle, AlertCircle,
  Clock, Send, Shield
} from 'lucide-react';
import { useEmbedWidgets, WidgetType, EmbedWidget } from '../../contexts/EmbedWidgetsContext';
import { toast } from 'sonner';
import { safeClipboardCopy } from '../../utils/clipboard';

// ─── Brand ───────────────────────────────────────────────────────────────────
const PRIMARY = '#2563EB';
const NAVY    = '#06142B';
const CYAN    = '#0EA5E9';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';
const SLATE   = '#64748B';
const DARK    = '#0F172A';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const typeConfig: Record<WidgetType, { label: string; Icon: any; color: string; bg: string }> = {
  sms:      { label: 'SMS',      Icon: MessageSquare, color: PRIMARY,   bg: `${PRIMARY}12`   },
  email:    { label: 'Email',    Icon: Mail,          color: '#8b5cf6', bg: '#8b5cf612'       },
  combined: { label: 'Combined', Icon: Layers,        color: CYAN,      bg: `${CYAN}12`       },
};

const statusConfig = {
  active:   { label: 'Active',   color: SUCCESS,  bg: `${SUCCESS}12`  },
  disabled: { label: 'Disabled', color: DANGER,   bg: `${DANGER}12`   },
  pending:  { label: 'Pending',  color: WARNING,  bg: `${WARNING}12`  },
};

const logStatusConfig = {
  delivered: { label: 'Delivered', Icon: CheckCircle, color: SUCCESS },
  sent:      { label: 'Sent',      Icon: CheckCircle, color: PRIMARY  },
  failed:    { label: 'Failed',    Icon: XCircle,     color: DANGER   },
  pending:   { label: 'Pending',   Icon: AlertCircle, color: WARNING  },
  blocked:   { label: 'Blocked',   Icon: AlertCircle, color: WARNING  },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, accent }: any) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all hover:-translate-y-0.5"
      style={accent
        ? { background: `linear-gradient(135deg, ${NAVY}, ${PRIMARY})`, boxShadow: `0 8px 32px rgba(37,99,235,0.25)` }
        : { background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }
      }
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accent ? 'rgba(255,255,255,0.15)' : bg }}>
        <Icon size={18} style={{ color: accent ? 'white' : color }} />
      </div>
      <div>
        <div className="text-2xl" style={{ color: accent ? 'white' : DARK, fontWeight: 800 }}>{value}</div>
        <div className="text-sm mt-0.5" style={{ color: accent ? 'rgba(255,255,255,0.65)' : SLATE }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Widget row actions ───────────────────────────────────────────────────────
function WidgetActions({ widget }: { widget: EmbedWidget }) {
  const { toggleWidgetStatus, deleteWidget } = useEmbedWidgets();
  const navigate = useNavigate();

  const hostedUrl  = `${window.location.origin}/embed/${widget.id}?token=${encodeURIComponent(widget.token)}`;
  const iframeCode = `<iframe\n  src="${hostedUrl}"\n  width="100%"\n  height="720"\n  style="border:0;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,0.12);"\n  title="${widget.name} — VireSend Widget"\n  loading="lazy"\n></iframe>`;

  const copy = (text: string, label: string) => { safeClipboardCopy(text); toast.success(label); };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => navigate(`/user/embed-widgets/${widget.id}`)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-100"
        style={{ color: SLATE, fontWeight: 500 }}
        title="View"
      >
        <Eye size={13} /> View
      </button>
      <button
        onClick={() => navigate(`/user/embed-widgets/${widget.id}/edit`)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-blue-50"
        style={{ color: PRIMARY, fontWeight: 500 }}
        title="Edit"
      >
        <Edit2 size={13} /> Edit
      </button>
      <button
        onClick={() => copy(iframeCode, 'iframe code copied!')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-100"
        style={{ color: SLATE, fontWeight: 500 }}
        title="Copy iframe"
      >
        <Code2 size={13} /> iframe
      </button>
      <button
        onClick={() => copy(hostedUrl, 'Hosted link copied!')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-100"
        style={{ color: SLATE, fontWeight: 500 }}
        title="Copy link"
      >
        <ExternalLink size={13} /> Link
      </button>
      <button
        onClick={async () => {
          try {
            await toggleWidgetStatus(widget.id);
            toast.success(`Widget ${widget.status === 'active' ? 'disabled' : 'activated'}`);
          } catch (error: any) {
            toast.error(error.message || 'Could not update widget');
          }
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{
          color: widget.status === 'active' ? WARNING : SUCCESS,
          fontWeight: 500,
          background: widget.status === 'active' ? `${WARNING}10` : `${SUCCESS}10`,
        }}
        title={widget.status === 'active' ? 'Disable' : 'Enable'}
      >
        {widget.status === 'active' ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        {widget.status === 'active' ? 'Disable' : 'Enable'}
      </button>
      <button
        onClick={async () => {
          if (!confirm('Delete this widget?')) return;
          try {
            await deleteWidget(widget.id);
            toast.success('Widget deleted');
          } catch (error: any) {
            toast.error(error.message || 'Could not delete widget');
          }
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-red-50"
        style={{ color: DANGER, fontWeight: 500 }}
        title="Delete"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmbedWidgetsPage() {
  const { widgets, logs } = useEmbedWidgets();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | WidgetType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [activeTab, setActiveTab] = useState<'widgets' | 'logs'>('widgets');

  // Stats
  const totalWidgets  = widgets.length;
  const smsWidgets    = widgets.filter(w => w.type === 'sms').length;
  const emailWidgets  = widgets.filter(w => w.type === 'email').length;
  const activeWidgets = widgets.filter(w => w.status === 'active').length;
  const totalSends    = widgets.reduce((s, w) => s + w.totalSends, 0);

  // Filtered widgets
  const filtered = widgets.filter(w => {
    const matchSearch = w.name.toLowerCase().includes(search.toLowerCase());
    const matchType   = filterType === 'all' || w.type === filterType;
    const matchStatus = filterStatus === 'all' || w.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl" style={{ color: DARK, fontWeight: 800 }}>Embed Pages & Widgets</h1>
          <p className="text-sm mt-0.5" style={{ color: SLATE }}>Create embeddable SMS / Email forms for any website.</p>
        </div>
        <button
          onClick={() => navigate('/user/embed-widgets/create')}
          className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl transition-all hover:opacity-90 text-sm self-start sm:self-auto"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, #1D4ED8)`, fontWeight: 700, boxShadow: `0 4px 14px rgba(37,99,235,0.35)` }}
        >
          <Plus size={16} /> Create Widget
        </button>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Code2}        label="Total Widgets"   value={totalWidgets}  color={PRIMARY}   bg={`${PRIMARY}12`}   accent />
        <StatCard icon={MessageSquare} label="SMS Widgets"    value={smsWidgets}    color={PRIMARY}   bg={`${PRIMARY}12`}   />
        <StatCard icon={Mail}          label="Email Widgets"  value={emailWidgets}  color="#8b5cf6"   bg="#8b5cf612"        />
        <StatCard icon={Activity}      label="Active Widgets" value={activeWidgets} color={SUCCESS}   bg={`${SUCCESS}12`}   />
        <StatCard icon={BarChart2}     label="Total Sends"    value={totalSends.toLocaleString()} color={CYAN} bg={`${CYAN}12`} />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#e2e8f0' }}>
        {[['widgets', 'Widgets', Code2], ['logs', 'Widget Logs', BarChart2]].map(([id, label, Icon]: any) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm transition-all"
            style={{
              background: activeTab === id ? 'white' : 'transparent',
              color: activeTab === id ? DARK : SLATE,
              fontWeight: activeTab === id ? 700 : 400,
              boxShadow: activeTab === id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── WIDGETS TAB ────────────────────────────────────────────── */}
      {activeTab === 'widgets' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search widgets..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ border: '1.5px solid #e2e8f0', background: 'white', fontFamily: 'inherit' }}
                onFocus={e => (e.currentTarget.style.borderColor = PRIMARY)}
                onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
              />
            </div>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1.5px solid #e2e8f0', color: DARK, fontFamily: 'inherit', background: 'white' }}
            >
              <option value="all">All Types</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="combined">Combined</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1.5px solid #e2e8f0', color: DARK, fontFamily: 'inherit', background: 'white' }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {/* Widget cards (mobile) + Table (desktop) */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: `${PRIMARY}10` }}>
                <Code2 size={24} style={{ color: PRIMARY }} />
              </div>
              <div className="text-base mb-1" style={{ color: DARK, fontWeight: 700 }}>No widgets yet</div>
              <p className="text-sm mb-4" style={{ color: SLATE }}>Create your first embeddable widget to get started.</p>
              <button
                onClick={() => navigate('/user/embed-widgets/create')}
                className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm mx-auto"
                style={{ background: `linear-gradient(135deg, ${PRIMARY}, #1D4ED8)`, fontWeight: 700 }}
              >
                <Plus size={14} /> Create Widget
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#f8faff', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      {['Widget Name', 'Type', 'Status', 'Total Sends', 'Created', 'Last Used', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3.5 text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: SLATE, fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((widget, i) => {
                      const tc = typeConfig[widget.type] || typeConfig.sms;
                      const sc = statusConfig[widget.status] || statusConfig.disabled;
                      return (
                        <tr
                          key={widget.id}
                          style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}
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
                            <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: tc.bg, color: tc.color, fontWeight: 600 }}>{tc.label}</span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />
                              <span className="text-xs" style={{ color: sc.color, fontWeight: 600 }}>{sc.label}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm" style={{ color: DARK, fontWeight: 700 }}>{widget.totalSends.toLocaleString()}</td>
                          <td className="px-5 py-4 text-xs" style={{ color: SLATE }}>{widget.createdAt}</td>
                          <td className="px-5 py-4 text-xs" style={{ color: SLATE }}>{widget.lastUsed}</td>
                          <td className="px-5 py-4"><WidgetActions widget={widget} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── LOGS TAB ───────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#f8faff' }}>
            <div className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Widget Send Logs</div>
            <div className="text-xs mt-0.5" style={{ color: SLATE }}>All sends made through your embed widgets</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  {['Widget', 'Type', 'Recipient', 'Status', 'Cost', 'Date'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[11px] uppercase tracking-wide" style={{ color: SLATE, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const sc = logStatusConfig[log.status] || logStatusConfig.pending;
                  const tc = log.type === 'sms'
                    ? { label: 'SMS', color: PRIMARY, bg: `${PRIMARY}10` }
                    : { label: 'Email', color: '#8b5cf6', bg: '#8b5cf610' };
                  return (
                    <tr
                      key={log.id}
                      style={{ borderBottom: i < logs.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-5 py-3.5 text-sm" style={{ color: DARK, fontWeight: 600 }}>{log.widgetName}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: tc.bg, color: tc.color, fontWeight: 600 }}>{tc.label}</span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm" style={{ color: SLATE }}>{log.recipient}</td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1 text-xs" style={{ color: sc.color, fontWeight: 600 }}>
                          <sc.Icon size={12} />{sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: SLATE, fontWeight: 600 }}>{log.cost > 0 ? `GHS ${log.cost.toFixed(2)}` : '—'}</td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: '#94a3b8' }}>{log.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}



