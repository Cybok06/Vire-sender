import { useEffect, useMemo, useState } from 'react';
import { Search, Download, MessageSquare, Mail, CheckCircle, XCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminEmailLogs, getAdminSmsLogs } from '../../../lib/api.js';

type LogItem = {
  id: string;
  type: 'SMS' | 'Email';
  user: string;
  recipient: string;
  preview: string;
  provider: string;
  status: string;
  cost: number;
  date: string;
};

const typeConfig: Record<string, { color: string; bg: string; icon: typeof MessageSquare }> = {
  SMS: { color: 'text-blue-700', bg: 'bg-blue-100', icon: MessageSquare },
  Email: { color: 'text-indigo-700', bg: 'bg-indigo-100', icon: Mail },
};

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  delivered: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  sent: { color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  pending: { color: 'bg-amber-100 text-amber-700', icon: Clock },
  queued: { color: 'bg-blue-100 text-blue-700', icon: Clock },
  failed: { color: 'bg-red-100 text-red-700', icon: XCircle },
  bounced: { color: 'bg-orange-100 text-orange-700', icon: XCircle },
  unknown: { color: 'bg-gray-100 text-gray-600', icon: RefreshCw },
  refunded: { color: 'bg-gray-100 text-gray-600', icon: RefreshCw },
};

function mapSmsLog(log: any): LogItem {
  return {
    id: log.sms_id || log.id,
    type: 'SMS',
    user: log.user_name || log.user || 'Unknown',
    recipient: log.recipient || (log.recipients || []).join(', '),
    preview: log.message_preview || log.message || '',
    provider: log.provider || 'arkesel',
    status: log.status || 'pending',
    cost: Number(log.total_cost || 0),
    date: log.created_at || log.createdAt || '',
  };
}

function mapEmailLog(log: any): LogItem {
  return {
    id: log.email_id || log.id,
    type: 'Email',
    user: log.user || 'Unknown',
    recipient: log.to_email || (log.recipients || []).slice(0, 2).join(', ') || `${log.recipient_count || 0} recipients`,
    preview: log.subject || log.message_preview || '',
    provider: log.provider || 'email',
    status: log.status || 'sent',
    cost: Number(log.total_cost || 0),
    date: log.created_at || '',
  };
}

export default function AdminMessageLogs() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const [smsResponse, emailResponse] = await Promise.all([getAdminSmsLogs(), getAdminEmailLogs()]);
      const merged = [
        ...(smsResponse.logs || []).map(mapSmsLog),
        ...(emailResponse.logs || []).map(mapEmailLog),
      ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setLogs(merged);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load message logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filtered = useMemo(() => logs.filter(l => {
    const query = search.toLowerCase();
    const matchSearch = !query || l.user.toLowerCase().includes(query) || l.recipient.toLowerCase().includes(query) || l.preview.toLowerCase().includes(query);
    const matchType = typeFilter === 'all' || l.type === typeFilter;
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    const matchProvider = providerFilter === 'all' || l.provider === providerFilter;
    return matchSearch && matchType && matchStatus && matchProvider;
  }), [logs, search, typeFilter, statusFilter, providerFilter]);

  const providers = ['all', ...Array.from(new Set(logs.map(l => l.provider).filter(Boolean)))];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Message Logs</h1>
          <p className="text-gray-500 text-sm mt-0.5">Unified log of all SMS and Email activity.</p>
        </div>
        <button onClick={() => toast.success('Export coming from connected logs.')} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
          <Download className="w-4 h-4" />Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Logs', value: logs.length, color: 'text-blue-600' },
          { label: 'Accepted', value: logs.filter(l => ['delivered', 'sent'].includes(l.status)).length, color: 'text-emerald-600' },
          { label: 'Failed', value: logs.filter(l => ['failed', 'bounced'].includes(l.status)).length, color: 'text-red-600' },
          { label: 'Total Cost', value: `GHS ${logs.reduce((a, l) => a + l.cost, 0).toFixed(2)}`, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search user, recipient, or message..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'SMS', 'Email'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1.5 rounded-xl text-xs transition-colors ${typeFilter === t ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{t}</button>
          ))}
          <div className="w-px bg-gray-200" />
          {['all', 'delivered', 'sent', 'queued', 'pending', 'failed', 'bounced', 'unknown'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-xl text-xs capitalize transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600'}`}>{s}</button>
          ))}
          <div className="w-px bg-gray-200" />
          {providers.map(p => (
            <button key={p} onClick={() => setProviderFilter(p)} className={`px-3 py-1.5 rounded-xl text-xs transition-colors ${providerFilter === p ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-600'}`}>{p === 'all' ? 'All Providers' : p}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Log ID', 'Type', 'User', 'Recipient', 'Message Preview', 'Provider', 'Status', 'Cost', 'Date'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading logs...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">No logs found.</td></tr>
              ) : filtered.map(log => {
                const tc = typeConfig[log.type];
                const TypeIcon = tc.icon;
                const sc = statusConfig[log.status] ?? statusConfig.unknown;
                const StatusIcon = sc.icon;
                return (
                  <tr key={`${log.type}-${log.id}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-500">{log.id}</span></td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${tc.bg} ${tc.color}`} style={{ fontWeight: 600 }}>
                        <TypeIcon className="w-3 h-3" />{log.type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>{log.user}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{log.recipient}</td>
                    <td className="px-4 py-3.5 max-w-[240px]"><p className="text-xs text-gray-500 truncate">{log.preview}</p></td>
                    <td className="px-4 py-3.5"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">{log.provider}</span></td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${sc.color}`} style={{ fontWeight: 500 }}>
                        <StatusIcon className="w-3 h-3" />{log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 600 }}>GHS {log.cost.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{log.date ? new Date(log.date).toLocaleString() : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filtered.length} of {logs.length} logs</span>
          <span>Total Cost: <span style={{ fontWeight: 600 }} className="text-gray-700">GHS {filtered.reduce((a, l) => a + l.cost, 0).toFixed(2)}</span></span>
        </div>
      </div>
    </div>
  );
}
