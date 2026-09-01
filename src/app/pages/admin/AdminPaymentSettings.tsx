import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Eye, EyeOff, Loader2, Save, Shield, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminPaymentProviders,
  saveAdminPaymentProvider,
  setAdminDefaultPaymentProvider,
  testAdminPaymentProvider,
} from '../../../lib/api.js';

const blankPaystack = {
  is_active: false,
  is_default: false,
  public_key: '',
  secret_key: '',
  webhook_secret: '',
  minimum_deposit: '5',
  maximum_deposit: '1000',
  currency: 'GHS',
  has_secret_key: false,
  has_webhook_secret: false,
  configuration_status: 'incomplete',
};

const blankMoolre = {
  is_active: false,
  is_default: false,
  environment: 'sandbox',
  api_username: '',
  private_key: '',
  public_key: '',
  account_number: '',
  currency: 'GHS',
  callback_url: '',
  redirect_url: '',
  link_expiration_minutes: '30',
  minimum_deposit: '50',
  maximum_deposit: '1000',
  reference_prefix: 'VIRE-DEP',
  private_key_configured: false,
  public_key_configured: false,
  configuration_status: 'incomplete',
  last_connection_test_result: '',
  last_connection_test_at: '',
  last_connection_test_message: '',
};

const MOOLRE_LOGO_URL = 'https://moolre.com/assets/pngs/moolre-M-logo-transparent.png';

