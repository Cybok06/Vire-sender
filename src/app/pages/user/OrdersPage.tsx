import { useState, useMemo } from 'react';
import { Search, Filter, CheckCircle, Clock, AlertCircle, XCircle, Download, Copy } from 'lucide-react';
import { MOCK_ORDERS, Order } from '../../data/mockData';
import { toast } from 'sonner';
import { safeClipboardCopy } from '../../utils/clipboard';

const STATUS_OPTIONS = ['all', 'completed', 'active', 'expired', 'cancelled'];
const SERVICE_OPTIONS = ['all', ...Array.from(new Set(MOCK_ORDERS.map(o => o.service)))];

const statusConfig = {
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700', icon: Clock },
  expired: { label: 'Expired', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return MOCK_ORDERS.filter(o => {
      const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase()) ||
        o.service.toLowerCase().includes(search.toLowerCase()) ||
        o.number.includes(search);
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchService = serviceFilter === 'all' || o.service === serviceFilter;
      return matchSearch && matchStatus && matchService;
    });
  }, [search, statusFilter, serviceFilter]);

  const copyToClipboard = (text: string, label: string) => {
    safeClipboardCopy(text);
    toast.success(`${label} copied!`);
  };

  const stats = {
    total: MOCK_ORDERS.length,
    completed: MOCK_ORDERS.filter(o => o.status === 'completed').length,
    active: MOCK_ORDERS.filter(o => o.status === 'active').length,
    totalSpent: MOCK_ORDERS.reduce((s, o) => s + o.cost, 0),
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>My Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track all your OTP purchases and sessions.</p>
        </div>
        <button className="hidden sm:flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active', value: stats.active, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Spent', value: `GHS ${stats.totalSpent.toFixed(2)}`, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-lg ${stat.color}`} style={{ fontWeight: 700 }}>{stat.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order ID, service, or number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <button
            onClick={() => setShowFilters(p => !p)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm transition-colors ${
              showFilters ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1" style={{ fontWeight: 500 }}>Status</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs capitalize transition-colors ${
                      statusFilter === s
                        ? 'bg-blue-900 text-white'
                        : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" style={{ fontWeight: 500 }}>Service</label>
              <div className="flex gap-2 flex-wrap">
                {SERVICE_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setServiceFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs capitalize transition-colors ${
                      serviceFilter === s
                        ? 'bg-blue-900 text-white'
                        : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Order ID', 'Service', 'Number', 'OTP Code', 'Status', 'Cost', 'Date'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No orders found matching your filters.
                  </td>
                </tr>
              ) : (
                filtered.map(order => {
                  const s = statusConfig[order.status];
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-gray-700" style={{ fontWeight: 500 }}>{order.id}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{order.serviceEmoji}</span>
                          <div>
                            <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{order.service}</div>
                            <div className="text-xs text-gray-400">{order.countryFlag} {order.country}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-gray-600">{order.number}</span>
                          <button
                            onClick={() => copyToClipboard(order.number, 'Number')}
                            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {order.otp ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg" style={{ fontWeight: 600 }}>
                              {order.otp}
                            </span>
                            <button
                              onClick={() => copyToClipboard(order.otp!, 'OTP')}
                              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${s.color}`} style={{ fontWeight: 500 }}>
                          <s.icon className="w-3 h-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>GHS {order.cost.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-gray-400 whitespace-nowrap">{order.createdAt}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Showing {filtered.length} of {MOCK_ORDERS.length} orders
            </span>
            <span className="text-sm text-gray-500">
              Total: <span style={{ fontWeight: 600 }} className="text-gray-700">
                GHS {filtered.reduce((s, o) => s + o.cost, 0).toFixed(2)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}



