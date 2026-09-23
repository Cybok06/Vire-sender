import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, Code2, ExternalLink, Copy, Eye, Edit2, ToggleRight,
  ToggleLeft, Shield, Zap, Layers, MessageSquare, Mail,
  Monitor, Tablet, Smartphone, CheckCircle, XCircle, AlertCircle,
  Clock, X, Activity
} from 'lucide-react';
import { useEmbedWidgets } from '../../contexts/EmbedWidgetsContext';
import { toast } from 'sonner';
import { safeClipboardCopy } from '../../utils/clipboard';

const PRIMARY = '#2563EB';
const NAVY    = '#06142B';
const CYAN    = '#0EA5E9';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';
const SLATE   = '#64748B';
const DARK    = '#0F172A';

const typeConfig: Record<string, any> = {
  sms:      { label: 'SMS',      Icon: MessageSquare, color: PRIMARY,   bg: `${PRIMARY}10`  },
  email:    { label: 'Email',    Icon: Mail,          color: '#8b5cf6', bg: '#8b5cf610'      },
  combined: { label: 'Combined', Icon: Layers,        color: CYAN,      bg: `${CYAN}10`      },
};

const statusConfig: Record<string, any> = {
  active:   { label: 'Active',   color: SUCCESS },
  disabled: { label: 'Disabled', color: DANGER  },
  pending:  { label: 'Pending',  color: WARNING },
};

const logStatusConfig: Record<string, any> = {
  delivered: { Icon: CheckCircle, color: SUCCESS },
  sent:      { Icon: CheckCircle, color: PRIMARY  },
  failed:    { Icon: XCircle,     color: DANGER   },
  pending:   { Icon: AlertCircle, color: WARNING  },
  blocked:   { Icon: AlertCircle, color: WARNING  },
};

