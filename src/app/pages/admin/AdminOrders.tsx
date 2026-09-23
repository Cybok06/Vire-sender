import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, XCircle, CheckCircle, Clock, AlertCircle, Download, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cancelAdminOtpOrder, getAdminOtpOrders, pollAdminSmsmanOtps, refundAdminOtpOrder } from '../../../lib/api.js';

type AdminOtpOrder = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  provider: string;
  mode: string;
  service_name: string;
  service_code: string;
  service_image_url: string;
  country_name: string;
  country_code: string;
  country_flag_image: string;
  phone_number: string;
  otp_code: string;
  price: number;
  currency: string;
  status: 'waiting' | 'received' | 'expired' | 'cancelled' | string;
  raw_status: string;
  expires_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
};

type AdminOtpStats = {
  total: number;
  active: number;
  received: number;
  expired: number;
  cancelled: number;
  revenue: number;
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  received: { label: 'Received', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  processing: { label: 'Processing', color: 'bg-indigo-100 text-indigo-700', icon: Loader2 },
  waiting: { label: 'Waiting', color: 'bg-blue-100 text-blue-700', icon: Clock },
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700', icon: Clock },
  expired: { label: 'Expired', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
};

function dateLabel(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function money(value: number, currency = 'GHS') {
  return `${currency} ${(Number(value) || 0).toFixed(2)}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOtpOrder[]>([]);
  const [stats, setStats] = useState<AdminOtpStats>({ total: 0, active: 0, received: 0, expired: 0, cancelled: 0, revenue: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminOtpOrders({
        q: debouncedSearch,
        status: statusFilter,
        page: String(page),
        limit: '25',
      });
      setOrders(response.orders || []);
      setStats(response.stats || { total: 0, active: 0, received: 0, expired: 0, cancelled: 0, revenue: 0 });
      setPagination(response.pagination || { page, limit: 25, total: 0, pages: 1 });
      setSelectedOrders([]);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Unable to load OTP orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const selected = useMemo(() => orders.filter(order => selectedOrders.includes(order.id)), [orders, selectedOrders]);

  const handleCancel = async (orderId: string) => {
    setActionLoading(`cancel:${orderId}`);
    try {
      await cancelAdminOtpOrder(orderId);
      toast.success('OTP order cancelled.');
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to cancel OTP order.');
    } finally {
      setActionLoading('');
    }
  };

  const handleRefund = async (orderId: string) => {
    setActionLoading(`refund:${orderId}`);
    try {
      await refundAdminOtpOrder(orderId);
      toast.success('OTP order refunded.');
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to refund OTP order.');
    } finally {
      setActionLoading('');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelectedOrders(prev => prev.length === orders.length ? [] : orders.map(order => order.id));
  };

  const exportCsv = () => {
    const headers = ['Order ID', 'User', 'Email', 'Service', 'Country', 'Number', 'OTP', 'Status', 'Price', 'Created'];
    const rows = orders.map(order => [
      order.id,
      order.user_name,
      order.user_email,
      order.service_name,
      `${order.country_name} (${order.country_code})`,
      order.phone_number,
      order.otp_code,
      order.status,
      money(order.price, order.currency),
      dateLabel(order.created_at),
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'viresend-otp-orders.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const pollSmsman = async () => {
    try {
      setPolling(true);
      const response = await pollAdminSmsmanOtps();
      const summary = response.summary || {};
      toast.success(`SMS-MAN poll complete: ${summary.received || 0} received, ${summary.waiting || 0} waiting.`);
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to poll SMS-MAN.');
    } finally {
      setPolling(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>OTP Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">View and manage mock OTP number purchases.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={pollSmsman} disabled={polling} className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
            Poll SMS-MAN
          </button>
          <button onClick={loadOrders} className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={exportCsv} disabled={!orders.length} className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Orders', value: stats.total, color: 'text-blue-600' },
          { label: 'Active', value: stats.active, color: 'text-amber-600' },
          { label: 'Received', value: stats.received, color: 'text-emerald-600' },
          { label: 'Expired/Cancelled', value: stats.expired + stats.cancelled, color: 'text-red-600' },
          { label: 'Revenue', value: money(stats.revenue), color: 'text-purple-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-xl ${stat.color}`} style={{ fontWeight: 700 }}>{stat.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search order ID, user, service, country, number, OTP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {['all', 'active', 'processing', 'waiting', 'received', 'expired', 'failed', 'cancelled'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-900 text-white'
                    : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">{selected.length} selected</span>
            <button
              onClick={() => selected.forEach(order => handleCancel(order.id))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel Selected
            </button>
            <button
              onClick={() => selected.forEach(order => handleRefund(order.id))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refund Selected
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={loadOrders} className="text-red-800 underline">Retry</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-blue-900 rounded"
                  />
                </th>
                {['Order ID', 'User', 'Service', 'Number', 'OTP', 'Status', 'Cost', 'Date', 'Actions'].map(header => (
                  <th key={header} className="text-left text-xs text-gray-500 px-3 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-gray-400">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                    Loading OTP orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No OTP orders found.
                  </td>
                </tr>
              ) : (
                orders.map(order => {
                  const status = statusConfig[order.status] || statusConfig.waiting;
                  const StatusIcon = status.icon;
                  const isBusy = actionLoading.endsWith(order.id);
                  return (
                    <tr key={order.id} className={`hover:bg-gray-50/50 transition-colors ${selectedOrders.includes(order.id) ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="w-4 h-4 accent-blue-900"
                        />
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="font-mono text-xs text-gray-700" style={{ fontWeight: 500 }}>{order.id.slice(-10)}</span>
                        <div className="text-[11px] text-gray-400 uppercase">{order.mode}</div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="text-sm text-gray-700 whitespace-nowrap" style={{ fontWeight: 500 }}>{order.user_name}</div>
                        <div className="text-xs text-gray-400 whitespace-nowrap">{order.user_email || `ID: ${order.user_id.slice(-8)}`}</div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2 min-w-[180px]">
                          {order.service_image_url ? <img src={order.service_image_url} alt="" className="w-7 h-7 rounded-lg object-contain bg-gray-50" /> : <div className="w-7 h-7 rounded-lg bg-gray-100" />}
                          <div>
                            <div className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{order.service_name || 'OTP Service'}</div>
                            <div className="text-xs text-gray-400 flex items-center gap-1">
                              {order.country_flag_image && <img src={order.country_flag_image} alt="" className="w-4 h-3 object-cover rounded-[2px]" />}
                              {order.country_name} {order.country_code && `(${order.country_code})`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="font-mono text-xs text-gray-600 whitespace-nowrap">{order.phone_number || '-'}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        {order.otp_code ? (
                          <span className="font-mono text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg" style={{ fontWeight: 600 }}>
                            {order.otp_code}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.color}`} style={{ fontWeight: 500 }}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="text-sm text-gray-800 whitespace-nowrap" style={{ fontWeight: 600 }}>{money(order.price, order.currency)}</span>
                        {order.refunded_at && <div className="text-[11px] text-blue-500">Refunded</div>}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="text-xs text-gray-400 whitespace-nowrap">{dateLabel(order.created_at)}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1">
                          {order.raw_status === 'waiting' && (
                            <button
                              onClick={() => handleCancel(order.id)}
                              disabled={isBusy}
                              className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!order.refunded_at && (
                            <button
                              onClick={() => handleRefund(order.id)}
                              disabled={isBusy}
                              className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50"
                              title="Refund"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === `refund:${order.id}` ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                          <button className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-lg transition-colors" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-500">
          <span>Showing {orders.length} of {pagination.total} orders</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1 || loading} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50">Previous</button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button onClick={() => setPage(prev => Math.min(pagination.pages, prev + 1))} disabled={page >= pagination.pages || loading} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
