import { useEffect, useState } from 'react';
import { Search, Download, Eye, RefreshCw, Mail, CheckCircle, XCircle, Clock, AtSign, X, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminEmailAccounts,
  getAdminEmailLogs,
  getAdminEmailSettings,
  getAdminEmailStats,
  saveAdminEmailSettings,
} from '../../../lib/api.js';

const MOCK_EMAILS = [
  { id: 'EML-001', user: 'John Mensah',   from: 'john@gmail.com',    to: 'alice@example.com',  subject: 'Welcome to VireSend!',           type: 'Single',   provider: 'Gmail', status: 'sent',      date: '2025-01-15 14:30' },
  { id: 'EML-002', user: 'Sarah Connor',  from: 'sarah@company.com', to: 'campaign@list.com',  subject: 'January Newsletter',             type: 'Campaign', provider: 'SMTP',  status: 'sent',      date: '2025-01-15 14:15' },
  { id: 'EML-003', user: 'Alice Johnson', from: 'alice@gmail.com',   to: 'bob@corp.com',       subject: 'Invoice #INV-0042',              type: 'Single',   provider: 'Gmail', status: 'sent',      date: '2025-01-15 13:50' },
  { id: 'EML-004', user: 'Bob Smith',     from: 'bob@smtp.net',      to: 'leads@list.com',     subject: 'Special Offer — 50% Off!',      type: 'Bulk',     provider: 'SMTP',  status: 'failed',    date: '2025-01-15 13:30' },
  { id: 'EML-005', user: 'John Mensah',   from: 'john@gmail.com',    to: 'support@co.com',     subject: 'Re: Support Ticket #3821',      type: 'Single',   provider: 'Gmail', status: 'sent',      date: '2025-01-15 12:55' },
  { id: 'EML-006', user: 'Sarah Connor',  from: 'sarah@company.com', to: 'newsletter@list.com',subject: 'Product Launch Announcement',   type: 'Campaign', provider: 'SMTP',  status: 'scheduled', date: '2025-01-16 09:00' },
];

const MOCK_ACCOUNTS = [
  { id: 'ACC-001', user: 'John Mensah',   email: 'john@gmail.com',    provider: 'Gmail', status: 'connected', lastUsed: '2025-01-15 14:30', connected: '2025-01-01' },
  { id: 'ACC-002', user: 'Sarah Connor',  email: 'sarah@company.com', provider: 'SMTP',  status: 'connected', lastUsed: '2025-01-15 14:15', connected: '2024-12-20' },
  { id: 'ACC-003', user: 'Alice Johnson', email: 'alice@gmail.com',   provider: 'Gmail', status: 'connected', lastUsed: '2025-01-15 13:50', connected: '2025-01-05' },
  { id: 'ACC-004', user: 'Bob Smith',     email: 'bob@smtp.net',      provider: 'SMTP',  status: 'error',     lastUsed: '2025-01-14 18:00', connected: '2024-12-15' },
];

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  sent:      { label: 'Sent',      color: 'bg-blue-100 text-blue-700',   icon: Mail       },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700',     icon: XCircle    },
  scheduled: { label: 'Scheduled', color: 'bg-amber-100 text-amber-700', icon: Clock      },
  queued:    { label: 'Queued',    color: 'bg-amber-100 text-amber-700', icon: Clock      },
  bounced:   { label: 'Bounced',   color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  unknown:   { label: 'Unknown',   color: 'bg-gray-100 text-gray-600',    icon: Clock      },
};

const accStatusColor: Record<string, string> = {
  connected: 'bg-emerald-100 text-emerald-700',
  error:     'bg-red-100 text-red-700',
  revoked:   'bg-gray-100 text-gray-600',
};

