import { useState } from 'react';
import { Key, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Globe, Activity, Zap, Save, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export default function AdminApiSettings() {
  const [apiKey, setApiKey] = useState('sk_smsm_prod_xxxxxxxxxxxxxxxxxxxxxxxx');
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    baseUrl: 'https://api.sms-man.com/control',
    timeout: '30',
    retryAttempts: '3',
    webhookUrl: 'https://yourapp.com/api/webhook/sms',
    autoRefresh: true,
    debugMode: false,
  });

  const syncLog = [
    { time: '2024-01-15 15:30', action: 'Services synced', count: '18 services', status: 'success' },
    { time: '2024-01-15 12:00', action: 'Countries synced', count: '50+ countries', status: 'success' },
    { time: '2024-01-14 18:00', action: 'Prices updated', count: '342 prices', status: 'success' },
    { time: '2024-01-14 09:00', action: 'Connection test', count: '—', status: 'error' },
  ];

  const handleTestConnection = async () => {
    setConnectionStatus('testing');
    await new Promise(r => setTimeout(r, 2000));
    if (apiKey.length > 10) {
      setConnectionStatus('success');
      toast.success('SMS-MAN API connected successfully!');
    } else {
      setConnectionStatus('error');
      toast.error('Connection failed. Check your API key.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2500));
    setSyncing(false);
    toast.success('Data synced from SMS-MAN: 18 services, 50 countries, 342 prices updated.');
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    toast.success('API settings saved successfully!');
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>API Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Configure SMS-MAN API integration and synchronization.</p>
      </div>

      {/* SMS-MAN API Key */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Key className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>SMS-MAN API Key</h2>
            <p className="text-gray-400 text-xs">Your secret key from sms-man.com dashboard</p>
          </div>
          {connectionStatus === 'success' && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 500 }}>
              <CheckCircle className="w-3.5 h-3.5" />
              Connected
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 500 }}>
              <XCircle className="w-3.5 h-3.5" />
              Failed
            </span>
          )}
        </div>

        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Enter your SMS-MAN API key..."
              className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 font-mono"
            />
            <button
              onClick={() => setShowKey(p => !p)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={connectionStatus === 'testing'}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm transition-all ${
              connectionStatus === 'success'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : connectionStatus === 'error'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-900 hover:bg-blue-800 text-white'
            } disabled:opacity-70`}
            style={{ fontWeight: 500 }}
          >
            {connectionStatus === 'testing' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</>
            ) : connectionStatus === 'success' ? (
              <><CheckCircle className="w-4 h-4" /> Connected</>
            ) : connectionStatus === 'error' ? (
              <><XCircle className="w-4 h-4" /> Retry</>
            ) : (
              <><Activity className="w-4 h-4" /> Test Connection</>
            )}
          </button>
        </div>

        {/* API endpoints info */}
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: 'API Base URL', value: settings.baseUrl, icon: Globe },
            { label: 'Request Timeout', value: `${settings.timeout}s`, icon: Activity },
            { label: 'Retry Attempts', value: settings.retryAttempts, icon: RefreshCw },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <item.icon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">{item.label}</span>
              </div>
              <span className="text-sm text-gray-700 font-mono" style={{ fontWeight: 500 }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Sync button */}
        <div className="flex gap-3">
          <button
            onClick={handleSync}
            disabled={syncing || connectionStatus !== 'success'}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm transition-colors"
            style={{ fontWeight: 500 }}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Data Now'}
          </button>
          {connectionStatus !== 'success' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl">
              <AlertTriangle className="w-3.5 h-3.5" />
              Test connection before syncing
            </div>
          )}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-gray-800 mb-5" style={{ fontWeight: 600 }}>Advanced Configuration</h2>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Base URL</label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => setSettings(p => ({ ...p, baseUrl: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Webhook URL (optional)</label>
              <input
                type="text"
                value={settings.webhookUrl}
                onChange={e => setSettings(p => ({ ...p, webhookUrl: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Request Timeout (seconds)</label>
              <input
                type="number"
                value={settings.timeout}
                onChange={e => setSettings(p => ({ ...p, timeout: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Retry Attempts</label>
              <input
                type="number"
                min="1"
                max="5"
                value={settings.retryAttempts}
                onChange={e => setSettings(p => ({ ...p, retryAttempts: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSettings(p => ({ ...p, autoRefresh: !p.autoRefresh }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.autoRefresh ? 'bg-blue-500' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Auto-Refresh OTP</span>
              <span className="text-xs text-gray-400">(Every 10s)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSettings(p => ({ ...p, debugMode: !p.debugMode }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.debugMode ? 'bg-amber-500' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.debugMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Debug Mode</span>
              <span className="text-xs text-amber-500">{settings.debugMode ? '(Active)' : ''}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white px-5 py-2.5 rounded-xl text-sm transition-colors"
          style={{ fontWeight: 500 }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Sync Log */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Sync History</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {syncLog.map((log, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                log.status === 'success' ? 'bg-emerald-100' : 'bg-red-100'
              }`}>
                {log.status === 'success'
                  ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                  : <XCircle className="w-4 h-4 text-red-600" />}
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{log.action}</div>
                <div className="text-xs text-gray-400">{log.count}</div>
              </div>
              <span className="text-xs text-gray-400">{log.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


