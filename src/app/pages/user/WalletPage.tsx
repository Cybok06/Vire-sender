import { useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, X, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { createWalletDeposit, getActivePaymentProviders, getWallet, verifyPaystackDeposit } from '../../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';
import { formatCurrency } from '../../utils/currency';

type WalletTransaction = {
  id: string;
  type: 'credit' | 'debit' | 'deposit' | 'refund';
  label?: string;
  method?: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'processing' | 'otp_required';
  reference?: string;
  created_at?: string | null;
};

type PaymentProvider = {
  id: 'moolre' | 'paystack';
  name: string;
  description: string;
  minimum_deposit: number;
  maximum_deposit: number;
  requires_phone_number: boolean;
  requires_network: boolean;
};

const typeConfig = {
  credit: { label: 'Deposit', icon: ArrowDownLeft, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  deposit: { label: 'Deposit', icon: ArrowDownLeft, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  debit: { label: 'Debit', icon: ArrowUpRight, color: 'text-red-600', bg: 'bg-red-100' },
  refund: { label: 'Refund', icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-100' },
};

const PRESET_AMOUNTS = [50, 100, 200, 500];
const MOOLRE_LOGO_URL = 'https://moolre.com/assets/pngs/moolre-M-logo-transparent.png';

function PaymentProviderArtwork({ providerId }: { providerId: 'moolre' | 'paystack' }) {
  if (providerId === 'moolre') {
    return (
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden border"
        style={{ background: 'linear-gradient(135deg, #fff7ed, #ffedd5)', borderColor: '#fdba74' }}
      >
        <img src={MOOLRE_LOGO_URL} alt="Moolre" className="w-8 h-8 object-contain" />
      </div>
    );
  }

  return (
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center border"
      style={{ background: 'linear-gradient(135deg, #ecfeff, #ccfbf1)', borderColor: '#99f6e4' }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs"
        style={{ background: '#00C3A3', color: '#ffffff', fontWeight: 800, letterSpacing: '-0.02em' }}
      >
        P
      </div>
    </div>
  );
}

export default function WalletPage() {
  const { user, updateBalance } = useAuth();
  const { isEnabled } = useServiceAvailability();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<'moolre' | 'paystack'>('paystack');
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [depositsEnabled, setDepositsEnabled] = useState(true);
  const [providerMessage, setProviderMessage] = useState('');

  const loadWallet = async () => {
    try {
      setLoading(true);
      const response = await getWallet();
      updateBalance(response.balance || 0);
      setTransactions(response.transactions || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load wallet.');
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      setProvidersLoading(true);
      const response = await getActivePaymentProviders();
      setDepositsEnabled(!!response.deposits_enabled);
      setProviderMessage(response.message || '');
      const list = response.providers || [];
      setProviders(list);
      if (list.length) {
        setSelectedProvider((response.default_provider || list[0].id) as 'moolre' | 'paystack');
      }
    } catch (error: any) {
      setDepositsEnabled(false);
      setProviders([]);
      setProviderMessage(error?.data?.message || error?.message || 'Wallet deposits are temporarily unavailable.');
    } finally {
      setProvidersLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
  }, []);

  useEffect(() => {
    if (showModal) loadProviders();
  }, [showModal]);

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference || verifying) return;
    const verify = async () => {
      try {
        setVerifying(true);
        const response = await verifyPaystackDeposit({ reference });
        updateBalance(response.balance || 0);
        toast.success(response.message || 'Wallet credited successfully.');
        await loadWallet();
      } catch (error: any) {
        toast.error(error?.data?.message || error?.message || 'Payment verification failed.');
      } finally {
        setVerifying(false);
        navigate('/user/wallet', { replace: true });
      }
    };
    verify();
  }, [searchParams]);

  const selectedProviderConfig = useMemo(() => providers.find(provider => provider.id === selectedProvider), [providers, selectedProvider]);

  const stats = useMemo(() => {
    const successful = transactions.filter(t => t.status === 'success');
    return {
      totalDeposited: successful.filter(t => t.amount > 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
      totalSpent: successful.filter(t => t.amount < 0 || t.type === 'debit').reduce((sum, t) => sum + Math.abs(t.amount), 0),
    };
  }, [transactions]);

  const handleDeposit = async () => {
    const amt = parseFloat(amount);
    const provider = selectedProviderConfig;
    if (!provider) {
      toast.error('The selected payment provider is currently unavailable.');
      return;
    }
    if (!amt || amt < provider.minimum_deposit || amt > provider.maximum_deposit) {
      toast.error(`The amount must be between ${formatCurrency(provider.minimum_deposit)} and ${formatCurrency(provider.maximum_deposit)}.`);
      return;
    }
    try {
      setProcessing(true);
      const response = await createWalletDeposit({
        provider: provider.id,
        amount: amt,
      });
      if (provider.id === 'paystack') {
        if (!response.authorization_url) throw new Error('Paystack did not return a payment link.');
        window.location.assign(response.authorization_url);
        return;
      }
      const authorizationUrl = response.next_action?.authorization_url || response.authorization_url;
      if (!response.success || !authorizationUrl) {
        throw new Error('The payment page could not be opened.');
      }
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to start payment.');
      setProcessing(false);
    } finally {
      if (provider.id !== 'paystack') setProcessing(false);
    }
  };

  const closeModal = () => {
    if (processing) return;
    setShowModal(false);
  };

  const balance = user?.balance ?? user?.wallet_balance ?? 0;

  if (!isEnabled('wallet_topup')) return <ServiceLockedOverlay serviceKey="wallet_topup" />;

  return (
    <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl" style={{ color: '#0F172A', fontWeight: 800 }}>Wallet</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Manage your balance and deposit history.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl transition-all hover:opacity-90 text-sm" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', fontWeight: 600, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
          <Plus className="w-4 h-4" />Deposit Funds
        </button>
      </div>

      {verifying && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-xl text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />Verifying payment and updating your wallet...
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1 rounded-xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #06142B 0%, #0d2563 60%, #1D4ED8 100%)', boxShadow: '0 16px 48px rgba(6,20,43,0.25)' }}>
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5" style={{ color: '#0EA5E9' }} />
              <span className="text-sm" style={{ color: '#94a3b8' }}>Available Balance</span>
            </div>
            <div className="text-4xl mb-1" style={{ fontWeight: 800 }}>{formatCurrency(balance)}</div>
            <div className="text-sm mb-4" style={{ color: '#94a3b8' }}>Ready to use across all services</div>
            <button onClick={() => setShowModal(true)} className="bg-white/15 hover:bg-white/25 text-white text-sm px-4 py-2 rounded-xl transition-colors border border-white/20" style={{ fontWeight: 600 }}>+ Add Funds</button>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#dcfce7' }}><ArrowDownLeft className="w-4 h-4" style={{ color: '#10B981' }} /></div>
            <span className="text-sm" style={{ color: '#64748B' }}>Total Deposited</span>
          </div>
          <div className="text-2xl" style={{ color: '#0F172A', fontWeight: 800 }}>{formatCurrency(stats.totalDeposited)}</div>
          <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>Successful wallet credits</div>
        </div>
        <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#ede9fe' }}><TrendingUp className="w-4 h-4" style={{ color: '#8b5cf6' }} /></div>
            <span className="text-sm" style={{ color: '#64748B' }}>Total Spent</span>
          </div>
          <div className="text-2xl" style={{ color: '#0F172A', fontWeight: 800 }}>{formatCurrency(stats.totalSpent)}</div>
          <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>Wallet debits</div>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#f8faff' }}>
          <h2 className="text-sm" style={{ color: '#0F172A', fontWeight: 700 }}>Transaction History</h2>
          <button onClick={loadWallet} className="text-sm flex items-center gap-1.5" style={{ color: '#2563EB', fontWeight: 600 }}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="px-5 py-10 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading wallet transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No wallet transactions yet.</div>
          ) : transactions.map(txn => {
            const cfg = typeConfig[txn.type] || typeConfig.credit;
            const amountValue = Math.abs(txn.amount);
            return (
              <div key={txn.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
                <div className={`w-10 h-10 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}><cfg.icon className={`w-4 h-4 ${cfg.color}`} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: '#374151', fontWeight: 600 }}>{txn.label || txn.method || cfg.label}</div>
                  <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: '#94a3b8' }}>
                    <span>{txn.created_at ? new Date(txn.created_at).toLocaleString() : 'Pending date'}</span>
                    {txn.reference && <span className="font-mono opacity-60">- {txn.reference}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm ${txn.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`} style={{ fontWeight: 700 }}>{txn.amount >= 0 ? '+' : '-'}{formatCurrency(amountValue)}</div>
                  <div className={`text-xs mt-0.5 ${txn.status === 'success' ? 'text-emerald-500' : txn.status === 'pending' || txn.status === 'processing' ? 'text-amber-500' : 'text-red-500'}`} style={{ fontWeight: 500 }}>{txn.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(6,20,43,0.6)' }} onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h2 className="text-base" style={{ color: '#0F172A', fontWeight: 700 }}>Deposit Funds</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5" style={{ color: '#94a3b8' }} /></button>
            </div>
            <div className="p-6 space-y-5">
              {providersLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading payment providers...</div>
              ) : !depositsEnabled ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">{providerMessage || 'Wallet deposits are temporarily unavailable.'}</div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm mb-2" style={{ color: '#374151', fontWeight: 600 }}>Amount (GHS)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#64748B', fontWeight: 700 }}>GHS</span>
                      <input type="number" min={selectedProviderConfig?.minimum_deposit || 1} placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="w-full pl-14 pr-4 py-3 rounded-xl text-lg outline-none transition-all" style={{ border: '1.5px solid #e2e8f0', fontWeight: 700, color: '#0F172A', fontFamily: 'inherit' }} />
                    </div>
                    {selectedProviderConfig && <p className="text-xs text-slate-500 mt-1.5">Range: {formatCurrency(selectedProviderConfig.minimum_deposit)} to {formatCurrency(selectedProviderConfig.maximum_deposit)}</p>}
                    <div className="flex gap-2 mt-2">
                      {PRESET_AMOUNTS.map(amt => (
                        <button key={amt} onClick={() => setAmount(String(amt))} className="flex-1 py-1.5 text-xs rounded-xl border transition-all" style={{ background: amount === String(amt) ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'white', color: amount === String(amt) ? 'white' : '#64748B', borderColor: amount === String(amt) ? '#2563EB' : '#e2e8f0', fontWeight: 600 }}>
                          {formatCurrency(amt, 0)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-2" style={{ color: '#374151', fontWeight: 600 }}>Payment Method</label>
                    <div className="space-y-2">
                      {providers.map(provider => {
                        const active = selectedProvider === provider.id;
                        return (
                          <button key={provider.id} onClick={() => setSelectedProvider(provider.id)} className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left ${active ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
                            <PaymentProviderArtwork providerId={provider.id} />
                            <div>
                              <div className="text-sm" style={{ color: '#374151', fontWeight: 600 }}>{provider.name}</div>
                              <div className="text-xs" style={{ color: '#94a3b8' }}>{provider.description}</div>
                            </div>
                            {active && <CheckCircle className="w-5 h-5 ml-auto text-blue-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button onClick={handleDeposit} disabled={processing || !depositsEnabled} className="w-full text-white py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', fontWeight: 700, boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}>
                    {processing ? <><Loader2 className="w-4 h-4 animate-spin" />{selectedProvider === 'moolre' ? 'Preparing secure payment page...' : 'Processing...'}</> : `Deposit ${amount ? formatCurrency(parseFloat(amount || '0')) : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
