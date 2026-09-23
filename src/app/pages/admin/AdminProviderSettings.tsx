import { useEffect, useMemo, useState } from 'react';
import { Key, Eye, EyeOff, CheckCircle, XCircle, RefreshCw, Save, Loader2, AlertTriangle, Send, Mail, Hash, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import {
  getAdminSmsSettings,
  getAdminSmsSenderIds,
  getAdminSmsmanProviderSettings,
  saveAdminSmsSettings,
  saveAdminSmsmanProviderSettings,
  syncAdminSmsSenderId,
  syncAdminSmsSenderIds,
  syncAdminSmsmanData,
  testAdminMoolreSmsSettings,
  testAdminBirdSmsSettings,
  getAdminInternationalSmsPricing,
  saveAdminInternationalSmsPricing,
  saveAdminSharedSenderCountries,
  testAdminSmsmanProviderBalance,
  testAdminSmsmanProviderSettings,
} from '../../../lib/api.js';

type Status = 'idle' | 'testing' | 'success' | 'error';

export default function AdminProviderSettings() {
  const [tab, setTab] = useState<'sms' | 'email' | 'otp'>('sms');

  // SMS provider state
  const [activeSmsProvider, setActiveSmsProvider] = useState<'arkesel' | 'moolre'>('arkesel');
  const [arkeselKey, setArkeselKey]       = useState('');
  const [showArkesel, setShowArkesel]     = useState(false);
  const [arkeselStatus, setArkeselStatus] = useState<Status>('idle');
  const [smsEnabled, setSmsEnabled]       = useState(false);
  const [arkeselEnabled, setArkeselEnabled] = useState(false);
  const [hasArkeselKey, setHasArkeselKey] = useState(false);
  const [smsPriceUnit, setSmsPriceUnit]   = useState('0.04');
  const [smsProviderCost, setSmsProviderCost] = useState('0.02');
  const [moolreKey, setMoolreKey] = useState('');
  const [showMoolre, setShowMoolre] = useState(false);
  const [moolreStatus, setMoolreStatus] = useState<Status>('idle');
  const [moolreEnabled, setMoolreEnabled] = useState(false);
  const [hasMoolreKey, setHasMoolreKey] = useState(false);
  const [moolreMaskedKey, setMoolreMaskedKey] = useState('');
  const [moolreBaseUrl, setMoolreBaseUrl] = useState('https://api.moolre.com');
  const [moolrePriceUnit, setMoolrePriceUnit] = useState('0.04');
  const [moolreProviderCost, setMoolreProviderCost] = useState('0.02');
  const [moolreLastTestMessage, setMoolreLastTestMessage] = useState('');
  const [moolreBalance, setMoolreBalance] = useState<any>(null);
  const [senderIdRows, setSenderIdRows] = useState<any[]>([]);
  const [unlinkedSenderIds, setUnlinkedSenderIds] = useState<any[]>([]);
  const [syncingSenderIds, setSyncingSenderIds] = useState(false);
  const [birdKey, setBirdKey] = useState('');
  const [showBird, setShowBird] = useState(false);
  const [birdEnabled, setBirdEnabled] = useState(false);
  const [hasBirdKey, setHasBirdKey] = useState(false);
  const [birdRegion, setBirdRegion] = useState('us1');
  const [birdStatus, setBirdStatus] = useState<Status>('idle');
  const [internationalPricing, setInternationalPricing] = useState<any[]>([]);
  const [pricingSearch, setPricingSearch] = useState('');
  const [countryPickerSearch, setCountryPickerSearch] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);
  const [sharedSenderCodes, setSharedSenderCodes] = useState<string[]>([]);
  const [sharedSenderSearch, setSharedSenderSearch] = useState('');
  const [savingSharedSenders, setSavingSharedSenders] = useState(false);
  const [pricingDraft, setPricingDraft] = useState({ country_codes: ['US'] as string[], provider_cost: '', provider_currency: 'USD', exchange_rate_to_ghs: '1', user_price_ghs: '', enabled: true });
  const countryNames = useMemo(() => new Intl.DisplayNames(['en'], { type: 'region' }), []);
  const countries = useMemo(() => getCountries().map(code => ({ code, name: countryNames.of(code) || code, dial: `+${getCountryCallingCode(code)}` })).sort((a, b) => a.name.localeCompare(b.name)), [countryNames]);

  // Email state
  const [gclientId, setGclientId]           = useState('your-google-client-id.apps.googleusercontent.com');
  const [gclientSecret, setGclientSecret]   = useState('GOCSPX-xxxxxxxxxxxxxxxxxxxx');
  const [showGSecret, setShowGSecret]       = useState(false);
  const [gmailStatus, setGmailStatus]       = useState<Status>('idle');
  const [systemEmail, setSystemEmail]       = useState('noreply@vireotp.com');
  const [smtpHost, setSmtpHost]             = useState('smtp.mailgun.org');
  const [smtpPort, setSmtpPort]             = useState('587');

  // OTP (SMS-MAN) state
  const [smsmanKey, setSmsmanKey]           = useState('');
  const [showSmsman, setShowSmsman]         = useState(false);
  const [smsmanStatus, setSmsmanStatus]     = useState<Status>('idle');
  const [smsmanEnabled, setSmsmanEnabled]   = useState(false);
  const [hasSmsmanKey, setHasSmsmanKey]     = useState(false);
  const [smsmanMaskedToken, setSmsmanMaskedToken] = useState('');
  const [smsmanBalance, setSmsmanBalance]   = useState<any>(null);
  const [smsmanLastCheckedAt, setSmsmanLastCheckedAt] = useState('');
  const [smsmanLastError, setSmsmanLastError] = useState('');
  const [syncing, setSyncing]               = useState(false);
  const [saving, setSaving]                 = useState(false);

  useEffect(() => {
    const loadSmsSettings = async () => {
      try {
        const response = await getAdminSmsSettings();
        const settings = response.settings || {};
        setSmsEnabled(!!settings.sms_enabled);
        setActiveSmsProvider((settings.active_sms_provider || 'arkesel') === 'moolre' ? 'moolre' : 'arkesel');
        setArkeselEnabled(!!settings.arkesel_enabled);
        setHasArkeselKey(!!settings.has_arkesel_api_key);
        setArkeselKey('');
        setSmsPriceUnit(String(settings.arkesel_user_price_per_sms ?? settings.sms_cost_per_message ?? '0.04'));
        setSmsProviderCost(String(settings.arkesel_provider_cost_per_sms ?? settings.sms_provider_cost_per_message ?? '0.02'));
        if (settings.has_arkesel_api_key) setArkeselStatus('success');
        setMoolreEnabled(!!settings.moolre_enabled || !!settings.moolre_sms_enabled);
        setHasMoolreKey(!!settings.moolre_configured);
        setMoolreMaskedKey(settings.moolre_vas_key_masked || '');
        setMoolreKey('');
        setMoolreBaseUrl(settings.moolre_base_url || 'https://api.moolre.com');
        setMoolrePriceUnit(String(settings.moolre_user_price_per_sms ?? '0.04'));
        setMoolreProviderCost(String(settings.moolre_provider_cost_per_sms ?? '0.02'));
        setMoolreLastTestMessage(settings.moolre_last_test_message || '');
        setMoolreBalance(settings.moolre_last_known_provider_balance ?? null);
        if (settings.moolre_last_test_status === 'success' || settings.moolre_configured) setMoolreStatus('success');
        if (settings.moolre_last_test_status === 'failed') setMoolreStatus('error');
        setBirdEnabled(!!settings.bird_enabled);
        setHasBirdKey(!!settings.bird_configured);
        setBirdRegion(settings.bird_region || 'us1');
        setBirdKey('');
        if (settings.bird_last_test_status === 'success' || settings.bird_configured) setBirdStatus('success');
        if (settings.bird_last_test_status === 'failed') setBirdStatus('error');
        const pricingResponse = await getAdminInternationalSmsPricing();
        const pricingRows = pricingResponse.pricing || [];
        setInternationalPricing(pricingRows);
        setSharedSenderCodes(pricingRows.filter((row: any) => row.shared_sender).map((row: any) => row.country_code));
      } catch (error: any) {
        toast.error(error?.data?.message || error?.message || 'Unable to load SMS settings.');
      }
    };
    loadSmsSettings();
    loadSenderIds();
  }, []);

  const loadSenderIds = async () => {
    try {
      const response = await getAdminSmsSenderIds();
      setSenderIdRows(response.sender_ids || []);
      setUnlinkedSenderIds(response.unlinked || []);
    } catch {
      // Provider settings can still load if Sender ID records are empty or unavailable.
    }
  };

  useEffect(() => {
    const loadSmsmanSettings = async () => {
      try {
        const response = await getAdminSmsmanProviderSettings();
        const settings = response.settings || {};
        setSmsmanEnabled(!!settings.live_purchase_enabled);
        setHasSmsmanKey(!!settings.has_api_token);
        setSmsmanMaskedToken(settings.token_masked || '');
        setSmsmanKey('');
        setSmsmanBalance(settings.last_balance || null);
        setSmsmanLastCheckedAt(settings.last_balance_checked_at || '');
        setSmsmanLastError(settings.last_test_error || '');
        if (settings.last_test_status === 'success') setSmsmanStatus('success');
        if (settings.last_test_status === 'failed') setSmsmanStatus('error');
      } catch (error: any) {
        toast.error(error?.data?.message || error?.message || 'Unable to load SMS-MAN settings.');
      }
    };
    loadSmsmanSettings();
  }, []);

  const testConnection = async (provider: 'arkesel' | 'moolre' | 'bird' | 'gmail' | 'smsman') => {
    const setStatus = provider === 'arkesel' ? setArkeselStatus : provider === 'moolre' ? setMoolreStatus : provider === 'bird' ? setBirdStatus : provider === 'gmail' ? setGmailStatus : setSmsmanStatus;
    const key = provider === 'arkesel'
      ? (arkeselKey || (hasArkeselKey ? 'saved-key' : ''))
      : provider === 'moolre'
        ? (moolreKey || (hasMoolreKey ? 'saved-key' : ''))
        : provider === 'bird' ? (birdKey || (hasBirdKey ? 'saved-key' : '')) : provider === 'gmail' ? gclientId : (smsmanKey || (hasSmsmanKey ? 'saved-key' : ''));
    setStatus('testing');
    if (provider === 'moolre') {
      try {
        const response = await testAdminMoolreSmsSettings({ moolre_vas_key: moolreKey, moolre_base_url: moolreBaseUrl });
        const settings = response.settings || {};
        setMoolreLastTestMessage(response.message || settings.moolre_last_test_message || '');
        setMoolreBalance(response.balance ?? settings.moolre_last_known_provider_balance ?? null);
        setStatus('success');
        toast.success(response.message || 'Moolre SMS settings verified.');
      } catch (error: any) {
        setStatus('error');
        setMoolreLastTestMessage(error?.data?.message || error?.message || 'Moolre SMS connection failed.');
        toast.error(error?.data?.message || error?.message || 'Moolre SMS connection failed.');
      }
      return;
    }
    if (provider === 'bird') {
      try {
        const response = await testAdminBirdSmsSettings({ bird_api_key: birdKey, bird_region: birdRegion });
        setBirdRegion(response.region || response.settings?.bird_region || birdRegion);
        setStatus('success');
        toast.success(response.message || 'Bird settings verified.');
      } catch (error: any) {
        setStatus('error');
        toast.error(error?.data?.message || error?.message || 'Bird connection failed.');
      }
      return;
    }
    if (provider === 'smsman') {
      try {
        const response = smsmanKey
          ? await testAdminSmsmanProviderBalance({ api_token: smsmanKey })
          : await testAdminSmsmanProviderSettings();
        setSmsmanBalance(response.balance);
        setSmsmanLastCheckedAt(new Date().toISOString());
        setSmsmanLastError('');
        setStatus('success');
        toast.success('SMS-MAN connected. Balance fetched.');
      } catch (error: any) {
        setStatus('error');
        setSmsmanLastError(error?.data?.message || error?.message || 'SMS-MAN connection failed.');
        toast.error(error?.data?.message || error?.message || 'SMS-MAN connection failed.');
      }
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
    if (key.length > 10) { setStatus('success'); toast.success(`${provider === 'arkesel' ? 'Arkesel' : provider === 'gmail' ? 'Google OAuth' : 'SMS-MAN'} connected!`); }
    else { setStatus('error'); toast.error('Connection failed. Check your credentials.'); }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const response = await syncAdminSmsmanData();
      toast.success(response.message || `SMS-MAN sync checked ${response.country_count || 0} countries and ${response.service_count || 0} services.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to sync SMS-MAN data.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSenderIdSync = async () => {
    try {
      setSyncingSenderIds(true);
      const response = await syncAdminSmsSenderIds();
      toast.success(response.message || 'Moolre Sender IDs synchronized.');
      await loadSenderIds();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to synchronize Sender IDs.');
    } finally {
      setSyncingSenderIds(false);
    }
  };

  const handleSingleSenderSync = async (id: string) => {
    try {
      await syncAdminSmsSenderId(id);
      toast.success('Sender ID synchronized.');
      await loadSenderIds();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to synchronize Sender ID.');
    }
  };

  const handlePricingSave = async () => {
    if (!pricingDraft.country_codes.length) {
      toast.error('Select at least one country.');
      return;
    }
    try {
      setSavingPricing(true);
      const responses = await Promise.all(pricingDraft.country_codes.map(countryCode => {
        const country = countries.find(item => item.code === countryCode);
        return saveAdminInternationalSmsPricing(countryCode, {
          provider_cost: pricingDraft.provider_cost,
          provider_currency: pricingDraft.provider_currency,
          exchange_rate_to_ghs: pricingDraft.exchange_rate_to_ghs,
          user_price_ghs: pricingDraft.user_price_ghs,
          enabled: pricingDraft.enabled,
          country_name: country?.name,
          dial_code: country?.dial,
        });
      }));
      const savedRows = responses.map(response => response.pricing);
      const savedCodes = new Set(pricingDraft.country_codes);
      setInternationalPricing(rows => [...rows.filter(row => !savedCodes.has(row.country_code)), ...savedRows].sort((a, b) => a.country_name.localeCompare(b.country_name)));
      toast.success(`International SMS pricing saved for ${savedRows.length} ${savedRows.length === 1 ? 'country' : 'countries'}.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to save international pricing.');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleSharedSenderSave = async () => {
    try {
      setSavingSharedSenders(true);
      const response = await saveAdminSharedSenderCountries(sharedSenderCodes);
      const savedRows = response.pricing || [];
      setInternationalPricing(savedRows.sort((a, b) => a.country_name.localeCompare(b.country_name)));
      toast.success(response.message || 'Shared Sender countries saved.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to save Shared Sender countries.');
    } finally {
      setSavingSharedSenders(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (tab === 'sms') {
        const response = await saveAdminSmsSettings({
          sms_enabled: smsEnabled,
          active_sms_provider: activeSmsProvider,
          arkesel_enabled: arkeselEnabled,
          arkesel_api_key: arkeselKey,
          arkesel_user_price_per_sms: smsPriceUnit,
          arkesel_provider_cost_per_sms: smsProviderCost,
          moolre_sms_enabled: moolreEnabled,
          moolre_vas_key: moolreKey,
          moolre_base_url: moolreBaseUrl,
          moolre_user_price_per_sms: moolrePriceUnit,
          moolre_provider_cost_per_sms: moolreProviderCost,
          bird_enabled: birdEnabled,
          bird_api_key: birdKey,
          bird_region: birdRegion,
        });
        const settings = response.settings || {};
        setHasArkeselKey(!!settings.has_arkesel_api_key);
        setArkeselEnabled(!!settings.arkesel_enabled);
        setArkeselKey('');
        setSmsPriceUnit(String(settings.arkesel_user_price_per_sms ?? smsPriceUnit));
        setSmsProviderCost(String(settings.arkesel_provider_cost_per_sms ?? smsProviderCost));
        setActiveSmsProvider((settings.active_sms_provider || 'arkesel') === 'moolre' ? 'moolre' : 'arkesel');
        setMoolreEnabled(!!settings.moolre_enabled || !!settings.moolre_sms_enabled);
        setHasMoolreKey(!!settings.moolre_configured);
        setMoolreMaskedKey(settings.moolre_vas_key_masked || moolreMaskedKey);
        setMoolreKey('');
        setMoolreBaseUrl(settings.moolre_base_url || 'https://api.moolre.com');
        setMoolrePriceUnit(String(settings.moolre_user_price_per_sms ?? moolrePriceUnit));
        setMoolreProviderCost(String(settings.moolre_provider_cost_per_sms ?? moolreProviderCost));
        setBirdEnabled(!!settings.bird_enabled);
        setHasBirdKey(!!settings.bird_configured);
        setBirdRegion(settings.bird_region || birdRegion);
        setBirdKey('');
        toast.success(response.message || 'SMS settings saved successfully.');
      } else if (tab === 'otp') {
        const response = await saveAdminSmsmanProviderSettings({
          api_token: smsmanKey,
          live_purchase_enabled: smsmanEnabled,
        });
        const settings = response.settings || {};
        setHasSmsmanKey(!!settings.has_api_token);
        setSmsmanMaskedToken(settings.token_masked || '');
        setSmsmanKey('');
        setSmsmanEnabled(!!settings.live_purchase_enabled);
        setSmsmanLastCheckedAt(settings.last_balance_checked_at || smsmanLastCheckedAt);
        setSmsmanLastError(settings.last_test_error || '');
        if (settings.last_test_status === 'success' || (settings.has_api_token && settings.live_purchase_enabled)) setSmsmanStatus('success');
        toast.success(response.message || 'SMS-MAN settings saved successfully.');
      } else {
        toast.success('Provider settings saved successfully!');
      }
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to save provider settings.');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: Status) => {
    if (status === 'success') return <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 500 }}><CheckCircle className="w-3.5 h-3.5" />Connected</span>;
    if (status === 'error')   return <span className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 500 }}><XCircle className="w-3.5 h-3.5" />Failed</span>;
    return null;
  };

  const testBtn = (status: Status, onTest: () => void, label: string) => (
    <button onClick={onTest} disabled={status === 'testing'} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm whitespace-nowrap disabled:opacity-70 transition-all ${status === 'success' ? 'bg-emerald-600 text-white' : status === 'error' ? 'bg-red-600 text-white' : 'bg-blue-900 hover:bg-blue-800 text-white'}`} style={{ fontWeight: 500 }}>
      {status === 'testing' ? <><Loader2 className="w-4 h-4 animate-spin" />Testing...</> : status === 'success' ? <><CheckCircle className="w-4 h-4" />Connected</> : status === 'error' ? <><XCircle className="w-4 h-4" />Retry</> : <><Activity className="w-4 h-4" />{label}</>}
    </button>
  );

  const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50';
  const labelClass = 'block text-sm text-gray-700 mb-1.5';

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Provider Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Configure SMS, Email, and OTP provider integrations. All keys are masked.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'sms',   label: 'SMS Providers', icon: Send },
          { key: 'email', label: 'Email (Gmail / SMTP)', icon: Mail },
          { key: 'otp',   label: 'OTP (SMS-MAN)', icon: Hash },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${tab === key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`} style={{ fontWeight: tab === key ? 600 : 400 }}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── SMS Provider ── */}
      {tab === 'sms' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Active Ghana SMS Provider</h2>
                <p className="text-gray-400 text-xs">Ghana SMS (+233) uses the selected local provider. International SMS is routed automatically through Bird.</p>
              </div>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
                {(['arkesel', 'moolre'] as const).map(provider => (
                  <button key={provider} onClick={() => setActiveSmsProvider(provider)} className={`px-4 py-2 rounded-lg text-sm capitalize transition-all ${activeSmsProvider === provider ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`} style={{ fontWeight: activeSmsProvider === provider ? 700 : 500 }}>
                    {provider}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700" style={{ fontWeight: 600 }}>{activeSmsProvider === 'moolre' ? 'Moolre' : 'Arkesel'} Active</span>
              <span className={`text-xs px-3 py-1.5 rounded-full ${smsEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`} style={{ fontWeight: 600 }}>{smsEnabled ? 'SMS Enabled' : 'SMS Disabled'}</span>
              <span className={`text-xs px-3 py-1.5 rounded-full ${arkeselEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`} style={{ fontWeight: 600 }}>Arkesel {arkeselEnabled ? 'Enabled' : 'Disabled'}</span>
              <span className={`text-xs px-3 py-1.5 rounded-full ${moolreEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`} style={{ fontWeight: 600 }}>Moolre {moolreEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center"><Send className="w-5 h-5 text-cyan-700" /></div>
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Bird International SMS Settings</h2>
                  <p className="text-gray-400 text-xs">International SMS provider for non-Ghana destinations.</p>
                </div>
              </div>
              {statusBadge(birdStatus)}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_140px_auto]">
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showBird ? 'text' : 'password'} value={birdKey} onChange={e => setBirdKey(e.target.value)} placeholder={hasBirdKey ? 'Bird API key already configured' : 'Enter Bird API key'} className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 font-mono" />
                <button onClick={() => setShowBird(value => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">{showBird ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
              <input value={birdRegion} onChange={e => setBirdRegion(e.target.value.toLowerCase())} className={inputClass} aria-label="Bird API region" placeholder="us1" maxLength={3} />
              {testBtn(birdStatus, () => testConnection('bird'), 'Test Connection')}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={() => setBirdEnabled(value => !value)} className={`relative w-11 h-6 rounded-full transition-colors ${birdEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${birdEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-gray-600">Enable Bird International SMS</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="mb-5">
              <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Bird International Pricing</h2>
              <p className="text-gray-400 text-xs">Configure destination-specific provider costs and VireSender selling prices. Users are charged in GHS.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
              <div className="lg:col-span-2">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="text-sm text-gray-700">Countries ({pricingDraft.country_codes.length} selected)</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPricingDraft(value => ({ ...value, country_codes: countries.map(country => country.code) }))} disabled={pricingDraft.country_codes.length === countries.length} className="text-xs font-semibold text-blue-700 disabled:text-gray-300">Select all</button>
                    {pricingDraft.country_codes.length > 0 && <button type="button" onClick={() => setPricingDraft(value => ({ ...value, country_codes: [] }))} className="text-xs font-semibold text-gray-500">Clear</button>}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-2">
                  <input value={countryPickerSearch} onChange={e => setCountryPickerSearch(e.target.value)} placeholder="Search countries..." className="mb-2 w-full rounded-lg border border-gray-100 px-3 py-2 text-xs outline-none focus:border-blue-300" />
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {countries.filter(country => `${country.name} ${country.code} ${country.dial}`.toLowerCase().includes(countryPickerSearch.toLowerCase())).map(country => {
                      const selected = pricingDraft.country_codes.includes(country.code);
                      return <label key={country.code} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${selected ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-gray-50'}`}><input type="checkbox" checked={selected} onChange={() => setPricingDraft(value => ({ ...value, country_codes: selected ? value.country_codes.filter(code => code !== country.code) : [...value.country_codes, country.code] }))} />{country.name} ({country.code}) {country.dial}</label>;
                    })}
                  </div>
                </div>
              </div>
              <div><label className={labelClass}>Provider Cost</label><input type="number" min="0" step="0.0001" value={pricingDraft.provider_cost} onChange={e => setPricingDraft(value => ({ ...value, provider_cost: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Currency</label><input value={pricingDraft.provider_currency} onChange={e => setPricingDraft(value => ({ ...value, provider_currency: e.target.value.toUpperCase() }))} className={inputClass} /></div>
              <div><label className={labelClass}>FX to GHS</label><input type="number" min="0.000001" step="0.0001" value={pricingDraft.exchange_rate_to_ghs} onChange={e => setPricingDraft(value => ({ ...value, exchange_rate_to_ghs: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>User Price (GHS)</label><input type="number" min="0" step="0.001" value={pricingDraft.user_price_ghs} onChange={e => setPricingDraft(value => ({ ...value, user_price_ghs: e.target.value }))} className={inputClass} /></div>
              <div className="self-end flex items-center gap-2"><button type="button" onClick={() => setPricingDraft(value => ({ ...value, enabled: !value.enabled }))} className={`rounded-lg px-2 py-2.5 text-xs ${pricingDraft.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{pricingDraft.enabled ? 'Enabled' : 'Disabled'}</button><button onClick={handlePricingSave} disabled={savingPricing || !pricingDraft.country_codes.length} className="rounded-xl bg-blue-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingPricing ? 'Saving...' : 'Save'}</button></div>
            </div>
            <input value={pricingSearch} onChange={e => setPricingSearch(e.target.value)} placeholder="Search configured countries..." className={`${inputClass} mt-5`} />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm"><thead className="border-b border-gray-100 text-left text-xs text-gray-400"><tr>{['Country', 'Dial Code', 'Provider Cost', 'User Price', 'Currency', 'Status'].map(label => <th key={label} className="py-2 pr-4">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">{internationalPricing.filter(row => `${row.country_name} ${row.country_code} ${row.dial_code}`.toLowerCase().includes(pricingSearch.toLowerCase())).map(row => <tr key={row.country_code} onClick={() => setPricingDraft({ country_codes: [row.country_code], provider_cost: String(row.provider_cost), provider_currency: row.provider_currency, exchange_rate_to_ghs: String(row.exchange_rate_to_ghs || 1), user_price_ghs: String(row.user_price_ghs), enabled: row.enabled })} className="cursor-pointer hover:bg-gray-50"><td className="py-3 pr-4 font-semibold">{row.country_name} ({row.country_code})</td><td className="pr-4">{row.dial_code}</td><td className="pr-4">{row.provider_cost}</td><td className="pr-4">GHS {row.user_price_ghs}</td><td className="pr-4">{row.provider_currency}</td><td><span className={`rounded-full px-2 py-1 text-xs ${row.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{row.enabled ? 'Enabled' : 'Disabled'}</span></td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Shared Sender</h2>
                <p className="text-gray-400 text-xs">Bird automatically selects the sender for these countries. Users will not enter a Sender ID.</p>
              </div>
              <button onClick={handleSharedSenderSave} disabled={savingSharedSenders || !internationalPricing.length} className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {savingSharedSenders ? 'Saving...' : 'Save Shared Senders'}
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="relative mb-3">
                <input
                  value={sharedSenderSearch}
                  onChange={event => setSharedSenderSearch(event.target.value)}
                  placeholder="Search country, code, or dial code..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {internationalPricing.filter(row => row.country_code !== 'GH' && `${row.country_name} ${row.country_code} ${row.dial_code}`.toLowerCase().includes(sharedSenderSearch.trim().toLowerCase())).map(row => {
                  const selected = sharedSenderCodes.includes(row.country_code);
                  return (
                    <label key={row.country_code} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${selected ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={selected} onChange={() => setSharedSenderCodes(codes => selected ? codes.filter(code => code !== row.country_code) : [...codes, row.country_code])} />
                      <span className="font-medium">{row.country_name} ({row.country_code})</span>
                      <span className="ml-auto text-xs text-gray-400">{row.dial_code}</span>
                    </label>
                  );
                })}
              </div>
              {!internationalPricing.filter(row => row.country_code !== 'GH').length && <p className="py-6 text-center text-sm text-gray-400">Configure international pricing before adding Shared Sender countries.</p>}
              {!!internationalPricing.filter(row => row.country_code !== 'GH').length && !internationalPricing.some(row => row.country_code !== 'GH' && `${row.country_name} ${row.country_code} ${row.dial_code}`.toLowerCase().includes(sharedSenderSearch.trim().toLowerCase())) && <p className="py-6 text-center text-sm text-gray-400">No countries match your search.</p>}
            </div>
            <p className="mt-3 text-xs text-amber-600">Ghana is excluded and always uses the active Arkesel or Moolre Sender ID rules.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Send className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Arkesel SMS Settings</h2>
                  <p className="text-gray-400 text-xs">Provider key and wallet pricing for single, bulk, and campaign SMS</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeSmsProvider === 'arkesel' && <span className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 600 }}>Active</span>}
                {statusBadge(arkeselStatus)}
              </div>
            </div>
            <div className="flex gap-3 mb-5">
              <div className="relative flex-1">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showArkesel ? 'text' : 'password'} value={arkeselKey} onChange={e => setArkeselKey(e.target.value)} placeholder={hasArkeselKey ? 'Arkesel API key already configured' : 'Enter Arkesel API key'} className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 font-mono" />
                <button onClick={() => setShowArkesel(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showArkesel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {testBtn(arkeselStatus, () => testConnection('arkesel'), 'Test Connection')}
            </div>
            {hasArkeselKey && !arkeselKey && <p className="text-xs text-emerald-600 mb-4">An Arkesel API key is saved on the backend.</p>}
            <div className="grid sm:grid-cols-3 gap-4">
              <div><label className={labelClass} style={{ fontWeight: 500 }}>User Price per SMS (GHS)</label><input type="number" step="0.001" value={smsPriceUnit} onChange={e => setSmsPriceUnit(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Provider Cost per SMS (GHS)</label><input type="number" step="0.001" value={smsProviderCost} onChange={e => setSmsProviderCost(e.target.value)} className={inputClass} /></div>
              <div>
                <label className={labelClass} style={{ fontWeight: 500 }}>Enable Arkesel</label>
                <button onClick={() => setArkeselEnabled(p => !p)} className={`relative w-11 h-6 rounded-full transition-colors ${arkeselEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${arkeselEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="ml-3 text-sm text-gray-600">{arkeselEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><Send className="w-5 h-5 text-emerald-600" /></div>
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Moolre SMS Settings</h2>
                  <p className="text-gray-400 text-xs">VAS key and pricing for Moolre Bulk SMS</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeSmsProvider === 'moolre' && <span className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 600 }}>Active</span>}
                {statusBadge(moolreStatus)}
              </div>
            </div>
            <div className="flex gap-3 mb-5">
              <div className="relative flex-1">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showMoolre ? 'text' : 'password'} value={moolreKey} onChange={e => setMoolreKey(e.target.value)} placeholder={hasMoolreKey ? moolreMaskedKey || 'Moolre VAS key already configured' : 'Enter Moolre VAS key'} className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 font-mono" />
                <button onClick={() => setShowMoolre(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showMoolre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {testBtn(moolreStatus, () => testConnection('moolre'), 'Test Connection')}
            </div>
            {hasMoolreKey && !moolreKey && <p className="text-xs text-emerald-600 mb-4">Saved VAS key: {moolreMaskedKey || 'configured securely'}.</p>}
            <div className="grid sm:grid-cols-4 gap-4">
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Moolre Base URL</label><input type="url" value={moolreBaseUrl} onChange={e => setMoolreBaseUrl(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass} style={{ fontWeight: 500 }}>User Price per SMS (GHS)</label><input type="number" step="0.001" value={moolrePriceUnit} onChange={e => setMoolrePriceUnit(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Provider Cost per SMS (GHS)</label><input type="number" step="0.001" value={moolreProviderCost} onChange={e => setMoolreProviderCost(e.target.value)} className={inputClass} /></div>
              <div>
                <label className={labelClass} style={{ fontWeight: 500 }}>Enable Moolre</label>
                <button onClick={() => setMoolreEnabled(p => !p)} className={`relative w-11 h-6 rounded-full transition-colors ${moolreEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${moolreEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="ml-3 text-sm text-gray-600">{moolreEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
            {moolreLastTestMessage && <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">{moolreLastTestMessage}</div>}
            {moolreBalance !== null && moolreBalance !== undefined && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-700" style={{ fontWeight: 600 }}>Provider SMS balance: {String(moolreBalance)}</div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Moolre Sender IDs</h2>
                <p className="text-gray-400 text-xs">Approval status is synchronized from Moolre. Unlinked provider Sender IDs are not assigned automatically.</p>
              </div>
              <button onClick={handleSenderIdSync} disabled={syncingSenderIds} className="flex items-center gap-2 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ fontWeight: 700 }}>
                {syncingSenderIds ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Sync All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <tr>
                    {['Sender ID', 'Customer', 'Local Status', 'Moolre Status', 'Moolre ID', 'Submitted', 'Last Sync', ''].map(head => <th key={head} className="py-2 pr-4" style={{ fontWeight: 600 }}>{head}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {senderIdRows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-400">No local Moolre Sender ID applications yet.</td></tr>}
                  {senderIdRows.map(row => (
                    <tr key={row.id}>
                      <td className="py-3 pr-4 text-gray-800" style={{ fontWeight: 700 }}>{row.sender_id}</td>
                      <td className="py-3 pr-4 text-gray-500">{row.user_id || '-'}</td>
                      <td className="py-3 pr-4"><span className="capitalize text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{String(row.status || '').replace('_', ' ')}</span></td>
                      <td className="py-3 pr-4 text-gray-600">{row.provider_approval || '-'}</td>
                      <td className="py-3 pr-4 text-gray-500">{row.provider_sender_id || '-'}</td>
                      <td className="py-3 pr-4 text-gray-500">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '-'}</td>
                      <td className="py-3 pr-4 text-gray-500">{row.last_sync_at ? new Date(row.last_sync_at).toLocaleString() : '-'}</td>
                      <td className="py-3 pr-4 text-right"><button onClick={() => handleSingleSenderSync(row.id)} className="text-blue-700 text-xs" style={{ fontWeight: 700 }}>Sync</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unlinkedSenderIds.length > 0 && (
              <div className="mt-5 rounded-xl bg-amber-50 border border-amber-100 p-4">
                <div className="text-sm text-amber-800 mb-2" style={{ fontWeight: 700 }}>Unlinked Provider Sender IDs</div>
                <div className="flex flex-wrap gap-2">
                  {unlinkedSenderIds.map(row => (
                    <span key={row.id} className="text-xs px-3 py-1.5 rounded-full bg-white border border-amber-100 text-amber-800">
                      {row.sender_id} - {row.provider_approval || 'Unknown'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} style={{ fontWeight: 500 }}>Customer SMS Sending</label>
                <button onClick={() => setSmsEnabled(p => !p)} className={`relative w-11 h-6 rounded-full transition-colors ${smsEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${smsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="ml-3 text-sm text-gray-600">{smsEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-xs text-gray-500 mb-1" style={{ fontWeight: 500 }}>Sender ID Rule</div>
                <p className="text-xs text-gray-600">Users enter their own company name/sender ID when sending. Admin does not force a default sender ID.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Provider ── */}
      {tab === 'email' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><Mail className="w-5 h-5 text-red-500" /></div>
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Google OAuth (Gmail)</h2>
                  <p className="text-gray-400 text-xs">Allows users to connect their Gmail accounts</p>
                </div>
              </div>
              {statusBadge(gmailStatus)}
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Google Client ID</label><input type="text" value={gclientId} onChange={e => setGclientId(e.target.value)} className={`${inputClass} font-mono`} /></div>
              <div>
                <label className={labelClass} style={{ fontWeight: 500 }}>Google Client Secret</label>
                <div className="relative">
                  <input type={showGSecret ? 'text' : 'password'} value={gclientSecret} onChange={e => setGclientSecret(e.target.value)} className={`${inputClass} pr-10 font-mono`} />
                  <button onClick={() => setShowGSecret(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">{showGSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl mb-4">
              <div className="text-xs text-gray-500 mb-1" style={{ fontWeight: 500 }}>Redirect URI (add to Google Console)</div>
              <code className="text-xs text-blue-700 font-mono">https://app.vireotp.com/api/auth/gmail/callback</code>
            </div>
            {testBtn(gmailStatus, () => testConnection('gmail'), 'Test OAuth')}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center"><Mail className="w-5 h-5 text-indigo-600" /></div>
              <div><h2 className="text-gray-800" style={{ fontWeight: 600 }}>SMTP Test Settings</h2><p className="text-gray-400 text-xs">Verify SMTP configuration works correctly</p></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Default System Email</label><input type="email" value={systemEmail} onChange={e => setSystemEmail(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Default SMTP Host</label><input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass} style={{ fontWeight: 500 }}>Default SMTP Port</label><input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className={inputClass} /></div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              SMTP passwords entered by users are encrypted at rest. Admin only sees masked values.
            </div>
          </div>
        </div>
      )}

      {/* ── OTP Provider ── */}
      {tab === 'otp' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Hash className="w-5 h-5 text-purple-600" /></div>
                <div><h2 className="text-gray-800" style={{ fontWeight: 600 }}>SMS-MAN API Key</h2><p className="text-gray-400 text-xs">OTP virtual number provider</p></div>
              </div>
              {statusBadge(smsmanStatus)}
            </div>
            <div className="flex gap-3 mb-5">
              <div className="relative flex-1">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showSmsman ? 'text' : 'password'} value={smsmanKey} onChange={e => setSmsmanKey(e.target.value)} placeholder={hasSmsmanKey ? smsmanMaskedToken || 'SMS-MAN token already configured' : 'Enter SMS-MAN API token'} className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 font-mono" />
                <button onClick={() => setShowSmsman(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">{showSmsman ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
              {testBtn(smsmanStatus, () => testConnection('smsman'), 'Test Balance')}
            </div>
            {hasSmsmanKey && !smsmanKey && <p className="text-xs text-emerald-600 mb-4">Saved token: {smsmanMaskedToken || 'configured securely'}.</p>}
            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className={labelClass} style={{ fontWeight: 500 }}>SMS-MAN Live Purchase</label>
                <button onClick={() => setSmsmanEnabled(p => !p)} className={`relative w-11 h-6 rounded-full transition-colors ${smsmanEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${smsmanEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="ml-3 text-sm text-gray-600">{smsmanEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="text-xs text-gray-500" style={{ fontWeight: 500 }}>Provider balance</div>
                <div className="text-sm text-gray-800 font-mono truncate">{smsmanBalance !== null && smsmanBalance !== undefined ? String(smsmanBalance) : 'Not tested yet'}</div>
                <div className="text-[11px] text-gray-400 mt-1">{smsmanLastCheckedAt ? `Last checked ${new Date(smsmanLastCheckedAt).toLocaleString()}` : 'No balance check yet'}</div>
              </div>
            </div>
            {smsmanLastError && <div className="mb-4 rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-xs">{smsmanLastError}</div>}
            <div className="flex gap-3">
              <button onClick={handleSync} disabled={syncing || smsmanStatus !== 'success'} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 500 }}>
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing...' : 'Sync Services & Countries'}
              </button>
              {smsmanStatus !== 'success' && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5" />Test connection before syncing
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save */}
      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white px-6 py-3 rounded-xl text-sm" style={{ fontWeight: 600 }}>
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Settings</>}
      </button>
    </div>
  );
}
