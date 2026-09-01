import { useEffect, useMemo, useState } from 'react';
import { Search, UserX, UserCheck, Wallet, Plus, Minus, X, Loader2, CheckCircle, AlertTriangle, Mail, Github, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { adjustAdminUserWallet, getAdminUser, getAdminUsers, updateAdminUserStatus } from '../../../lib/api.js';
import { formatCurrency } from '../../utils/currency';

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  auth_provider: 'local' | 'google' | 'github';
  profile_picture?: string | null;
  email_verified: boolean;
  account_status: 'active' | 'suspended' | string;
  wallet_balance: number;
  created_at?: string | null;
  last_login?: string | null;
}

const providerIcon = (provider: string) => {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 inline mr-1" aria-hidden>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    );
  }
  if (provider === 'github') return <Github className="w-3.5 h-3.5 inline mr-1 text-gray-800" />;
  return <Mail className="w-3.5 h-3.5 inline mr-1 text-gray-500" />;
};

const initials = (name: string) => (name || 'User').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : 'Never';

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [walletModal, setWalletModal] = useState<AdminUser | null>(null);
  const [detailsUser, setDetailsUser] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('Manual admin adjustment');
  const [walletAction, setWalletAction] = useState<'credit' | 'debit'>('credit');
  const [processing, setProcessing] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getAdminUsers();
      setUsers(response.users || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = useMemo(() => users.filter(u => {
    const query = search.toLowerCase();
    const matchSearch = !query || u.full_name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || (u.phone || '').includes(search);
    const matchStatus = statusFilter === 'all' || u.account_status === statusFilter;
    const matchProvider = providerFilter === 'all' || u.auth_provider === providerFilter;
    return matchSearch && matchStatus && matchProvider;
  }), [users, search, statusFilter, providerFilter]);

  const stats = {
    total: users.length,
    active: users.filter(u => u.account_status === 'active').length,
    suspended: users.filter(u => u.account_status === 'suspended').length,
    totalBalance: users.reduce((sum, u) => sum + (u.wallet_balance || 0), 0),
    unverified: users.filter(u => !u.email_verified).length,
  };

  const openDetails = async (user: AdminUser) => {
    setDetailsUser(user);
    setLoadingDetails(true);
    try {
      const response = await getAdminUser(user.id);
      setDetailsUser(response.user);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load user details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const toggleStatus = async (user: AdminUser) => {
    const nextStatus = user.account_status === 'active' ? 'suspended' : 'active';
    if (!confirm(`Are you sure you want to ${nextStatus === 'active' ? 'activate' : 'suspend'} ${user.full_name}?`)) return;
    try {
      const response = await updateAdminUserStatus(user.id, { account_status: nextStatus });
      setUsers(prev => prev.map(item => item.id === user.id ? response.user : item));
      toast.success(response.message || 'User status updated.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to update user status.');
    }
  };

  const handleWalletUpdate = async () => {
    const amount = parseFloat(walletAmount);
    if (!walletModal) return;
    if (!amount || amount <= 0) { toast.error('Enter a valid amount.'); return; }

    setProcessing(true);
    try {
      const response = await adjustAdminUserWallet(walletModal.id, { type: walletAction, amount, reason: walletReason });
      setUsers(prev => prev.map(item => item.id === walletModal.id ? response.user : item));
      toast.success(response.message || 'Wallet balance updated.');
      setWalletModal(null);
      setWalletAmount('');
      setWalletReason('Manual admin adjustment');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to adjust wallet.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Users Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage accounts, wallets, verification status, and access.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Users', value: stats.total, color: 'text-blue-600' },
          { label: 'Active', value: stats.active, color: 'text-emerald-600' },
          { label: 'Suspended', value: stats.suspended, color: 'text-red-600' },
          { label: 'Total Balances', value: formatCurrency(stats.totalBalance), color: 'text-purple-600' },
          { label: 'Unverified Email', value: stats.unverified, color: 'text-amber-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-xl ${stat.color}`} style={{ fontWeight: 700 }}>{stat.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search users by name, email, or phone..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'active', 'suspended'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-2 rounded-xl text-sm capitalize transition-colors ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{s}</button>
          ))}
          {['all', 'local', 'google', 'github'].map(p => (
            <button key={p} onClick={() => setProviderFilter(p)} className={`px-4 py-2 rounded-xl text-sm capitalize transition-colors ${providerFilter === p ? 'bg-slate-800 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{p}</button>
          ))}
          <button onClick={loadUsers} className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['User','Email','Phone','Role','Provider','Wallet Balance','Email Verified','Status','Date Joined','Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="py-12 text-center text-gray-400"><Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />Loading users...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="py-12 text-center text-gray-400"><Search className="w-8 h-8 mx-auto mb-2 opacity-40" />No users found.</td></tr>
              ) : (
                filtered.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${user.account_status === 'suspended' ? 'bg-red-100' : 'bg-blue-100'}`}>
                          <span className={`text-sm ${user.account_status === 'suspended' ? 'text-red-600' : 'text-blue-700'}`} style={{ fontWeight: 600 }}>{initials(user.full_name)}</span>
                        </div>
                        <div>
                          <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{user.full_name}</div>
                          <div className="text-xs text-gray-400">{user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{user.phone || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 capitalize">{user.role}</td>
                    <td className="px-4 py-4"><span className="inline-flex items-center text-xs text-gray-600 capitalize">{providerIcon(user.auth_provider)}{user.auth_provider}</span></td>
                    <td className="px-4 py-4 text-sm text-gray-800" style={{ fontWeight: 600 }}>{formatCurrency(user.wallet_balance)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${user.email_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`} style={{ fontWeight: 500 }}>
                        {user.email_verified ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {user.email_verified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs capitalize ${user.account_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`} style={{ fontWeight: 500 }}>
                        {user.account_status === 'active' ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {user.account_status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-400 whitespace-nowrap">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button onClick={() => openDetails(user)} className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-xs transition-colors">
                          <Eye className="w-3 h-3" />View
                        </button>
                        <button onClick={() => { setWalletModal(user); setWalletAction('credit'); }} className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs transition-colors">
                          <Wallet className="w-3 h-3" />Wallet
                        </button>
                        <button onClick={() => toggleStatus(user)} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${user.account_status === 'active' ? 'bg-red-50 hover:bg-red-100 text-red-600' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'}`}>
                          {user.account_status === 'active' ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          {user.account_status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDetailsUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>User Details</h2>
              <button onClick={() => setDetailsUser(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {loadingDetails ? (
                <div className="py-10 text-center text-gray-400"><Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />Loading details...</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ['Name', detailsUser.full_name],
                      ['Email', detailsUser.email],
                      ['Phone', detailsUser.phone || '-'],
                      ['Provider', detailsUser.auth_provider],
                      ['Status', detailsUser.account_status],
                      ['Last Login', formatDate(detailsUser.last_login)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className="text-sm text-gray-800 capitalize" style={{ fontWeight: 700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-sm text-gray-700 mb-2" style={{ fontWeight: 700 }}>Usage Summary</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(detailsUser.usage || {}).map(([key, value]) => (
                        <div key={key} className="rounded-xl p-3 bg-blue-50 border border-blue-100">
                          <div className="text-lg text-blue-700" style={{ fontWeight: 800 }}>{String(value)}</div>
                          <div className="text-xs text-blue-600 capitalize">{key.replaceAll('_', ' ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm text-gray-700 mb-2" style={{ fontWeight: 700 }}>Recent Activity</h3>
                    {(detailsUser.recent_activity || []).length === 0 ? (
                      <p className="text-sm text-gray-400">No recent admin activity.</p>
                    ) : (
                      <div className="space-y-2">
                        {detailsUser.recent_activity.map((item: any, index: number) => (
                          <div key={index} className="rounded-xl p-3 bg-gray-50 border border-gray-100">
                            <div className="text-sm text-gray-700" style={{ fontWeight: 600 }}>{item.action}</div>
                            <div className="text-xs text-gray-400">{formatDate(item.created_at)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {walletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setWalletModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Wallet Control</h2>
              <button onClick={() => setWalletModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-blue-700 text-sm" style={{ fontWeight: 600 }}>{initials(walletModal.full_name)}</span>
                </div>
                <div>
                  <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{walletModal.full_name}</div>
                  <div className="text-xs text-gray-400">Current balance: <span style={{ fontWeight: 600 }} className="text-gray-700">{formatCurrency(walletModal.wallet_balance)}</span></div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setWalletAction('credit')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all ${walletAction === 'credit' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-600'}`} style={{ fontWeight: 500 }}>
                  <Plus className="w-4 h-4" />Add Funds
                </button>
                <button onClick={() => setWalletAction('debit')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all ${walletAction === 'debit' ? 'bg-red-600 text-white' : 'border border-gray-200 text-gray-600'}`} style={{ fontWeight: 500 }}>
                  <Minus className="w-4 h-4" />Deduct
                </button>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Amount (GHS)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm" style={{ fontWeight: 700 }}>GHS</span>
                  <input type="number" min="0.01" step="0.01" placeholder="0.00" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} className="w-full pl-14 pr-4 py-3 border border-gray-200 rounded-xl text-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" style={{ fontWeight: 600 }} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Reason</label>
                <input value={walletReason} onChange={e => setWalletReason(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
              </div>
              <button onClick={handleWalletUpdate} disabled={processing} className={`w-full py-3.5 rounded-xl text-white text-sm flex items-center justify-center gap-2 transition-all ${walletAction === 'credit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-70`} style={{ fontWeight: 600 }}>
                {processing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing...</> : <>{walletAction === 'credit' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}{walletAction === 'credit' ? 'Add Funds' : 'Deduct Funds'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


