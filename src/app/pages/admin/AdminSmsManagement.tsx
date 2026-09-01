import { useEffect, useMemo, useState } from 'react';
import { Search, Download, Eye, RefreshCw, MessageSquare, CheckCircle, XCircle, Clock, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminSmsLogs, getAdminSmsStats } from '../../../lib/api.js';
import { formatCurrency } from '../../utils/currency';

type SmsLog = {
  id: string;
  sms_id: string;
  user_name: string;
  recipient: string;
  recipient_count: number;
  sender_id: string;
  message_preview: string;
  message: string;
  type: string;
  status: string;
  total_cost: number;
  created_at: string;
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700', icon: Clock },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  partial: { label: 'Partially Sent', color: 'bg-orange-100 text-orange-700', icon: Clock },
};

export default function AdminSmsManagement() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [stats, setStats] = useState({ total: 0, delivered: 0, failed: 0, pending: 0, revenue: 0, cost: 0, profit: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [previewMsg, setPreviewMsg] = useState<SmsLog | null>(null);

  const loadSms = async () => {
    try {
      setLoading(true);
      const [logsResponse, statsResponse] = await Promise.all([
        getAdminSmsLogs({ status: statusFilter, type: typeFilter }),
        getAdminSmsStats(),
      ]);
      setLogs(logsResponse.logs || []);
      setStats(statsResponse.stats || stats);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load SMS logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSms();
  }, [statusFilter, typeFilter]);

  const filtered = useMemo(() => logs.filter(s => {
    const query = search.toLowerCase();
    return !query
      || (s.user_name || '').toLowerCase().includes(query)
      || (s.recipient || '').includes(search)
      || (s.sender_id || '').toLowerCase().includes(query)
      || (s.message_preview || '').toLowerCase().includes(query)
      || (s.sms_id || '').toLowerCase().includes(query);
  }), [logs, search]);

  const exportCsv = () => {
    const rows = [
      ['SMS ID', 'User', 'Recipient', 'Sender ID', 'Message', 'Type', 'Status', 'Cost', 'Date'],
      ...filtered.map(sms => [sms.sms_id, sms.user_name, sms.recipient, sms.sender_id, sms.message_preview, sms.type, sms.status, String(sms.total_cost), sms.created_at || '']),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viresend-admin-sms-logs.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>SMS Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monitor all SMS messages sent through the platform.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadSms} className="hidden sm:flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={exportCsv} className="hidden sm:flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <Download className="w-4 h-4" />Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total SMS', value: stats.total, color: 'text-blue-600' },
          { label: 'Delivered', value: stats.delivered, color: 'text-emerald-600' },
          { label: 'Failed', value: stats.failed, color: 'text-red-600' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
          { label: 'Revenue', value: formatCurrency(stats.revenue), color: 'text-purple-600' },
          { label: 'Cost', value: formatCurrency(stats.cost), color: 'text-gray-600' },
          { label: 'Profit', value: formatCurrency(stats.profit), color: 'text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className={`text-xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search user, recipient, sender ID..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['all','delivered','submitted','failed','pending'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{s}</button>
          ))}
          <div className="w-px bg-gray-200" />
          {['all','single','bulk','campaign'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors ${typeFilter === t ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['SMS ID','User','Recipient','Sender ID','Message','Type','Status','Cost','Date','Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading SMS logs...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No SMS logs found.</td></tr>
              ) : filtered.map(sms => {
                const sc = statusConfig[sms.status] || statusConfig.pending;
                return (
                  <tr key={sms.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-600">{sms.sms_id}</span></td>
                    <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>{sms.user_name || 'Unknown'}</td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-gray-600">{sms.recipient}</span>
                      {sms.recipient_count > 1 && <div className="text-xs text-gray-400">{sms.recipient_count} recipients</div>}
                    </td>
                    <td className="px-4 py-3.5"><span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg" style={{ fontWeight: 600 }}>{sms.sender_id}</span></td>
                    <td className="px-4 py-3.5 max-w-[180px]"><p className="text-xs text-gray-500 truncate">{sms.message_preview}</p></td>
                    <td className="px-4 py-3.5"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full capitalize" style={{ fontWeight: 500 }}>{sms.type}</span></td>
                    <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${sc.color}`} style={{ fontWeight: 500 }}><sc.icon className="w-3 h-3" />{sc.label}</span></td>
                    <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 600 }}>{formatCurrency(sms.total_cost, 3)}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{sms.created_at ? new Date(sms.created_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3.5"><button onClick={() => setPreviewMsg(sms)} className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg transition-colors" title="View"><Eye className="w-3.5 h-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filtered.length} of {logs.length} messages</span>
          <span>Delivery Rate: <span style={{ fontWeight: 600 }} className="text-emerald-600">{stats.total ? ((stats.delivered / stats.total) * 100).toFixed(1) : '0.0'}%</span></span>
        </div>
      </div>

      {previewMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewMsg(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>SMS Details - {previewMsg.sms_id}</h2>
              <button onClick={() => setPreviewMsg(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-3">
              {[['User', previewMsg.user_name], ['Recipient', previewMsg.recipient], ['Sender ID', previewMsg.sender_id], ['Type', previewMsg.type], ['Status', previewMsg.status], ['Cost', formatCurrency(previewMsg.total_cost, 3)], ['Date', previewMsg.created_at ? new Date(previewMsg.created_at).toLocaleString() : '-']].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-24 flex-shrink-0 pt-0.5" style={{ fontWeight: 600 }}>{k}</span>
                  <span className="text-sm text-gray-700 capitalize">{v}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-2" style={{ fontWeight: 600 }}>Message Content</div>
                <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">{previewMsg.message}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
