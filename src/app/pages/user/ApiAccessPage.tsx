import { useEffect, useMemo, useState } from 'react';
import {
  Activity, CheckCircle, Copy, Eye, EyeOff,
  ExternalLink, Globe, Key, Loader2, RefreshCw, Save, Trash2, XCircle, Zap
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { toast } from 'sonner';
import { safeClipboardCopy } from '../../utils/clipboard';
import {
  generateDeveloperApiKey,
  getDeveloperApiKey,
  regenerateDeveloperApiKey,
  revokeDeveloperApiKey,
  saveDeveloperWebhook,
} from '../../../lib/api';

type ApiKeyRecord = {
  id: string;
  api_key?: string;
  masked_key: string;
  status: 'active' | 'limited' | 'suspended' | 'revoked';
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  last_used_at?: string;
  delivery_callback_url?: string;
  has_webhook_secret?: boolean;
};

type ApiLog = {
  request_id: string;
  endpoint: string;
  method: string;
  recipient: string;
  status: 'success' | 'failed';
  http_code: number;
  cost: number;
  created_at?: string;
};

const codeExamples: Record<'cURL' | 'Python' | 'JavaScript' | 'PHP', string> = {
  cURL: `curl -X POST https://www.viresender.com/v1/sms/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "233201234567",
    "message": "Hello from VireSend!",
    "sender_id": "MyBrand"
  }'`,
  Python: `import requests

response = requests.post(
    "https://www.viresender.com/v1/sms/send",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "to": "233201234567",
        "message": "Hello from VireSend!",
        "sender_id": "MyBrand",
    },
)

print(response.json())`,
  JavaScript: `const response = await fetch("https://www.viresender.com/v1/sms/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    to: "233201234567",
    message: "Hello from VireSend!",
    sender_id: "MyBrand"
  })
});

console.log(await response.json());`,
  PHP: `<?php
$curl = curl_init();

curl_setopt_array($curl, [
  CURLOPT_URL => "https://www.viresender.com/v1/sms/send",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer YOUR_API_KEY",
    "Content-Type: application/json"
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "to" => "233201234567",
    "message" => "Hello from VireSend!",
    "sender_id" => "MyBrand"
  ])
]);

$response = curl_exec($curl);
curl_close($curl);
echo $response;`,
};

const bulkExample = `curl -X POST https://www.viresender.com/v1/sms/bulk \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipients": ["233201234567", "233241234567"],
    "message": "Hello from VireSend!",
    "sender_id": "MyBrand"
  }'`;

const balanceExample = `curl -X GET https://www.viresender.com/v1/balance \\
  -H "Authorization: Bearer YOUR_API_KEY"`;

const responseExample = `{
  "success": true,
  "sms_id": "SMS-12345",
  "status": "sent",
  "recipient_count": 1,
  "sms_units": 1,
  "cost": 0.04,
  "currency": "GHS",
  "wallet_balance": 199.96
}`;

const endpoints = [
  { method: 'POST', path: '/v1/sms/send', desc: 'Send one SMS message' },
  { method: 'POST', path: '/v1/sms/bulk', desc: 'Send SMS to multiple recipients' },
  { method: 'GET', path: '/v1/sms/status/:sms_id', desc: 'Check SMS delivery status' },
  { method: 'GET', path: '/v1/balance', desc: 'Get wallet balance' },
  { method: 'GET', path: '/v1/senders', desc: 'List recently used Sender IDs' },
];

function formatDate(value?: string) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatMoney(value = 0) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

export default function ApiAccessPage() {
  const [apiKey, setApiKey] = useState<ApiKeyRecord | null>(null);
  const [plainKey, setPlainKey] = useState('');
  const [stats, setStats] = useState<any>({ chart: [], logs: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [codeTab, setCodeTab] = useState<'cURL' | 'Python' | 'JavaScript' | 'PHP'>('cURL');
  const [statusFilter, setStatusFilter] = useState('all');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  const loadData = async () => {
    try {
      const data = await getDeveloperApiKey();
      setApiKey(data.api_key);
      setStats(data.stats || { chart: [], logs: [] });
      setCallbackUrl(data.api_key?.delivery_callback_url || '');
    } catch (error: any) {
      toast.error(error.message || 'Unable to load API access.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const displayKey = useMemo(() => {
    if (!apiKey) return 'No API key generated yet';
    if (showKey && plainKey) return plainKey;
    return apiKey.masked_key;
  }, [apiKey, plainKey, showKey]);

  const filteredLogs = (stats.logs || []).filter((log: ApiLog) => statusFilter === 'all' || log.status === statusFilter);
  const totalSuccess = apiKey?.successful_requests || 0;
  const totalFailed = apiKey?.failed_requests || 0;

  const copyCurrentKey = () => {
    if (!plainKey) {
      toast.info('For security, the full API key is only shown when generated or regenerated.');
      return;
    }
    safeClipboardCopy(plainKey);
    toast.success('API key copied.');
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const data = await generateDeveloperApiKey();
      setApiKey(data.api_key);
      setPlainKey(data.api_key?.api_key || '');
      setShowKey(true);
      toast.success(data.message || 'API key generated.');
    } catch (error: any) {
      toast.error(error.message || 'Unable to generate API key.');
    } finally {
      setBusy(false);
    }
  };

  const regenerateKey = async () => {
    if (!confirm('Regenerate this API key? Existing integrations will stop working immediately.')) return;
    setBusy(true);
    try {
      const data = await regenerateDeveloperApiKey();
      setApiKey(data.api_key);
      setPlainKey(data.api_key?.api_key || '');
      setShowKey(true);
      toast.success(data.message || 'API key regenerated.');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Unable to regenerate API key.');
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async () => {
    if (!confirm('Revoke this API key? Active integrations will stop working.')) return;
    setBusy(true);
    try {
      await revokeDeveloperApiKey();
      setApiKey(null);
      setPlainKey('');
      toast.success('API key revoked.');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Unable to revoke API key.');
    } finally {
      setBusy(false);
    }
  };

  const saveWebhook = async () => {
    setBusy(true);
    try {
      const data = await saveDeveloperWebhook({
        delivery_callback_url: callbackUrl,
        webhook_secret: webhookSecret,
      });
      setApiKey(data.api_key);
      setWebhookSecret('');
      toast.success(data.message || 'Webhook settings saved.');
    } catch (error: any) {
      toast.error(error.message || 'Unable to save webhook settings.');
    } finally {
      setBusy(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2.5">
        <div className="text-xs text-gray-500 mb-1" style={{ fontWeight: 600 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="text-xs" style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading API access...
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-7 space-y-6" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl" style={{ color: '#0F172A', fontWeight: 800 }}>Developer API</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Integrate VireSend SMS into your applications and third-party systems.</p>
        </div>
        <a href="#docs" className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors" style={{ border: '1.5px solid rgba(37,99,235,0.2)', color: '#2563EB', background: 'rgba(37,99,235,0.05)', fontWeight: 600 }}>
          <ExternalLink className="w-4 h-4" />API Docs
        </a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Requests Today', value: stats.requests_today || 0, icon: Activity, color: '#2563EB', bg: 'rgba(37,99,235,0.1)' },
          { label: 'Successful', value: stats.successful_today || 0, icon: CheckCircle, color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
          { label: 'Failed', value: stats.failed_today || 0, icon: XCircle, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
          { label: 'Balance Used Today', value: formatMoney(stats.wallet_used_today || 0), icon: Zap, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: s.bg }}>
              <s.icon className="w-5 h-5" style={{ color: s.color }} />
            </div>
            <div className="text-2xl" style={{ color: s.color, fontWeight: 800 }}>{s.value}</div>
            <div className="text-sm mt-0.5" style={{ color: '#64748B' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.1)' }}>
            <Key className="w-5 h-5" style={{ color: '#2563EB' }} />
          </div>
          <div>
            <h2 className="text-sm" style={{ color: '#0F172A', fontWeight: 700 }}>API Key Management</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Only the full key shown after generation can be copied. Store it securely.</p>
          </div>
          {apiKey && (
            <span className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full capitalize" style={{ background: apiKey.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.12)', color: apiKey.status === 'active' ? '#059669' : '#92400e', fontWeight: 600 }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: apiKey.status === 'active' ? '#10B981' : '#F59E0B' }} />{apiKey.status}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <div className="w-full pl-4 pr-12 py-3 rounded-xl font-mono text-sm overflow-x-auto" style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#374151', letterSpacing: '0.02em' }}>
              {displayKey}
            </div>
            <button disabled={!plainKey} onClick={() => setShowKey(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 disabled:opacity-40" style={{ color: '#94a3b8' }}>
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={copyCurrentKey} disabled={!apiKey} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm transition-all hover:opacity-90 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white', fontWeight: 600 }}>
            <Copy className="w-4 h-4" />Copy
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Status', value: apiKey?.status || 'Not generated' },
            { label: 'Last Used', value: formatDate(apiKey?.last_used_at) },
            { label: 'Total Requests', value: (apiKey?.total_requests || 0).toLocaleString() },
          ].map(m => (
            <div key={m.label} className="rounded-xl p-3" style={{ background: '#f1f5f9' }}>
              <div className="text-xs mb-0.5" style={{ color: '#94a3b8' }}>{m.label}</div>
              <div className="text-sm capitalize" style={{ color: '#374151', fontWeight: 700 }}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {!apiKey ? (
            <button onClick={createKey} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm disabled:opacity-70 transition-colors" style={{ background: 'rgba(37,99,235,0.08)', color: '#1D4ED8', border: '1px solid rgba(37,99,235,0.25)', fontWeight: 600 }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}Generate API Key
            </button>
          ) : (
            <>
              <button onClick={regenerateKey} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm disabled:opacity-70 transition-colors" style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e', border: '1px solid rgba(245,158,11,0.25)', fontWeight: 600 }}>
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />Regenerate Key
              </button>
              <button onClick={revokeKey} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-70" style={{ background: 'rgba(239,68,68,0.06)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)', fontWeight: 600 }}>
                <Trash2 className="w-4 h-4" />Revoke Key
              </button>
            </>
          )}
        </div>
      </div>

      <div id="docs" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>SMS API Documentation</h2>
          <p className="text-gray-400 text-xs mt-0.5">Base URL: <code className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">https://www.viresender.com</code></p>
        </div>
        <div className="px-6 pt-4 pb-2">
          <div className="text-xs text-gray-500 mb-3 uppercase tracking-wide" style={{ fontWeight: 600 }}>Available Endpoints</div>
          <div className="flex flex-col gap-1.5">
            {endpoints.map(e => (
              <div key={e.path} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${e.method === 'POST' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`} style={{ fontWeight: 700 }}>{e.method}</span>
                <code className="text-sm text-gray-700 font-mono">{e.path}</code>
                <span className="text-xs text-gray-400">{e.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <strong>Sender ID:</strong> pass <code>sender_id</code> on every SMS request. It should be your company or brand name and may be up to 11 alphanumeric characters.
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="text-xs text-gray-500 mb-3 mt-4 uppercase tracking-wide" style={{ fontWeight: 600 }}>Send SMS Examples</div>
          <div className="rounded-2xl overflow-hidden border border-gray-200">
            <div className="flex bg-gray-50 border-b border-gray-200">
              {(['cURL', 'Python', 'JavaScript', 'PHP'] as const).map(lang => (
                <button key={lang} onClick={() => setCodeTab(lang)} className={`px-4 py-2.5 text-xs transition-colors ${codeTab === lang ? 'bg-white text-gray-800 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`} style={{ fontWeight: codeTab === lang ? 600 : 400 }}>{lang}</button>
              ))}
              <div className="flex-1" />
              <button onClick={() => { safeClipboardCopy(codeExamples[codeTab]); toast.success(`${codeTab} code copied.`); }} className="flex items-center gap-1.5 px-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <Copy className="w-3.5 h-3.5" />Copy
              </button>
            </div>
            <pre className="px-5 py-4 text-xs leading-relaxed overflow-x-auto" style={{ background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', margin: 0 }}><code>{codeExamples[codeTab]}</code></pre>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            {[['Bulk SMS', bulkExample], ['Balance', balanceExample]].map(([title, example]) => (
              <div key={title} className="rounded-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs text-gray-600" style={{ fontWeight: 600 }}>{title}</span>
                  <button onClick={() => { safeClipboardCopy(example); toast.success(`${title} example copied.`); }} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Copy</button>
                </div>
                <pre className="px-4 py-3 text-xs leading-relaxed overflow-x-auto" style={{ background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', margin: 0 }}><code>{example}</code></pre>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl overflow-hidden border border-gray-200">
            <div className="flex items-center gap-2 bg-gray-50 border-b border-gray-200 px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-600" style={{ fontWeight: 600 }}>200 OK</span>
              <button onClick={() => { safeClipboardCopy(responseExample); toast.success('Response copied.'); }} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><Copy className="w-3 h-3" />Copy</button>
            </div>
            <pre className="px-5 py-4 text-xs leading-relaxed overflow-x-auto" style={{ background: '#0f172a', color: '#86efac', fontFamily: 'monospace', margin: 0 }}><code>{responseExample}</code></pre>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Globe className="w-5 h-5 text-purple-600" /></div>
          <div>
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Webhook Settings</h2>
            <p className="text-gray-400 text-xs">Receive SMS delivery status updates to your server.</p>
          </div>
        </div>
        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Delivery Callback URL</label>
            <input type="url" value={callbackUrl} onChange={e => setCallbackUrl(e.target.value)} placeholder="https://yourapp.com/webhooks/delivery" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 font-mono" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Webhook Secret</label>
            <div className="relative">
              <input type={showWebhookSecret ? 'text' : 'password'} value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} placeholder={apiKey?.has_webhook_secret ? 'Secret already saved' : 'Set a webhook secret'} className="w-full border border-gray-200 rounded-xl px-4 pr-10 py-2.5 text-sm outline-none focus:border-blue-400 font-mono" />
              <button onClick={() => setShowWebhookSecret(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">{showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Use this to verify delivery callbacks with the <code className="text-blue-600">X-VireSend-Signature</code> header.</p>
          </div>
        </div>
        <button onClick={saveWebhook} disabled={busy || !apiKey} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white px-5 py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Webhook</>}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Requests Per Day</h2>
            <p className="text-gray-400 text-xs">Last 7 days</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={stats.chart || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs><linearGradient id="apiGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06B6D4" stopOpacity={0.2} /><stop offset="95%" stopColor="#06B6D4" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total" stroke="#06B6D4" strokeWidth={2} fill="url(#apiGrad)" name="total" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Success vs Failed</h2>
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />Success ({totalSuccess})</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-red-400" />Failed ({totalFailed})</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.chart || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="success" fill="#10B981" radius={[4, 4, 0, 0]} name="success" />
              <Bar dataKey="failed" fill="#EF4444" radius={[4, 4, 0, 0]} name="failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>API Request Logs</h2>
          <div className="flex gap-2">
            {['all', 'success', 'failed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-xl text-xs capitalize transition-colors ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Request ID', 'Endpoint', 'Recipient', 'Status', 'HTTP Code', 'Cost', 'Time'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredLogs.map((log: ApiLog) => (
                <tr key={log.request_id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-500">{log.request_id}</span></td>
                  <td className="px-4 py-3.5"><code className="text-xs font-mono text-gray-700 bg-gray-50 px-2 py-0.5 rounded-lg">{log.method} {log.endpoint}</code></td>
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{log.recipient || '-'}</td>
                  <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${log.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`} style={{ fontWeight: 500 }}>{log.status === 'success' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{log.status}</span></td>
                  <td className="px-4 py-3.5"><span className={`font-mono text-xs ${log.http_code < 300 ? 'text-emerald-600' : 'text-red-600'}`} style={{ fontWeight: 600 }}>{log.http_code}</span></td>
                  <td className="px-4 py-3.5 text-sm text-gray-600" style={{ fontWeight: log.cost > 0 ? 600 : 400 }}>{log.cost > 0 ? formatMoney(log.cost) : '-'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 font-mono whitespace-nowrap">{formatDate(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 text-sm text-gray-500">
          Showing {filteredLogs.length} of {(stats.logs || []).length} requests
        </div>
      </div>
    </div>
  );
}
