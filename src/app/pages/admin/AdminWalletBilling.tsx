import { useEffect, useMemo, useState } from 'react';
import { Search, Download, Wallet, TrendingUp, Hash, MessageSquare, Mail, RefreshCw, Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminWalletSummary, getAdminWalletTransactions } from '../../../lib/api.js';
import { formatCurrency } from '../../utils/currency';

type AdminWalletTransaction = {
  id: string;
  user_name?: string;
  user_email?: string;
  type: string;
  label?: string;
  method?: string;
  amount: number;
  status: string;
  reference?: string;
  balance_before: number;
  balance_after: number;
  created_at?: string | null;
};

const typeColor: Record<string, string> = {
  credit: 'bg-emerald-100 text-emerald-700',
  deposit: 'bg-emerald-100 text-emerald-700',
  debit: 'bg-red-100 text-red-700',
  refund: 'bg-gray-100 text-gray-600',
};

const typeIcon: Record<string, typeof Wallet> = {
  credit: Wallet,
  deposit: Wallet,
  debit: TrendingUp,
  refund: RefreshCw,
  otp: Hash,
  sms: MessageSquare,
  email: Mail,
};

export default function AdminWalletBilling() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<AdminWalletTransaction[]>([]);
  const [summary, setSummary] = useState({
    total_deposits: 0,
    total_spending: 0,
    pending_deposits: 0,
    transaction_count: 0,
  });

  const loadBilling = async () => {
    try {
      setLoading(true);
      const [summaryResponse, transactionsResponse] = await Promise.all([
        getAdminWalletSummary(),
        getAdminWalletTransactions(),
      ]);
      setSummary(summaryResponse.summary || summary);
      setTransactions(transactionsResponse.transactions || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load wallet billing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBilling();
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const query = search.toLowerCase();
      const matchSearch = !query
        || (t.user_name || '').toLowerCase().includes(query)
        || (t.user_email || '').toLowerCase().includes(query)
        || (t.reference || '').toLowerCase().includes(query)
        || t.id.toLowerCase().includes(query);
      const matchType = typeFilter === 'all' || t.type === typeFilter || t.status === typeFilter;
      return matchSearch && matchType;
    });
  }, [transactions, search, typeFilter]);

  const types = useMemo(() => {
    const values = new Set<string>();
    transactions.forEach(t => {
      values.add(t.type);
      if (t.status === 'pending') values.add('pending');
      if (t.status === 'failed') values.add('failed');
    });
    return ['all', ...Array.from(values)];
  }, [transactions]);

  const statusClass = (status: string) => {
    if (status === 'success') return 'text-emerald-600 bg-emerald-50';
    if (status === 'pending') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Wallet &amp; Billing</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track Paystack deposits, wallet activity, and service spending.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadBilling} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={() => toast.success('Export report will use the filtered transaction list.')} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <Download className="w-4 h-4" />Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Deposits', value: formatCurrency(summary.total_deposits), color: 'text-emerald-600' },
          { label: 'Wallet Spending', value: formatCurrency(summary.total_spending), color: 'text-blue-600' },
          { label: 'Pending Deposits', value: formatCurrency(summary.pending_deposits), color: 'text-amber-600' },
          { label: 'Transactions', value: String(summary.transaction_count), color: 'text-slate-700' },
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
          <input
            type="text"
            placeholder="Search by user, email, reference, or transaction ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-2 rounded-xl text-xs capitalize whitespace-nowrap ${typeFilter === t ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>
              {t === 'all' ? 'All Activity' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Txn ID','User','Type','Amount','Status','Balance Before','Balance After','Date'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500">
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading wallet billing...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500">No wallet transactions found.</td>
                </tr>
              ) : filtered.map(txn => {
                const Ic = typeIcon[txn.type] ?? CreditCard;
                const isCredit = txn.amount >= 0;
                return (
                  <tr key={txn.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3.5">
                      <div className="font-mono text-xs text-gray-500">{txn.reference || txn.id}</div>
                      <div className="font-mono text-[10px] text-gray-300">{txn.id}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{txn.user_name || 'Unknown user'}</div>
                      <div className="text-xs text-gray-400">{txn.user_email || 'No email'}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs capitalize ${typeColor[txn.type] ?? 'bg-gray-100 text-gray-600'}`} style={{ fontWeight: 500 }}>
                        <Ic className="w-3 h-3" />{txn.label || txn.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-sm ${isCredit ? 'text-emerald-600' : 'text-red-600'}`} style={{ fontWeight: 700 }}>
                        {isCredit ? '+' : '-'}{formatCurrency(Math.abs(txn.amount))}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs capitalize ${statusClass(txn.status)}`} style={{ fontWeight: 600 }}>{txn.status}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-sm text-gray-500">{formatCurrency(txn.balance_before)}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-gray-700" style={{ fontWeight: 600 }}>{formatCurrency(txn.balance_after)}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{txn.created_at ? new Date(txn.created_at).toLocaleString() : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
