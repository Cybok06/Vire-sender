import { useEffect, useState } from 'react';
import { AlertCircle, Eye, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { getAdminSmsmanRequestLog, getAdminSmsmanRequestLogs } from '../../../lib/api.js';

type SmsmanLog = {
  id: string;
  action: string;
  status: string;
  request_id: string;
  user_id: string;
  otp_order_id: string;
  order_id?: string;
  endpoint: string;
  error_code: string;
  error_msg: string;
  duration_ms: number;
  created_at: string | null;
  request_params_safe?: Record<string, any>;
  response_safe?: Record<string, any>;
};

function dateLabel(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusClass(status: string) {
  if (status === 'success') return 'bg-emerald-100 text-emerald-700';
  if (status === 'waiting') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function paramsSummary(params?: Record<string, any>) {
  if (!params) return '-';
  const keys = ['country_id', 'application_id', 'maxPrice', 'currency'];
  const parts = keys
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${key}: ${params[key]}`);
  return parts.length ? parts.join(' | ') : '-';
}

function shortId(value?: string) {
  return value ? value.slice(-8) : '-';
}

function rowTone(log: SmsmanLog) {
  if (log.action === 'get_number' && log.error_code === 'request_timeout') {
    return 'bg-red-50/70 hover:bg-red-50';
  }
  return 'hover:bg-gray-50/60';
}

export default function AdminSmsmanRequests() {
  const [logs, setLogs] = useState<SmsmanLog[]>([]);
  const [selected, setSelected] = useState<SmsmanLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 30 });
  const [filters, setFilters] = useState({
    action: 'all',
    status: 'all',
    request_id: '',
    user_id: '',
    date_from: '',
    date_to: '',
  });

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminSmsmanRequestLogs({
        ...filters,
        page: String(page),
        limit: '30',
      });
      setLogs(response.logs || []);
      setPagination(response.pagination || { page, pages: 1, total: 0, limit: 30 });
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Unable to load SMS-MAN request logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page]);

  const applyFilters = () => {
    setPage(1);
    setTimeout(loadLogs, 0);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const response = await getAdminSmsmanRequestLog(id);
      setSelected(response.log);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>SMS-MAN Requests</h1>
          <p className="text-gray-500 text-sm mt-0.5">Provider API request logs for balance, number purchase, SMS checks, and status updates.</p>
        </div>
        <button onClick={loadLogs} disabled={loading} className="flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
          <select value={filters.action} onChange={e => setFilters(prev => ({ ...prev, action: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
            <option value="all">All actions</option>
            <option value="get_balance">get_balance</option>
            <option value="get_number">get_number</option>
            <option value="limits">limits</option>
            <option value="get_sms">get_sms</option>
            <option value="set_status">set_status</option>
            <option value="sync_countries">sync_countries</option>
            <option value="sync_services">sync_services</option>
          </select>
          <select value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="waiting">Waiting</option>
          </select>
          <input value={filters.request_id} onChange={e => setFilters(prev => ({ ...prev, request_id: e.target.value }))} placeholder="Request ID" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          <input value={filters.user_id} onChange={e => setFilters(prev => ({ ...prev, user_id: e.target.value }))} placeholder="User ID" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          <input type="date" value={filters.date_from} onChange={e => setFilters(prev => ({ ...prev, date_from: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          <input type="date" value={filters.date_to} onChange={e => setFilters(prev => ({ ...prev, date_to: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
        </div>
        <button onClick={applyFilters} className="mt-3 flex items-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-2.5 text-sm" style={{ fontWeight: 600 }}>
          <Search className="w-4 h-4" />
          Apply Filters
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Action', 'Status', 'Request Params', 'Request ID', 'User', 'Order ID', 'Endpoint', 'Error Code', 'Duration', ''].map(header => (
                  <th key={header} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 700 }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={11} className="py-14 text-center text-gray-400"><Loader2 className="w-7 h-7 mx-auto mb-2 animate-spin" />Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={11} className="py-14 text-center text-gray-400">No SMS-MAN requests found.</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className={rowTone(log)}>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{dateLabel(log.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {log.action}
                    {log.action === 'get_number' && log.error_code === 'request_timeout' && (
                      <div className="text-[11px] text-red-600" style={{ fontWeight: 700 }}>Timeout refunded</div>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs capitalize ${statusClass(log.status)}`} style={{ fontWeight: 700 }}>{log.status}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-[260px] truncate">{paramsSummary(log.request_params_safe)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{log.request_id || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(log.user_id)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(log.order_id || log.otp_order_id)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[240px] truncate">{log.endpoint}</td>
                  <td className="px-4 py-3 text-xs text-red-500">{log.error_code || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{log.duration_ms}ms</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(log.id)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="View details">
                      {detailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-500">
          <span>Showing {logs.length} of {pagination.total} logs</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1 || loading} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50">Previous</button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button onClick={() => setPage(prev => Math.min(pagination.pages, prev + 1))} disabled={page >= pagination.pages || loading} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg text-gray-800" style={{ fontWeight: 800 }}>Request Details</h2>
                <p className="text-xs text-gray-400">{selected.action} - {dateLabel(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
              <DetailBlock title="Safe Request Params" data={selected.request_params_safe || {}} />
              <DetailBlock title="Safe Response" data={selected.response_safe || {}} />
              {selected.error_msg && <DetailBlock title="Error" data={{ code: selected.error_code, message: selected.error_msg }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBlock({ title, data }: { title: string; data: any }) {
  return (
    <div>
      <h3 className="text-sm text-gray-700 mb-2" style={{ fontWeight: 700 }}>{title}</h3>
      <pre className="bg-gray-950 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
