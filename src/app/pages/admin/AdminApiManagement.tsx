import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle, Download, Eye,
  Loader2, RefreshCw, Search, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminDeveloperApiStats,
  getAdminDeveloperApiUsers,
  updateAdminDeveloperApiStatus,
} from '../../../lib/api';

type ApiUser = {
  id: string;
  user_id: string;
  user: string;
  email: string;
  api_key: string;
  requests_today: number;
  success_rate: number;
  failed_requests: number;
  total_spent: number;
  last_used?: string;
  status: 'active' | 'suspended' | 'limited' | 'revoked';
};

type ApiStats = {
  api_users: number;
  active: number;
  suspended: number;
  requests_today: number;
  failed_today: number;
  api_revenue: number;
};

function formatMoney(value = 0) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export default function AdminApiManagement() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [stats, setStats] = useState<ApiStats>({
    api_users: 0,
    active: 0,
    suspended: 0,
    requests_today: 0,
    failed_today: 0,
    api_revenue: 0,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const loadData = async () => {
    try {
      const [statsData, usersData] = await Promise.all([
        getAdminDeveloperApiStats(),
        getAdminDeveloperApiUsers(),
      ]);
      setStats(statsData.stats);
      setUsers(usersData.users || []);
    } catch (error: any) {
      toast.error(error.message || 'Unable to load API management data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q || u.user.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.api_key.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchSearch && matchStatus;
  }), [users, search, statusFilter]);

  const highFailureUser = users.find(u => u.requests_today >= 20 && u.success_rate < 70);

  const setApiStatus = async (id: string, status: ApiUser['status']) => {
    setBusyId(id);
    try {
      await updateAdminDeveloperApiStatus(id, { status });
      toast.success(`API access set to ${status}.`);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Unable to update API access.');
    } finally {
      setBusyId('');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['User', 'Email', 'API Key', 'Requests Today', 'Success Rate', 'Failed', 'Total Spent', 'Last Used', 'Status'],
      ...filtered.map(u => [
        u.user,
        u.email,
        u.api_key,
        u.requests_today,
        `${u.success_rate}%`,
        u.failed_requests,
        formatMoney(u.total_spent),
        formatDate(u.last_used),
        u.status,
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'viresend-api-users.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const statusBadge: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    suspended: 'bg-red-100 text-red-700',
    limited: 'bg-amber-100 text-amber-700',
    revoked: 'bg-gray-100 text-gray-600',
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading API management...
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>API Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monitor and manage SMS developer API usage across all users.</p>
        </div>
        <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 text-sm transition-colors">
          <Download className="w-4 h-4" />Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'API Users', value: stats.api_users, color: 'text-blue-600' },
          { label: 'Active', value: stats.active, color: 'text-emerald-600' },
          { label: 'Suspended', value: stats.suspended, color: 'text-red-600' },
          { label: 'Requests Today', value: stats.requests_today.toLocaleString(), color: 'text-cyan-600' },
          { label: 'Failed Today', value: stats.failed_today.toLocaleString(), color: 'text-amber-600' },
          { label: 'API Revenue', value: formatMoney(stats.api_revenue), color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className={`text-xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {highFailureUser && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm text-red-700" style={{ fontWeight: 600 }}>High Failure Rate Detected</div>
            <p className="text-xs text-red-600 mt-0.5">
              {highFailureUser.user} has {highFailureUser.failed_requests} failed API requests today with a {highFailureUser.success_rate}% success rate.
            </p>
          </div>
          <button onClick={() => setApiStatus(highFailureUser.id, 'limited')} className="sm:ml-auto flex-shrink-0 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs transition-colors" style={{ fontWeight: 500 }}>
            Limit Now
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search user, email, or API key..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {['all', 'active', 'limited', 'suspended'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors whitespace-nowrap ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['User', 'API Key', 'Requests Today', 'Success Rate', 'Failed', 'Total Spent', 'Last Used', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${u.requests_today >= 20 && u.success_rate < 70 ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3.5">
                    <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{u.user}</div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <code className="font-mono text-xs text-gray-600 max-w-[190px] truncate block">{u.api_key}</code>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 600 }}>{u.requests_today.toLocaleString()}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, u.success_rate)}%`, background: u.success_rate > 80 ? '#10b981' : u.success_rate > 50 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span className={`text-xs ${u.success_rate > 80 ? 'text-emerald-600' : u.success_rate > 50 ? 'text-amber-600' : 'text-red-600'}`} style={{ fontWeight: 600 }}>{u.success_rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-sm ${u.failed_requests > 100 ? 'text-red-600' : 'text-gray-600'}`} style={{ fontWeight: u.failed_requests > 100 ? 700 : 400 }}>{u.failed_requests}</span>
                    {u.failed_requests > 100 && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" />}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>{formatMoney(u.total_spent)}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{formatDate(u.last_used)}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs capitalize ${statusBadge[u.status] || statusBadge.active}`} style={{ fontWeight: 500 }}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toast.info(`Viewing activity for ${u.user}. Logs are available in request history.`)} title="View activity" className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button disabled={busyId === u.id} onClick={() => setApiStatus(u.id, u.status === 'suspended' ? 'active' : 'suspended')} title={u.status === 'suspended' ? 'Reactivate' : 'Suspend'} className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${u.status === 'suspended' ? 'hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700' : 'hover:bg-red-50 text-red-400 hover:text-red-600'}`}>
                        {u.status === 'suspended' ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      </button>
                      <button disabled={busyId === u.id} onClick={() => setApiStatus(u.id, 'limited')} title="Limit API access" className="p-1.5 hover:bg-amber-50 text-amber-400 hover:text-amber-600 rounded-lg transition-colors disabled:opacity-50">
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                      <button disabled={busyId === u.id} onClick={() => setApiStatus(u.id, 'active')} title="Reactivate API access" className="p-1.5 hover:bg-emerald-50 text-emerald-400 hover:text-emerald-600 rounded-lg transition-colors disabled:opacity-50">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                    No API users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