export default function AdminEmailManagement() {
  const [tab, setTab]           = useState<'emails' | 'accounts'>('emails');
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [previewEmail, setPreviewEmail]     = useState<any | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [settings, setSettings] = useState({ email_enabled: true, free_pricing: false, email_free: false, cost_per_email: 0.001, provider_cost_per_email: 0, daily_send_limit_per_user: 1000, bulk_batch_size: 100 });
  const [savingSettings, setSavingSettings] = useState(false);

  const loadEmailAdmin = async () => {
    try {
      const [logsRes, accountsRes, statsRes, settingsRes] = await Promise.all([
        getAdminEmailLogs(),
        getAdminEmailAccounts(),
        getAdminEmailStats(),
        getAdminEmailSettings(),
      ]);
      setEmails(logsRes.logs || []);
      setAccounts(accountsRes.accounts || []);
      setStats(statsRes.stats || {});
      setSettings(prev => ({ ...prev, ...(settingsRes.settings || {}) }));
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not load email management data.');
    }
  };

  useEffect(() => {
    loadEmailAdmin();
  }, []);

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      const response = await saveAdminEmailSettings(settings);
      setSettings(response.settings || settings);
      toast.success('Email settings updated.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not save email settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredEmails = emails.filter(e => {
    const userName = e.user || e.user_email || '';
    const recipient = e.to_email || (e.recipients || []).join(', ');
    const matchSearch   = !search || userName.toLowerCase().includes(search.toLowerCase()) || recipient.includes(search) || (e.subject || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus   = statusFilter   === 'all' || e.status   === statusFilter;
    const matchProvider = providerFilter === 'all' || (e.provider || '').toLowerCase() === providerFilter.toLowerCase();
    return matchSearch && matchStatus && matchProvider;
  });

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Email Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monitor emails sent and connected email accounts.</p>
        </div>
        <button onClick={() => toast.success('Exporting email logs...')} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
          <Download className="w-4 h-4" />Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
        {[
          { label: 'Total Emails',       value: stats.total_sent || 0,       color: 'text-blue-600'   },
          { label: 'Failed',             value: stats.failed || 0,           color: 'text-red-600'    },
          { label: 'Bounced',            value: stats.bounced || 0,          color: 'text-orange-600' },
          { label: 'Unknown',            value: stats.unknown || 0,          color: 'text-gray-600'   },
          { label: 'Bounce Rate',        value: `${stats.bounce_rate || 0}%`, color: 'text-amber-600'  },
          { label: 'Revenue',            value: `GHS ${(stats.revenue || 0).toFixed(3)}`, color: 'text-emerald-600' },
          { label: 'Profit',             value: `GHS ${(stats.profit || 0).toFixed(3)}`, color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Email Pricing Settings</h2>
            <p className="text-gray-400 text-xs">Backend pricing is used for wallet deductions.</p>
          </div>
          <button onClick={saveSettings} disabled={savingSettings} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm">
            <Save className="w-4 h-4" />{savingSettings ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input type="checkbox" checked={settings.email_enabled} onChange={e => setSettings(prev => ({ ...prev, email_enabled: e.target.checked }))} />
            Enabled
          </label>
          <label className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${settings.free_pricing ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-700'}`}>
            <input type="checkbox" checked={!!settings.free_pricing} onChange={e => setSettings(prev => ({ ...prev, free_pricing: e.target.checked, email_free: e.target.checked, cost_per_email: e.target.checked ? 0 : (prev.cost_per_email || 0.001) }))} />
            Free
          </label>
          <input type="number" step="0.001" value={settings.cost_per_email} disabled={!!settings.free_pricing} onChange={e => setSettings(prev => ({ ...prev, cost_per_email: Number(e.target.value) }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:text-gray-400" placeholder="Cost per email" />
          <input type="number" step="0.001" value={settings.provider_cost_per_email} onChange={e => setSettings(prev => ({ ...prev, provider_cost_per_email: Number(e.target.value) }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Provider cost" />
          <input type="number" value={settings.daily_send_limit_per_user} onChange={e => setSettings(prev => ({ ...prev, daily_send_limit_per_user: Number(e.target.value) }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Daily limit" />
          <input type="number" value={settings.bulk_batch_size} onChange={e => setSettings(prev => ({ ...prev, bulk_batch_size: Number(e.target.value) }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Batch size" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['emails', 'accounts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm capitalize transition-all ${tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`} style={{ fontWeight: tab === t ? 600 : 400 }}>
            {t === 'emails' ? 'Email Logs' : 'Email Accounts'}
          </button>
        ))}
      </div>

      {tab === 'emails' ? (
        <>
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search user, recipient, subject..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
            </div>
            <div className="flex flex-wrap gap-2">
              {['all','queued','sent','failed','bounced','unknown'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{s}</button>
              ))}
              <div className="w-px bg-gray-200" />
              {['all','Gmail','SMTP'].map(p => (
                <button key={p} onClick={() => setProviderFilter(p)} className={`px-3 py-2 rounded-xl text-xs ${providerFilter === p ? 'bg-indigo-600 text-white' : 'border border-gray-200 text-gray-600'}`}>{p}</button>
              ))}
            </div>
          </div>

          {/* Email table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Email ID','User','From','To','Subject','Type','Provider','Status','Date','Actions'].map(h => (
                      <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredEmails.map(email => {
                    const statusInfo = statusConfig[email.status] || statusConfig.unknown || statusConfig.sent;
                    const StatusIcon = statusInfo.icon;
                    const recipient = email.to_email || (email.recipients || []).join(', ');
                    return (
                      <tr key={email.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3.5"><span className="font-mono text-xs text-gray-600">{email.email_id || email.id}</span></td>
                        <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>{email.user || email.user_email || '-'}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 font-mono">{email.from_email}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 font-mono">{recipient}</td>
                        <td className="px-4 py-3.5 max-w-[160px]"><p className="text-sm text-gray-700 truncate">{email.subject}</p></td>
                        <td className="px-4 py-3.5"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{email.type}</span></td>
                        <td className="px-4 py-3.5"><span className={`text-xs px-2 py-0.5 rounded-full ${email.provider === 'gmail' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`} style={{ fontWeight: 500 }}>{email.provider}</span></td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${statusInfo.color}`} style={{ fontWeight: 500 }}>
                            <StatusIcon className="w-3 h-3" />{statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{email.created_at}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPreviewEmail(email)} className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                            {email.status === 'failed' && <button onClick={() => toast.success(`Retrying ${email.id}`)} className="p-1.5 hover:bg-amber-50 text-amber-400 hover:text-amber-600 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Accounts table */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-amber-50 flex items-start gap-2">
            <AtSign className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">SMTP passwords are masked for security. Only connection status and metadata are shown.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['User','Email Address','Provider','Status','Last Used','Date Connected','Actions'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {accounts.map(acc => (
                  <tr key={acc.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>{acc.user || acc.user_email || '-'}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-gray-600">{acc.email}</td>
                    <td className="px-5 py-3.5"><span className={`text-xs px-2 py-0.5 rounded-full ${acc.provider === 'gmail' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`} style={{ fontWeight: 500 }}>{acc.provider}</span></td>
                    <td className="px-5 py-3.5"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${accStatusColor[acc.status] || accStatusColor.connected}`} style={{ fontWeight: 500 }}>{acc.status}</span></td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{acc.last_synced_at || acc.lastSynced}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{acc.created_at}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-gray-400">Metadata only</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewEmail(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Email Details — {previewEmail.id}</h2>
              <button onClick={() => setPreviewEmail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-3">
              {[['User', previewEmail.user], ['From', previewEmail.from], ['To', previewEmail.to], ['Subject', previewEmail.subject], ['Type', previewEmail.type], ['Provider', previewEmail.provider], ['Status', previewEmail.status], ['Date', previewEmail.date]].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5" style={{ fontWeight: 600 }}>{k}</span>
                  <span className="text-sm text-gray-700">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