function ProviderArtwork({ provider }: { provider: 'paystack' | 'moolre' }) {
  if (provider === 'moolre') {
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

function statusBadge(config: any) {
  if (config.is_active && config.configuration_status === 'complete') return { label: 'Active', className: 'bg-emerald-50 text-emerald-700' };
  if (config.configuration_status !== 'complete') return { label: 'Configuration Incomplete', className: 'bg-amber-50 text-amber-700' };
  return { label: 'Inactive', className: 'bg-gray-100 text-gray-600' };
}

export default function AdminPaymentSettings() {
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState('');
  const [testingProvider, setTestingProvider] = useState('');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [paystack, setPaystack] = useState(blankPaystack);
  const [moolre, setMoolre] = useState(blankMoolre);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await getAdminPaymentProviders();
      const providers = response.providers || [];
      const paystackSettings = providers.find((item: any) => item.provider === 'paystack') || {};
      const moolreSettings = providers.find((item: any) => item.provider === 'moolre') || {};
      setPaystack(prev => ({
        ...prev,
        ...paystackSettings,
        minimum_deposit: String(paystackSettings.minimum_deposit ?? paystackSettings.min_deposit ?? prev.minimum_deposit),
        maximum_deposit: String(paystackSettings.maximum_deposit ?? paystackSettings.max_deposit ?? prev.maximum_deposit),
        secret_key: '',
        webhook_secret: '',
      }));
      setMoolre(prev => ({
        ...prev,
        ...moolreSettings,
        minimum_deposit: String(moolreSettings.minimum_deposit ?? prev.minimum_deposit),
        maximum_deposit: String(moolreSettings.maximum_deposit ?? prev.maximum_deposit),
        link_expiration_minutes: String(moolreSettings.link_expiration_minutes ?? prev.link_expiration_minutes),
        private_key: '',
        public_key: '',
      }));
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load payment providers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const saveProvider = async (provider: 'paystack' | 'moolre') => {
    try {
      setSavingProvider(provider);
      const config = provider === 'paystack' ? paystack : moolre;
      const response = await saveAdminPaymentProvider(provider, config);
      toast.success(response.message || `${provider} settings saved.`);
      await loadSettings();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || `Unable to save ${provider} settings.`);
    } finally {
      setSavingProvider('');
    }
  };

  const testProvider = async (provider: 'paystack' | 'moolre') => {
    try {
      setTestingProvider(provider);
      const config = provider === 'paystack' ? paystack : moolre;
      const response = await testAdminPaymentProvider(provider, config);
      toast.success(response.message || `${provider} connection verified.`);
      await loadSettings();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || `${provider} connection failed.`);
      await loadSettings();
    } finally {
      setTestingProvider('');
    }
  };

  const setDefault = async (provider: 'paystack' | 'moolre') => {
    try {
      await setAdminDefaultPaymentProvider(provider);
      toast.success(`${provider === 'moolre' ? 'Moolre' : 'Paystack'} is now the default provider.`);
      await loadSettings();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to set default provider.');
    }
  };

  const SecretToggle = ({ id }: { id: string }) => (
    <button type="button" onClick={() => setShowSecrets(prev => ({ ...prev, [id]: !prev[id] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
      {showSecrets[id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  const Input = ({ label, value, onChange, type = 'text', placeholder = '', disabled = false, mono = false }: any) => (
    <div>
      <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:bg-gray-50 disabled:text-gray-500 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );

  const paystackStatus = statusBadge(paystack);
  const moolreStatus = statusBadge(moolre);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Payment Provider Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Configure payment providers used for VireSender wallet deposits.</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Secret keys are never returned to the browser. Leave secret fields blank to preserve the saved backend value.
        </p>
      </div>

      {loading ? (
        <div className="p-10 flex items-center justify-center gap-2 text-sm text-gray-500 bg-white border border-gray-100 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin" />Loading payment provider settings...
        </div>
      ) : (
        <>
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <ProviderArtwork provider="paystack" />
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Paystack</h2>
                  <p className="text-gray-400 text-xs">Card, bank transfer, USSD, mobile money</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1.5 rounded-full ${paystackStatus.className}`} style={{ fontWeight: 600 }}>{paystackStatus.label}</span>
                {paystack.is_default && <span className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700" style={{ fontWeight: 600 }}>Default</span>}
                <button onClick={() => setPaystack(prev => ({ ...prev, is_active: !prev.is_active }))} className={`relative w-11 h-6 rounded-full transition-colors ${paystack.is_active ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${paystack.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Public Key" value={paystack.public_key} onChange={(value: string) => setPaystack(prev => ({ ...prev, public_key: value }))} placeholder="pk_live_..." mono />
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Secret Key</label>
                  <div className="relative">
                    <input type={showSecrets.paystack_secret ? 'text' : 'password'} value={paystack.secret_key} onChange={event => setPaystack(prev => ({ ...prev, secret_key: event.target.value }))} placeholder={paystack.has_secret_key ? 'Secret key already configured' : 'sk_live_...'} className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                    <SecretToggle id="paystack_secret" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Webhook Secret</label>
                  <div className="relative">
                    <input type={showSecrets.paystack_webhook ? 'text' : 'password'} value={paystack.webhook_secret} onChange={event => setPaystack(prev => ({ ...prev, webhook_secret: event.target.value }))} placeholder={paystack.has_webhook_secret ? 'Secret key already configured' : 'Optional webhook secret'} className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                    <SecretToggle id="paystack_webhook" />
                  </div>
                </div>
                <Input label="Currency" value="GHS - Ghanaian Cedi" disabled onChange={() => {}} />
                <Input label="Minimum Deposit (GHS)" type="number" value={paystack.minimum_deposit} onChange={(value: string) => setPaystack(prev => ({ ...prev, minimum_deposit: value }))} />
                <Input label="Maximum Deposit (GHS)" type="number" value={paystack.maximum_deposit} onChange={(value: string) => setPaystack(prev => ({ ...prev, maximum_deposit: value }))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveProvider('paystack')} disabled={savingProvider === 'paystack'} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  {savingProvider === 'paystack' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Paystack Settings
                </button>
                <button onClick={() => testProvider('paystack')} disabled={testingProvider === 'paystack'} className="flex items-center gap-2 border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  {testingProvider === 'paystack' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}Test Connection
                </button>
                <button onClick={() => setDefault('paystack')} className="flex items-center gap-2 border border-blue-200 text-blue-700 px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  <CheckCircle className="w-4 h-4" />Set as Default
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <ProviderArtwork provider="moolre" />
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Moolre</h2>
                  <p className="text-gray-400 text-xs">MTN MoMo, Telecel Cash, and AT Money</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1.5 rounded-full ${moolreStatus.className}`} style={{ fontWeight: 600 }}>{moolreStatus.label}</span>
                {moolre.last_connection_test_result === 'success' && <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700" style={{ fontWeight: 600 }}>Connection Verified</span>}
                {moolre.last_connection_test_result === 'failed' && <span className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-700" style={{ fontWeight: 600 }}>Connection Failed</span>}
                {moolre.is_default && <span className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700" style={{ fontWeight: 600 }}>Default</span>}
                <button onClick={() => setMoolre(prev => ({ ...prev, is_active: !prev.is_active }))} className={`relative w-11 h-6 rounded-full transition-colors ${moolre.is_active ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${moolre.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Environment</label>
                  <select value={moolre.environment} onChange={event => setMoolre(prev => ({ ...prev, environment: event.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50">
                    <option value="sandbox">Sandbox</option>
                    <option value="live">Live</option>
                  </select>
                </div>
                <Input label="API Username" value={moolre.api_username} onChange={(value: string) => setMoolre(prev => ({ ...prev, api_username: value }))} />
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Private API Key</label>
                  <div className="relative">
                    <input type={showSecrets.moolre_private ? 'text' : 'password'} value={moolre.private_key} onChange={event => setMoolre(prev => ({ ...prev, private_key: event.target.value }))} placeholder={moolre.private_key_configured ? 'Secret key already configured' : 'Private API key'} className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                    <SecretToggle id="moolre_private" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Public API Key</label>
                  <div className="relative">
                    <input type={showSecrets.moolre_public ? 'text' : 'password'} value={moolre.public_key} onChange={event => setMoolre(prev => ({ ...prev, public_key: event.target.value }))} placeholder={moolre.public_key_configured ? 'Secret key already configured' : 'Public API key'} className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                    <SecretToggle id="moolre_public" />
                  </div>
                </div>
                <Input label="Moolre Account Number" value={moolre.account_number} onChange={(value: string) => setMoolre(prev => ({ ...prev, account_number: value }))} />
                <Input label="Currency" value={moolre.currency} onChange={(value: string) => setMoolre(prev => ({ ...prev, currency: value.toUpperCase() }))} />
                <Input label="Callback URL" value={moolre.callback_url} onChange={(value: string) => setMoolre(prev => ({ ...prev, callback_url: value }))} />
                <Input label="Redirect URL" value={moolre.redirect_url} onChange={(value: string) => setMoolre(prev => ({ ...prev, redirect_url: value }))} />
                <Input label="Link Expiration (minutes)" type="number" value={moolre.link_expiration_minutes} onChange={(value: string) => setMoolre(prev => ({ ...prev, link_expiration_minutes: value }))} />
                <Input label="Reference Prefix" value={moolre.reference_prefix} onChange={(value: string) => setMoolre(prev => ({ ...prev, reference_prefix: value }))} />
                <Input label="Minimum Deposit (GHS)" type="number" value={moolre.minimum_deposit} onChange={(value: string) => setMoolre(prev => ({ ...prev, minimum_deposit: value }))} />
                <Input label="Maximum Deposit (GHS)" type="number" value={moolre.maximum_deposit} onChange={(value: string) => setMoolre(prev => ({ ...prev, maximum_deposit: value }))} />
              </div>
              {moolre.last_connection_test_at && (
                <p className="text-xs text-gray-500">Last connection test: {new Date(moolre.last_connection_test_at).toLocaleString()} {moolre.last_connection_test_message ? `- ${moolre.last_connection_test_message}` : ''}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveProvider('moolre')} disabled={savingProvider === 'moolre'} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  {savingProvider === 'moolre' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Moolre Settings
                </button>
                <button onClick={() => testProvider('moolre')} disabled={testingProvider === 'moolre'} className="flex items-center gap-2 border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  {testingProvider === 'moolre' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}Test Connection
                </button>
                <button onClick={() => setDefault('moolre')} className="flex items-center gap-2 border border-blue-200 text-blue-700 px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  <CheckCircle className="w-4 h-4" />Set as Default
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          Moolre is preferred when both providers are active. Paystack remains available as a user-selected backup.
        </p>
      </div>
    </div>
  );
}