// ─── Preview modal ────────────────────────────────────────────────────────────
function PreviewModal({ widgetId, widgetName, token, onClose }: { widgetId: string; widgetName: string; token: string; onClose: () => void }) {
  const [view, setView] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const views = [
    { id: 'desktop', label: 'Desktop',  Icon: Monitor,    w: '100%',  maxW: 800 },
    { id: 'tablet',  label: 'Tablet',   Icon: Tablet,     w: '100%',  maxW: 500 },
    { id: 'mobile',  label: 'Mobile',   Icon: Smartphone, w: '100%',  maxW: 360 },
  ];
  const current = views.find(v => v.id === view)!;
  const embedUrl = `/embed/${widgetId}?token=${encodeURIComponent(token)}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(6,20,43,0.7)', backdropFilter: 'blur(8px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: NAVY, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${PRIMARY}30` }}>
            <Eye size={15} style={{ color: CYAN }} />
          </div>
          <div>
            <div className="text-white text-sm" style={{ fontWeight: 700 }}>Widget Preview</div>
            <div className="text-[11px]" style={{ color: '#64748b' }}>{widgetName}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggles */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
            {views.map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: view === v.id ? PRIMARY : 'transparent',
                  color: view === v.id ? 'white' : '#94a3b8',
                  fontWeight: view === v.id ? 700 : 400,
                }}
              >
                <v.Icon size={12} />{v.label}
              </button>
            ))}
          </div>
          <a href={embedUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 600 }}
          >
            <ExternalLink size={12} /> Open tab
          </a>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors hover:bg-white/10" style={{ color: '#94a3b8' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Preview frame */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-8" style={{ background: '#0f172a' }}>
        <div
          className="w-full transition-all duration-300"
          style={{ maxWidth: current.maxW, minHeight: 600 }}
        >
          <iframe
            src={embedUrl}
            width="100%"
            height="720"
            style={{ border: 0, borderRadius: 18, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', display: 'block' }}
            title={widgetName}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function WidgetDetailPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const { getWidget, logs, toggleWidgetStatus } = useEmbedWidgets();
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);

  const widget = getWidget(widgetId!);
  if (!widget) return (
    <div className="p-8 text-center">
      <p style={{ color: SLATE }}>Widget not found.</p>
      <Link to="/user/embed-widgets" className="text-sm mt-2 inline-block" style={{ color: PRIMARY }}>Back to Widgets</Link>
    </div>
  );

  const tc = typeConfig[widget.type] || typeConfig.sms;
  const sc = statusConfig[widget.status] || statusConfig.disabled;
  const widgetLogs = logs.filter(l => l.widgetId === widget.id);

  const hostedUrl  = `${window.location.origin}/embed/${widget.id}?token=${encodeURIComponent(widget.token)}`;
  const iframeCode = `<iframe\n  src="${hostedUrl}"\n  width="100%"\n  height="720"\n  style="border:0;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,0.12);"\n  title="${widget.name} — VireSend Widget"\n  loading="lazy"\n></iframe>`;

  const copy = (text: string, label: string) => { safeClipboardCopy(text); toast.success(label); };

  return (
    <>
      {showPreview && <PreviewModal widgetId={widget.id} widgetName={widget.name} token={widget.token} onClose={() => setShowPreview(false)} />}

      <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/user/embed-widgets')} className="p-2 rounded-xl transition-colors hover:bg-slate-100">
              <ArrowLeft size={18} style={{ color: SLATE }} />
            </button>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tc.bg }}>
              <tc.Icon size={18} style={{ color: tc.color }} />
            </div>
            <div>
              <h1 className="text-xl" style={{ color: DARK, fontWeight: 800 }}>{widget.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono" style={{ color: SLATE }}>{widget.id}</span>
                <span className="flex items-center gap-1 text-xs" style={{ color: sc.color, fontWeight: 600 }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />{sc.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors"
              style={{ border: `1.5px solid rgba(37,99,235,0.2)`, color: PRIMARY, fontWeight: 600, background: `${PRIMARY}05` }}
            >
              <Eye size={14} /> Preview
            </button>
            <button
              onClick={() => navigate(`/user/embed-widgets/${widget.id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}, #1D4ED8)`, color: 'white', fontWeight: 700 }}
            >
              <Edit2 size={14} /> Edit
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
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors"
              style={{
                border: `1.5px solid ${widget.status === 'active' ? `${WARNING}40` : `${SUCCESS}40`}`,
                color: widget.status === 'active' ? WARNING : SUCCESS,
                fontWeight: 600,
                background: widget.status === 'active' ? `${WARNING}08` : `${SUCCESS}08`,
              }}
            >
              {widget.status === 'active' ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {widget.status === 'active' ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Sends', value: widget.totalSends.toLocaleString(), color: PRIMARY, bg: `${PRIMARY}10`, Icon: Activity },
            { label: 'Total Cost',  value: `GHS ${widget.totalCost.toFixed(2)}`,   color: SUCCESS, bg: `${SUCCESS}10`, Icon: Zap      },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: s.bg }}>
                <s.Icon size={15} style={{ color: s.color }} />
              </div>
              <div className="text-lg" style={{ color: DARK, fontWeight: 800 }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: SLATE }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Widget config */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="text-sm mb-4" style={{ color: DARK, fontWeight: 700 }}>Configuration</div>
            <div className="space-y-3">
              {[
                { label: 'Type',            value: tc.label,                       Icon: tc.Icon   },
                { label: 'Require Login',   value: widget.requireLogin ? 'Yes' : 'No',    Icon: Shield },
                { label: 'CAPTCHA',         value: widget.enableCaptcha ? 'Enabled' : 'Disabled', Icon: Shield },
                { label: 'Sender ID',       value: widget.defaultSenderId,          Icon: MessageSquare },
                { label: 'Webhook URL',     value: widget.webhookUrl || 'Not set',  Icon: Globe },
                { label: 'Created',         value: widget.createdAt,                Icon: Clock },
                { label: 'Last Used',       value: widget.lastUsed,                 Icon: Clock },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: SLATE }}>
                    <row.Icon size={13} style={{ color: '#94a3b8' }} />{row.label}
                  </div>
                  <div className="text-sm text-right max-w-[180px] truncate" style={{ color: DARK, fontWeight: 600 }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Embed codes */}
          <div className="space-y-4">
            {/* Hosted link */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3">
                <ExternalLink size={14} style={{ color: CYAN }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Hosted Page Link</span>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 rounded-xl text-xs font-mono overflow-hidden" style={{ background: '#f1f5f9', color: '#374151' }}>
                  {hostedUrl}
                </code>
                <button onClick={() => copy(hostedUrl, 'Link copied!')} className="px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors" style={{ border: '1.5px solid #e2e8f0' }}>
                  <Copy size={13} style={{ color: SLATE }} />
                </button>
                <a href={`/embed/${widget.id}?token=${encodeURIComponent(widget.token)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors" style={{ border: `1.5px solid rgba(37,99,235,0.2)` }}>
                  <Eye size={13} style={{ color: PRIMARY }} />
                </a>
              </div>
            </div>

            {/* Widget token */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} style={{ color: SUCCESS }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Secure Widget Token</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${SUCCESS}10`, color: SUCCESS, fontWeight: 700 }}>NOT your API key</span>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 rounded-xl text-xs font-mono overflow-hidden" style={{ background: '#f1f5f9', color: '#374151', wordBreak: 'break-all' }}>
                  {widget.token}
                </code>
                <button onClick={() => copy(widget.token, 'Token copied!')} className="px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors" style={{ border: '1.5px solid #e2e8f0' }}>
                  <Copy size={13} style={{ color: SLATE }} />
                </button>
              </div>
            </div>

            {/* iframe code */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Code2 size={14} style={{ color: PRIMARY }} />
                  <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>iframe Embed Code</span>
                </div>
                <button
                  onClick={() => copy(iframeCode, 'iframe code copied!')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors"
                  style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 700 }}
                >
                  <Copy size={11} /> Copy
                </button>
              </div>
              <pre
                className="text-xs rounded-xl p-3 overflow-x-auto leading-relaxed"
                style={{ background: '#0f172a', color: '#94a3b8', fontFamily: 'monospace' }}
              >
                <code style={{ color: '#e2e8f0' }}>{iframeCode}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Widget logs */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#f8faff' }}>
            <div className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Send Logs</div>
            <div className="text-xs mt-0.5" style={{ color: SLATE }}>All sends made through this widget</div>
          </div>
          {widgetLogs.length === 0 ? (
            <div className="p-10 text-center">
              <BarChart2 size={32} style={{ color: '#e2e8f0', margin: '0 auto 12px' }} />
              <p className="text-sm" style={{ color: SLATE }}>No sends yet through this widget.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    {['Type', 'Recipient', 'Status', 'Cost', 'Date'].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 text-[11px] uppercase tracking-wide" style={{ color: SLATE, fontWeight: 700 }}>{h}</th>
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
                        <td className="px-5 py-3.5 text-sm" style={{ color: SLATE, fontWeight: 600 }}>{log.cost > 0 ? `GHS ${log.cost.toFixed(2)}` : '—'}</td>
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
    </>
  );
}



