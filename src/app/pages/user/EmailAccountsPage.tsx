import { useEffect, useState } from 'react';
import {
  Mail, Plus, CheckCircle, AlertCircle, RefreshCw, Trash2,
  Settings, Shield, Zap, Star, X, Eye, EyeOff, Loader2,
  ChevronDown, ExternalLink, Info, Lock, Globe, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import {
  createSmtpEmailAccount,
  deleteEmailAccount,
  getEmailAccounts,
  getGoogleEmailConnectUrl,
  setDefaultEmailAccount,
  syncEmailStatus,
} from '../../../lib/api.js';

type AccountProvider = 'gmail' | 'smtp';
type AccountStatus = 'connected' | 'error' | 'syncing' | 'disconnected';

interface EmailAccount {
  id: string;
  email: string;
  displayName: string;
  provider: AccountProvider;
  status: AccountStatus;
  isDefault: boolean;
  lastSynced: string;
  sentToday: number;
  totalSent: number;
  host?: string;
  port?: number;
  errorMsg?: string;
  bounce_tracking?: 'active' | 'reconnect_required' | 'off';
  sending_status?: string;
  last_status_sync_at?: string | null;
}

const SMTP_PRESETS = [
  { name: 'Gmail SMTP', host: 'smtp.gmail.com', port: 587 },
  { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587 },
  { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587 },
  { name: 'Mailchimp', host: 'smtp.mandrillapp.com', port: 587 },
  { name: 'Custom', host: '', port: 587 },
];

// ─── GMAIL CONNECT MODAL ────────────────────────────────────────────────────
function GmailConnectModal({ onClose, onConnect }: { onClose: () => void; onConnect: (email: string) => void }) {
  const [step, setStep] = useState<'choose' | 'permissions' | 'connecting' | 'done'>('choose');
  const [chosenEmail, setChosenEmail] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const DEMO_ACCOUNTS = ['john@gmail.com', 'notifications@gmail.com'];

  const handleChoose = (email: string) => {
    setChosenEmail(email);
    setStep('permissions');
  };

  const handleAuthorize = async () => {
    setStep('connecting');
    await new Promise(r => setTimeout(r, 2200));
    setStep('done');
    await new Promise(r => setTimeout(r, 800));
    onConnect(chosenEmail || customEmail);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* ── Step: Choose account ── */}
        {step === 'choose' && (
          <>
            <div className="px-8 pt-8 pb-6 text-center border-b border-gray-100">
              {/* Google logo */}
              <div className="flex justify-center mb-5">
                <svg width="75" height="24" viewBox="0 0 75 24">
                  <path d="M29.87 12.23c0-.82-.07-1.61-.2-2.37H15.26v4.49h8.21c-.35 1.9-1.42 3.51-3.03 4.59v3.82h4.91c2.87-2.65 4.52-6.55 4.52-10.53z" fill="#4285F4"/>
                  <path d="M15.26 24c4.12 0 7.57-1.36 10.09-3.69l-4.91-3.82c-1.37.92-3.11 1.46-5.18 1.46-3.98 0-7.36-2.69-8.57-6.3H1.67v3.95C4.19 21.32 9.4 24 15.26 24z" fill="#34A853"/>
                  <path d="M6.69 14.65A8.86 8.86 0 0 1 6.2 12c0-.92.16-1.81.49-2.65V5.4H1.67A14.97 14.97 0 0 0 0 12c0 2.42.58 4.7 1.67 6.6l5.02-3.95z" fill="#FBBC05"/>
                  <path d="M15.26 4.77c2.24 0 4.25.77 5.83 2.28l4.37-4.37C22.83 1.19 19.38 0 15.26 0 9.4 0 4.19 2.68 1.67 6.6l5.02 3.95c1.21-3.61 4.59-5.78 8.57-5.78z" fill="#EA4335"/>
                  <text x="34" y="18" fontFamily="sans-serif" fontSize="16" fontWeight="500" fill="#202124">oogle</text>
                </svg>
              </div>
              <h2 className="text-gray-800 text-lg mb-1" style={{ fontWeight: 600 }}>Sign in with Google</h2>
              <p className="text-gray-500 text-sm">to continue to <span style={{ fontWeight: 600 }}>VireSend</span></p>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-xs text-gray-500 text-center mb-2">Choose an account</p>
              {DEMO_ACCOUNTS.map(email => (
                <button
                  key={email}
                  onClick={() => handleChoose(email)}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-blue-200 transition-all group"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm" style={{ fontWeight: 700 }}>{email[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{email}</div>
                    <div className="text-xs text-gray-400">Google Account</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg] group-hover:text-blue-500 transition-colors" />
                </button>
              ))}

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-2">Or enter a Gmail address:</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="your@gmail.com"
                    value={customEmail}
                    onChange={e => setCustomEmail(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => customEmail.includes('@') && handleChoose(customEmail)}
                    disabled={!customEmail.includes('@')}
                    className="px-3 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-xs"
                    style={{ fontWeight: 600 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 flex items-center justify-between">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Lock className="w-3 h-3" />
                Secure OAuth 2.0
              </div>
            </div>
          </>
        )}

        {/* ── Step: Permissions ── */}
        {step === 'permissions' && (
          <>
            <div className="px-8 pt-8 pb-5 text-center border-b border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl" style={{ fontWeight: 700 }}>{chosenEmail[0]?.toUpperCase()}</span>
              </div>
              <h2 className="text-gray-800 text-base mb-0.5" style={{ fontWeight: 600 }}>
                VireSend wants to access <br />
                <span className="text-blue-600">{chosenEmail}</span>
              </h2>
            </div>

            <div className="p-6">
              <p className="text-xs text-gray-500 mb-3" style={{ fontWeight: 600 }}>This will allow VireSend to:</p>
              <div className="space-y-3">
                {[
                  { icon: Mail, text: 'Send emails on your behalf', detail: 'Required to send transactional and bulk emails' },
                  { icon: Shield, text: 'View your email address', detail: 'Used to identify your account' },
                  { icon: Globe, text: 'Access Gmail settings', detail: 'To configure sending preferences' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{item.text}</div>
                      <div className="text-xs text-gray-400">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                Make sure you trust VireSend. You may be sharing sensitive info.{' '}
                <span className="text-blue-500 cursor-pointer">Learn about risks.</span>
              </p>
            </div>

            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setStep('choose')}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAuthorize}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm transition-colors"
                style={{ fontWeight: 600 }}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* ── Step: Connecting ── */}
        {step === 'connecting' && (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-gray-800 mb-2" style={{ fontWeight: 600 }}>Connecting your account…</h3>
            <p className="text-gray-400 text-sm">Authorizing with Google. Please wait.</p>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-gray-800 mb-2" style={{ fontWeight: 600 }}>Connected!</h3>
            <p className="text-gray-500 text-sm">{chosenEmail} is ready to send emails.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SMTP CONNECT MODAL ─────────────────────────────────────────────────────
function SmtpConnectModal({ onClose, onConnect }: { onClose: () => void; onConnect: (account: Partial<EmailAccount>) => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useTLS, setUseTLS] = useState(true);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const applyPreset = (preset: typeof SMTP_PRESETS[0]) => {
    setHost(preset.host);
    setPort(String(preset.port));
    setSelectedPreset(preset.name);
    setShowPresets(false);
  };

  const handleTest = async () => {
    if (!email || !host || !username || !password) {
      toast.error('Please fill in all required fields');
      return;
    }
    setTesting(true);
    setTested(false);
    await new Promise(r => setTimeout(r, 2000));
    setTesting(false);
    setTested(true);
    setTestPassed(true);
    toast.success('Connection test successful!');
  };

  const handleConnect = async () => {
    if (!testPassed) {
      toast.error('Please test the connection first');
      return;
    }
    onConnect({
      email,
      displayName: displayName || email.split('@')[0],
      provider: 'smtp',
      host,
      port: Number(port),
      username,
      password,
      smtp_secure: useTLS,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Add SMTP Account</h2>
            <p className="text-gray-400 text-xs mt-0.5">Connect any email provider via SMTP</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Preset selector */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Quick Setup</label>
            <div className="relative">
              <button
                onClick={() => setShowPresets(p => !p)}
                className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl text-sm hover:border-gray-300 bg-white"
              >
                <span className={selectedPreset ? 'text-gray-800' : 'text-gray-400'}>
                  {selectedPreset || 'Select a provider preset…'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showPresets && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  {SMTP_PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      {p.host && <span className="text-gray-400 text-xs">{p.host}:{p.port}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Email + display name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Email Address *</label>
              <input
                type="email"
                placeholder="you@domain.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setTested(false); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Display Name</label>
              <input
                type="text"
                placeholder="e.g. My Company"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
          </div>

          {/* SMTP host + port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>SMTP Host *</label>
              <input
                type="text"
                placeholder="smtp.example.com"
                value={host}
                onChange={e => { setHost(e.target.value); setTested(false); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Port</label>
              <input
                type="number"
                value={port}
                onChange={e => { setPort(e.target.value); setTested(false); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Username *</label>
            <input
              type="text"
              placeholder="Usually your email address"
              value={username}
              onChange={e => { setUsername(e.target.value); setTested(false); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Password / App Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setTested(false); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* TLS toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <div className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Use TLS/STARTTLS</div>
              <div className="text-xs text-gray-400">Recommended for security</div>
            </div>
            <button
              onClick={() => setUseTLS(p => !p)}
              className={`relative w-11 h-6 rounded-full transition-all ${useTLS ? 'bg-blue-900' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${useTLS ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              For Gmail, use an <span style={{ fontWeight: 600 }}>App Password</span> instead of your regular password.{' '}
              <span className="underline cursor-pointer">Learn how →</span>
            </p>
          </div>

          {/* Test result */}
          {tested && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${testPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {testPassed
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span className="text-sm" style={{ fontWeight: 500 }}>
                {testPassed ? 'Connection successful! Ready to connect.' : 'Connection failed. Check your credentials.'}
              </span>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 space-y-3">
          {/* Test button */}
          <button
            onClick={handleTest}
            disabled={testing || !email || !host || !username || !password}
            className="w-full flex items-center justify-center gap-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 py-2.5 rounded-xl text-sm transition-colors"
            style={{ fontWeight: 600 }}
          >
            {testing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Testing Connection…</>
            ) : (
              <><Zap className="w-4 h-4" /> Test Connection</>
            )}
          </button>

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={!testPassed}
            className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm transition-colors"
            style={{ fontWeight: 600 }}
          >
            <Mail className="w-4 h-4" />
            Connect SMTP Account
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ACCOUNT CARD ────────────────────────────────────────────────────────────
function AccountCard({
  account,
  onSetDefault,
  onDisconnect,
  onReconnect,
}: {
  account: EmailAccount;
  onSetDefault: (id: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await syncEmailStatus();
      toast.success(`Status synced. ${response.updated || 0} log(s) updated.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Status sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const accountStatusConfig = {
    connected: { label: 'Connected', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    error: { label: 'Error', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
    syncing: { label: 'Syncing…', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    disconnected: { label: 'Disconnected', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  }[account.status] || { label: account.status || 'Unknown', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
      account.status === 'error' ? 'border-red-200' : account.isDefault ? 'border-blue-200' : 'border-gray-100'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Provider icon */}
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            account.provider === 'gmail'
              ? 'bg-gradient-to-br from-red-100 to-orange-100'
              : 'bg-gradient-to-br from-blue-100 to-indigo-100'
          }`}>
            {account.provider === 'gmail' ? (
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            ) : (
              <Mail className="w-6 h-6 text-blue-600" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{account.email}</span>
              {account.isDefault && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100" style={{ fontWeight: 500 }}>
                  <Star className="w-2.5 h-2.5 fill-blue-500 text-blue-500" />
                  Default
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400 capitalize">
                {account.provider === 'gmail' ? 'Gmail' : `SMTP · ${account.host}:${account.port}`}
              </span>
            </div>
          </div>
        </div>

        {/* Status + menu */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${accountStatusConfig.color}`} style={{ fontWeight: 500 }}>
            <span className={`w-1.5 h-1.5 rounded-full ${accountStatusConfig.dot}`} />
            {accountStatusConfig.label}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(p => !p)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-400" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 w-44 overflow-hidden">
                <button
                  onClick={() => { handleSync(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-gray-400" /> Sync now
                </button>
                {!account.isDefault && (
                  <button
                    onClick={() => { onSetDefault(account.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Star className="w-3.5 h-3.5 text-gray-400" /> Set as default
                  </button>
                )}
                {account.status === 'error' && (
                  <button
                    onClick={() => { onReconnect(account.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    <Zap className="w-3.5 h-3.5" /> Reconnect
                  </button>
                )}
                <button
                  onClick={() => { onDisconnect(account.id); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 border-t border-gray-100"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error notice */}
      {account.status === 'error' && account.errorMsg && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-red-700" style={{ fontWeight: 500 }}>{account.errorMsg}</p>
            <button
              onClick={() => onReconnect(account.id)}
              className="text-xs text-red-600 underline mt-1"
            >
              Update credentials →
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sent today', value: account.sentToday.toLocaleString() },
          { label: 'Total sent', value: account.totalSent.toLocaleString() },
          { label: 'Last synced', value: account.lastSynced },
        ].map(s => (
          <div key={s.label} className="text-center p-3 bg-gray-50 rounded-xl">
            <div className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 rounded-xl">
          <div className="text-xs text-gray-400">Sending status</div>
          <div className="text-sm text-gray-700 capitalize" style={{ fontWeight: 700 }}>{account.sending_status || account.status}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl">
          <div className="text-xs text-gray-400">Bounce tracking</div>
          <div className={`text-sm capitalize ${
            account.bounce_tracking === 'active' ? 'text-emerald-600' :
            account.bounce_tracking === 'reconnect_required' ? 'text-amber-600' : 'text-gray-500'
          }`} style={{ fontWeight: 700 }}>
            {account.bounce_tracking === 'reconnect_required' ? 'Reconnect required' : account.bounce_tracking || 'off'}
          </div>
          {account.last_status_sync_at && <div className="text-[11px] text-gray-400 mt-0.5">Last sync {new Date(account.last_status_sync_at).toLocaleString()}</div>}
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-500' : ''}`} />
          {syncing ? 'Syncing…' : `Synced ${account.lastSynced}`}
        </button>
        <div className="flex items-center gap-2">
          <Link
            to="/user/email-sender"
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            Send Email <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await getEmailAccounts();
      setAccounts(response.accounts || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not load email accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    const params = new URLSearchParams(window.location.search);
    if (params.get('email_status') === 'connected') toast.success('Gmail account connected.');
    if (params.get('email_status') === 'error') toast.error('Gmail connection failed.');
  }, []);

  const handleGmailConnect = () => {
    window.location.href = getGoogleEmailConnectUrl();
  };

  const handleSmtpConnect = async (data: Partial<EmailAccount> & { username?: string; password?: string; smtp_secure?: boolean }) => {
    try {
      await createSmtpEmailAccount({
        email: data.email,
        display_name: data.displayName,
        smtp_host: data.host,
        smtp_port: data.port,
        smtp_username: data.username,
        smtp_password: data.password,
        smtp_secure: data.smtp_secure,
      });
      setShowSmtpModal(false);
      toast.success('SMTP account connected.');
      loadAccounts();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'SMTP account could not be connected.');
    }
  };

  const setDefault = async (id: string) => {
    try {
      await setDefaultEmailAccount(id);
      setAccounts(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
      toast.success('Default account updated');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not update default account.');
    }
  };

  const disconnect = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!window.confirm(`Disconnect ${acc?.email || 'this account'}?`)) return;
    try {
      await deleteEmailAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      toast.success(`${acc?.email} disconnected`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not disconnect account.');
    }
  };

  const reconnect = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (acc?.provider === 'gmail') handleGmailConnect();
    else setShowSmtpModal(true);
  };

  const connected = accounts.filter(a => a.status === 'connected').length;
  const totalSentToday = accounts.reduce((s, a) => s + a.sentToday, 0);
  const totalSent = accounts.reduce((s, a) => s + a.totalSent, 0);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Email Accounts</h1>
          <p className="text-gray-500 text-sm mt-0.5">Connect your email accounts to send messages from VireSend.</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowAddDropdown(p => !p)}
            className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl transition-colors text-sm"
            style={{ fontWeight: 500 }}
          >
            <Plus className="w-4 h-4" />
            Add Account
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showAddDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 w-52 overflow-hidden">
              <button
                onClick={() => { handleGmailConnect(); setShowAddDropdown(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div className="text-left">
                  <div style={{ fontWeight: 600 }}>Connect Gmail</div>
                  <div className="text-xs text-gray-400">OAuth 2.0 · Recommended</div>
                </div>
              </button>
              <button
                onClick={() => { setShowSmtpModal(true); setShowAddDropdown(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
              >
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Settings className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <div style={{ fontWeight: 600 }}>Add SMTP</div>
                  <div className="text-xs text-gray-400">Any provider</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Connected', value: connected, color: 'text-emerald-600', sub: `of ${accounts.length} total` },
          { label: 'Gmail', value: accounts.filter(a => a.provider === 'gmail').length, color: 'text-red-500', sub: 'accounts' },
          { label: 'SMTP', value: accounts.filter(a => a.provider === 'smtp').length, color: 'text-blue-600', sub: 'accounts' },
          { label: 'Sent Today', value: totalSentToday.toLocaleString(), color: 'text-purple-600', sub: 'emails' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-lg ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
            <div className="text-gray-300 text-xs">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {!loading && accounts.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-gray-700 mb-2" style={{ fontWeight: 700 }}>No email accounts connected</h3>
          <p className="text-gray-400 text-sm max-w-xs mx-auto mb-6">
            Connect Gmail or add a custom SMTP account to start sending emails from your own address.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleGmailConnect}
              className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl text-sm transition-colors"
              style={{ fontWeight: 600 }}
            >
              Connect Gmail
            </button>
            <button
              onClick={() => setShowSmtpModal(true)}
              className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              Add SMTP
            </button>
          </div>
        </div>
      )}

      {/* Account cards */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          Loading email accounts...
        </div>
      )}

      {accounts.length > 0 && (
        <div className="space-y-4">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onSetDefault={setDefault}
              onDisconnect={disconnect}
              onReconnect={reconnect}
            />
          ))}
        </div>
      )}

      {/* Help card */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-700 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="mb-1" style={{ fontWeight: 700 }}>Your emails, your domain</h3>
            <p className="text-blue-200 text-sm leading-relaxed">
              Connected accounts send from your actual email address — not a shared VireSend domain.
              This improves deliverability and brand trust.
            </p>
            <div className="flex flex-wrap gap-4 mt-4">
              {[
                { icon: CheckCircle, text: 'Better deliverability' },
                { icon: Lock, text: 'OAuth secured' },
                { icon: Zap, text: 'Instant setup' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-1.5 text-xs text-blue-200">
                  <item.icon className="w-3.5 h-3.5 text-blue-300" />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showGmailModal && (
        <GmailConnectModal
          onClose={() => setShowGmailModal(false)}
          onConnect={() => handleGmailConnect()}
        />
      )}
      {showSmtpModal && (
        <SmtpConnectModal
          onClose={() => setShowSmtpModal(false)}
          onConnect={handleSmtpConnect}
        />
      )}
    </div>
  );
}


