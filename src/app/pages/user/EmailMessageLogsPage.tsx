import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle, ChevronRight, Clock, Copy, Download,
  Eye, Filter, Mail, RefreshCw, Search, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { getEmailLogs, syncEmailStatus } from '../../../lib/api.js';
import { safeClipboardCopy } from '../../utils/clipboard';
import { formatCurrency } from '../../utils/currency';

type EmailStatus = 'queued' | 'sent' | 'failed' | 'bounced' | 'unknown';
type EmailType = 'single' | 'bulk' | 'campaign';

interface EmailLog {
  id: string;
  email_id: string;
  provider: string;
  from_email: string;
  to_email: string;
  recipients: string[];
  recipient_count: number;
  subject: string;
  message_preview: string;
  format: 'plain' | 'html';
  type: EmailType;
  status: EmailStatus;
  delivery_status: 'accepted' | 'undelivered' | 'unknown';
  bounce_reason?: string;
  total_cost: number;
  error_message?: string;
  sent_at?: string | null;
  bounced_at?: string | null;
  created_at: string;
}

const statusConfig: Record<EmailStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  queued: { label: 'Queued', color: 'bg-blue-100 text-blue-700', icon: Clock },
  sent: { label: 'Sent', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  bounced: { label: 'Bounced', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  unknown: { label: 'Unknown', color: 'bg-gray-100 text-gray-600', icon: Clock },
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nextDateString(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

export default function EmailMessageLogsPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmailStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EmailType>('all');
  const [dateFrom, setDateFrom] = useState(todayString());
  const [dateTo, setDateTo] = useState(todayString());
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [syncingStatus, setSyncingStatus] = useState(false);
  const autoSyncedRef = useRef(false);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await getEmailLogs({
        status: statusFilter,
        type: typeFilter,
        date_from: `${dateFrom}T00:00:00`,
        date_to: `${nextDateString(dateTo)}T00:00:00`,
      });
      setLogs(response.logs || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load email message logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [statusFilter, typeFilter, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return logs.filter(log => {
      const recipients = [log.to_email, ...(log.recipients || [])].join(' ');
      return !query ||
        (log.email_id || '').toLowerCase().includes(query) ||
        (log.subject || '').toLowerCase().includes(query) ||
        (log.from_email || '').toLowerCase().includes(query) ||
        recipients.toLowerCase().includes(query) ||
        (log.message_preview || '').toLowerCase().includes(query);
    });
  }, [logs, search]);

  const stats = useMemo(() => ({
    total: logs.reduce((sum, log) => sum + (log.recipient_count || 0), 0),
    sent: logs.filter(log => log.status === 'sent').reduce((sum, log) => sum + (log.recipient_count || 0), 0),
    failed: logs.filter(log => log.status === 'failed').reduce((sum, log) => sum + (log.recipient_count || 0), 0),
    bounced: logs.filter(log => log.status === 'bounced').reduce((sum, log) => sum + (log.recipient_count || 0), 0),
    queued: logs.filter(log => log.status === 'queued').reduce((sum, log) => sum + (log.recipient_count || 0), 0),
    cost: logs.reduce((sum, log) => sum + (log.total_cost || 0), 0),
  }), [logs]);

  const exportCsv = () => {
    const rows = [
      ['Email ID', 'Type', 'From', 'Recipients', 'Subject', 'Status', 'Cost', 'Date', 'Preview'],
      ...filtered.map(log => [
        log.email_id,
        log.type,
        log.from_email,
        log.to_email || (log.recipients || []).join('; '),
        log.subject,
        log.status,
        String(log.total_cost || 0),
        log.created_at || '',
        log.message_preview || '',
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `viresend-email-message-logs-${dateFrom}-to-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copy = (value: string) => {
    safeClipboardCopy(value);
    toast.success('Copied.');
  };

  const syncStatus = async (silent = false) => {
    try {
      setSyncingStatus(true);
      const response = await syncEmailStatus();
      if (!silent) toast.success(`Status synced. ${response.updated || 0} log(s) updated.`);
      await loadLogs();
    } catch (error: any) {
      if (!silent || error?.status !== 429) {
        toast.error(error?.data?.message || error?.message || 'Unable to sync Gmail status.');
      }
    } finally {
      setSyncingStatus(false);
    }
  };

  useEffect(() => {
    if (autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    syncStatus(true);
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Email Message Logs</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track sent, failed, bounced, queued, and unknown email statuses. Today is shown by default.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => syncStatus(false)} disabled={syncingStatus} className="flex items-center gap-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 px-4 py-2 rounded-xl text-sm transition-colors">
            <RefreshCw className={`w-4 h-4 ${syncingStatus ? 'animate-spin' : ''}`} />
            Sync Status
          </button>
          <button onClick={loadLogs} className="p-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportCsv} className="hidden sm:flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Messages', value: stats.total, color: 'text-blue-600' },
          { label: 'Sent', value: stats.sent, color: 'text-emerald-600' },
          { label: 'Failed', value: stats.failed, color: 'text-red-500' },
          { label: 'Bounced', value: stats.bounced, color: 'text-orange-600' },
          { label: 'Queued', value: stats.queued, color: 'text-blue-600' },
          { label: 'Cost', value: formatCurrency(stats.cost, 3), color: 'text-purple-600' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className={`text-base ${item.color}`} style={{ fontWeight: 700 }}>{item.value}</div>
            <div className="text-gray-400 text-xs mt-0.5 leading-tight">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by recipient, sender, subject, preview, or email ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <button onClick={() => setShowFilters(value => !value)} className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm transition-colors ${showFilters ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid md:grid-cols-4 gap-4">
            <FilterButtons label="Status" value={statusFilter} values={['all', 'queued', 'sent', 'failed', 'bounced', 'unknown']} onChange={setStatusFilter as any} />
            <FilterButtons label="Type" value={typeFilter} values={['all', 'single', 'bulk', 'campaign']} onChange={setTypeFilter as any} />
            <div>
              <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>From date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value || todayString())} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>To date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value || todayString())} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
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
                {['Email ID', 'Type', 'From', 'Recipients', 'Subject', 'Status', 'Delivery', 'Sent', 'Cost'].map(head => (
                  <th key={head} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Loading email message logs...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No email messages found for this filter.</td></tr>
              ) : filtered.map(log => {
                const statusInfo = statusConfig[log.status] || statusConfig.unknown;
                const StatusIcon = statusInfo.icon;
                const isExpanded = expandedRow === log.id;
                const recipientText = log.to_email || (log.recipients || []).join(', ');
                return (
                  <Fragment key={log.id}>
                    <tr className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-50/30' : ''}`} onClick={() => setExpandedRow(isExpanded ? null : log.id)}>
                      <td className="px-4 py-3.5"><ChevronRight className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                      <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-500">{log.email_id}</span></td>
                      <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 capitalize" style={{ fontWeight: 500 }}><Mail className="w-3 h-3" />{log.type}</span></td>
                      <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-600">{log.from_email}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-700 max-w-[180px] truncate">{recipientText}</span>
                          <button onClick={event => { event.stopPropagation(); copy(recipientText); }} className="p-1 hover:bg-gray-100 rounded"><Copy className="w-3 h-3 text-gray-300" /></button>
                        </div>
                        {log.recipient_count > 1 && <div className="text-xs text-gray-400">{log.recipient_count} recipients</div>}
                      </td>
                      <td className="px-4 py-3.5"><p className="text-sm text-gray-600 max-w-[220px] truncate">{log.subject}</p></td>
                      <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${statusInfo.color}`} style={{ fontWeight: 500 }}><StatusIcon className="w-3 h-3" />{statusInfo.label}</span></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-500 capitalize">{log.delivery_status || 'unknown'}</span></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400 whitespace-nowrap">{log.sent_at ? new Date(log.sent_at).toLocaleString() : log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</span></td>
                      <td className="px-4 py-3.5"><span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{formatCurrency(log.total_cost || 0, 3)}</span></td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50/40">
                        <td />
                        <td colSpan={8} className="px-4 py-4">
                          <div className="bg-white rounded-xl border border-gray-100 p-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2" style={{ fontWeight: 600 }}><Eye className="w-3.5 h-3.5" />Message Preview</div>
                            <p className="text-sm text-gray-700 leading-relaxed">{log.message_preview || '-'}</p>
                            {(log.bounce_reason || log.error_message) && (
                              <div className="mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                                {log.bounce_reason || log.error_message}
                              </div>
                            )}
                            {log.bounced_at && <div className="mt-3 text-xs text-orange-600">Bounced at {new Date(log.bounced_at).toLocaleString()}</div>}
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
            <span className="text-sm text-gray-500">Showing {filtered.length} of {logs.length} email log records</span>
            <span className="text-sm text-gray-500">Filtered cost: <span style={{ fontWeight: 600 }} className="text-gray-700">{formatCurrency(filtered.reduce((sum, log) => sum + (log.total_cost || 0), 0), 3)}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterButtons({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: any) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <div className="flex gap-2 flex-wrap">
        {values.map(item => (
          <button key={item} onClick={() => onChange(item)} className={`px-3 py-1.5 rounded-full text-xs capitalize transition-colors ${value === item ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {labels[item] || item}
          </button>
        ))}
      </div>
    </div>
  );
}
