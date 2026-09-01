import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Search, Filter, CheckCircle, XCircle, Clock,
  Download, MessageSquare, Copy, RefreshCw, Eye,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { getSmsHistory } from '../../../lib/api.js';
import { safeClipboardCopy } from '../../utils/clipboard';
import { formatCurrency } from '../../utils/currency';

type LogStatus = 'delivered' | 'failed' | 'partial' | 'pending' | 'submitted' | 'accepted' | 'processing';

interface SmsLog {
  id: string;
  sms_id: string;
  recipient: string;
  sender_id: string;
  message: string;
  message_preview: string;
  status: LogStatus;
  type: 'single' | 'bulk' | 'campaign';
  total_cost: number;
  recipient_count: number;
  sms_units: number;
  created_at: string;
}

const statusConfig: Record<LogStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  partial: { label: 'Partially Sent', color: 'bg-orange-100 text-orange-700', icon: Clock },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700', icon: Clock },
};

export default function LogsPage() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'single' | 'bulk' | 'campaign'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | LogStatus>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await getSmsHistory({ type: typeFilter, status: statusFilter });
      setLogs(response.logs || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load SMS logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [typeFilter, statusFilter]);

  const filtered = useMemo(() => {
    return logs.filter(log => {
      const query = search.toLowerCase();
      const matchSearch = !query ||
        log.recipient.includes(search) ||
        log.message.toLowerCase().includes(query) ||
        log.sms_id.toLowerCase().includes(query) ||
        log.sender_id.toLowerCase().includes(query);
      const matchDate = !dateFilter || (log.created_at || '').startsWith(dateFilter);
      return matchSearch && matchDate;
    });
  }, [logs, search, dateFilter]);

  const stats = useMemo(() => ({
    total: logs.length,
    delivered: logs.filter(l => l.status === 'delivered').length,
    failed: logs.filter(l => l.status === 'failed').length,
    pending: logs.filter(l => ['pending', 'submitted', 'accepted', 'processing'].includes(l.status)).length,
    totalCost: logs.reduce((sum, log) => sum + (log.total_cost || 0), 0),
  }), [logs]);

  const copyToClipboard = (text: string) => {
    safeClipboardCopy(text);
    toast.success('Copied!');
  };

  const exportCsv = () => {
    const rows = [
      ['SMS ID', 'Type', 'Recipient', 'Sender ID', 'Status', 'Cost', 'Date', 'Message'],
      ...filtered.map(log => [log.sms_id, log.type, log.recipient, log.sender_id, log.status, String(log.total_cost), log.created_at || '', log.message]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viresend-sms-history.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Message Logs</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your SMS history with delivery status and wallet cost.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadLogs} className="p-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportCsv} className="hidden sm:flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total SMS', value: stats.total, color: 'text-blue-600' },
          { label: 'Delivered', value: stats.delivered, color: 'text-emerald-600' },
          { label: 'Failed', value: stats.failed, color: 'text-red-500' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
          { label: 'Total Cost', value: formatCurrency(stats.totalCost), color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className={`text-base ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-400 text-xs mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by recipient, sender ID, message, or SMS ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <button onClick={() => setShowFilters(p => !p)} className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm transition-colors ${showFilters ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid sm:grid-cols-3 gap-4">
            <FilterButtons label="Type" value={typeFilter} values={['all', 'single', 'bulk', 'campaign']} onChange={setTypeFilter as any} />
            <FilterButtons label="Status" value={statusFilter} values={['all', 'delivered', 'submitted', 'failed', 'pending']} onChange={setStatusFilter as any} />
            <div>
              <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>Date</label>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-8 px-4 py-3.5" />
                {['SMS ID', 'Type', 'Recipient', 'Sender ID', 'Message', 'Status', 'Date', 'Cost'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Loading SMS logs...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No SMS logs found.</td></tr>
              ) : filtered.map(log => {
                const s = statusConfig[log.status] || statusConfig.pending;
                const isExpanded = expandedRow === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-50/30' : ''}`} onClick={() => setExpandedRow(isExpanded ? null : log.id)}>
                      <td className="px-4 py-3.5"><ChevronRight className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                      <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-500">{log.sms_id}</span></td>
                      <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 capitalize" style={{ fontWeight: 500 }}><MessageSquare className="w-3 h-3" />{log.type}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-gray-700">{log.recipient}</span>
                          <button onClick={e => { e.stopPropagation(); copyToClipboard(log.recipient); }} className="p-1 hover:bg-gray-100 rounded transition-colors"><Copy className="w-3 h-3 text-gray-300" /></button>
                        </div>
                        {log.recipient_count > 1 && <div className="text-xs text-gray-400">{log.recipient_count} recipients</div>}
                      </td>
                      <td className="px-4 py-3.5"><span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg" style={{ fontWeight: 600 }}>{log.sender_id}</span></td>
                      <td className="px-4 py-3.5"><p className="text-sm text-gray-600 max-w-[220px] truncate">{log.message_preview}</p></td>
                      <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${s.color}`} style={{ fontWeight: 500 }}><s.icon className="w-3 h-3" />{s.label}</span></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400 whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</span></td>
                      <td className="px-4 py-3.5"><span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{formatCurrency(log.total_cost, 3)}</span></td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50/40">
                        <td />
                        <td colSpan={7} className="px-4 py-4">
                          <div className="bg-white rounded-xl border border-gray-100 p-4">
                            <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 600 }}>Full Message</div>
                            <p className="text-sm text-gray-700 leading-relaxed">{log.message}</p>
                            <div className="mt-3 text-xs text-gray-400">SMS units: {log.sms_units}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-sm text-gray-500">Showing {filtered.length} of {logs.length} SMS logs</span>
            <span className="text-sm text-gray-500">Total cost: <span style={{ fontWeight: 600 }} className="text-gray-700">{formatCurrency(filtered.reduce((s, l) => s + l.total_cost, 0), 3)}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterButtons({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: any) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <div className="flex gap-2 flex-wrap">
        {values.map(item => (
          <button key={item} onClick={() => onChange(item)} className={`px-3 py-1.5 rounded-full text-xs capitalize transition-colors ${value === item ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{item}</button>
        ))}
      </div>
    </div>
  );
}
