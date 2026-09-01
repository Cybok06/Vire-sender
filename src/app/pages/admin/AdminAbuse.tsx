import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, UserX, Pause, Ban, Eye, Plus, X, Shield, Loader2, Activity, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  addAdminAbuseBlockedKeyword,
  cancelAbuseCampaign,
  deleteAdminAbuseBlockedKeyword,
  getAdminAbuseBlockedKeywords,
  getAdminAbuseHighVolumeUsers,
  getAdminAbuseRepeatedFailures,
  getAdminAbuseSummary,
  getAdminAbuseSuspiciousCampaigns,
  limitAbuseUser,
  pauseAbuseCampaign,
  reactivateAbuseUser,
  suspendAbuseUser,
} from '../../../lib/api.js';

const NEW_KEYWORD_PLACEHOLDER = 'e.g. "win now" or "click link"';

export default function AdminAbuse() {
  const [users, setUsers] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [summary, setSummary] = useState({ suspicious_count: 0 });
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryRes, usersRes, campaignsRes, failuresRes, keywordsRes] = await Promise.all([
        getAdminAbuseSummary(),
        getAdminAbuseHighVolumeUsers(),
        getAdminAbuseSuspiciousCampaigns(),
        getAdminAbuseRepeatedFailures(),
        getAdminAbuseBlockedKeywords(),
      ]);
      setSummary(summaryRes.summary || { suspicious_count: 0 });
      setUsers(usersRes.users || []);
      setCampaigns(campaignsRes.campaigns || []);
      setFailures(failuresRes.failures || []);
      setKeywords(keywordsRes.keywords || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load abuse monitoring data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const alertCount = useMemo(
    () => users.filter(user => user.flag !== 'normal').length + campaigns.length + failures.length + Number(summary.suspicious_count || 0),
    [campaigns.length, failures.length, summary.suspicious_count, users],
  );

  const updateUser = async (user: any, action: 'suspend' | 'limit' | 'reactivate') => {
    try {
      setWorking(`${action}-${user.id}`);
      if (action === 'suspend') await suspendAbuseUser(user.id);
      if (action === 'limit') await limitAbuseUser(user.id);
      if (action === 'reactivate') await reactivateAbuseUser(user.id);
      toast.success(`User ${action === 'reactivate' ? 'reactivated' : action + 'ed'}.`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Action failed.');
    } finally {
      setWorking(null);
    }
  };

  const updateCampaign = async (campaign: any, action: 'pause' | 'cancel') => {
    try {
      setWorking(`${action}-${campaign.id}`);
      if (action === 'pause') await pauseAbuseCampaign(campaign.id);
      if (action === 'cancel') await cancelAbuseCampaign(campaign.id);
      toast.success(`Campaign ${action}d.`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Campaign action failed.');
    } finally {
      setWorking(null);
    }
  };

  const addKeyword = async () => {
    if (!newKeyword.trim()) return;
    try {
      const response = await addAdminAbuseBlockedKeyword(newKeyword.trim());
      setKeywords(response.keywords || []);
      setNewKeyword('');
      toast.success('Keyword blocked.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to add keyword.');
    }
  };

  const removeKeyword = async (kw: string) => {
    try {
      const response = await deleteAdminAbuseBlockedKeyword(kw);
      setKeywords(response.keywords || []);
      toast.info(`"${kw}" unblocked.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to remove keyword.');
    }
  };

  const flagColor: Record<string, string> = {
    high_failure: 'bg-red-100 text-red-700',
    bulk_spam: 'bg-orange-100 text-orange-700',
    api_abuse: 'bg-purple-100 text-purple-700',
    widget_abuse: 'bg-amber-100 text-amber-700',
    normal: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Abuse &amp; Compliance Monitoring</h1>
            <p className="text-gray-500 text-sm mt-0.5">Detect spam campaigns, excessive API usage, and suspicious activity.</p>
          </div>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Refresh
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm text-amber-800" style={{ fontWeight: 600 }}>{alertCount} Suspicious Activities Detected</div>
          <p className="text-xs text-amber-700 mt-0.5">Generated from SMS, email, API, campaigns, widgets, and abuse events.</p>
        </div>
        <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full" style={{ fontWeight: 600 }}>Requires Review</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-500" />
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>High-Volume Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['User','SMS Today','Emails','API Calls','Flag','Status','Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.email || u.id} className={`hover:bg-gray-50/50 ${u.flag !== 'normal' ? 'bg-red-50/20' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{u.name}</div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-700">{Number(u.sms_today || u.sms || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-700">{Number(u.emails_today || u.emails || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-700">{Number(u.api_calls_today || u.api || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${flagColor[u.flag] || flagColor.normal}`} style={{ fontWeight: 500 }}>
                      {u.flag !== 'normal' && <AlertTriangle className="w-3 h-3" />}
                      {String(u.flag || 'normal').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : u.status === 'limited' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`} style={{ fontWeight: 500 }}>{u.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      {u.status !== 'suspended' && (
                        <button onClick={() => updateUser(u, 'suspend')} disabled={working === `suspend-${u.id}`} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs transition-colors disabled:opacity-60" style={{ fontWeight: 500 }}>
                          {working === `suspend-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />} Suspend
                        </button>
                      )}
                      {u.status === 'active' && <button onClick={() => updateUser(u, 'limit')} className="px-2.5 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs">Limit</button>}
                      {u.status !== 'active' && <button onClick={() => updateUser(u, 'reactivate')} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs">Reactivate</button>}
                      <button onClick={() => toast.info(`Viewing activity for ${u.name}`)} className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">No user activity found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Suspicious Bulk Campaigns</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {campaigns.map(c => (
            <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.channel === 'SMS' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'}`}>{c.channel}</span>
                </div>
                <div className="text-xs text-gray-400">{c.user} - {Number(c.recipients || 0).toLocaleString()} recipients - {c.failed} failed</div>
                <div className="flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3 text-red-500" /><span className="text-xs text-red-600">{c.flag}</span></div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {c.status !== 'paused' && c.status !== 'cancelled' && (
                  <button onClick={() => updateCampaign(c, 'pause')} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl text-xs hover:bg-amber-100" style={{ fontWeight: 500 }}><Pause className="w-3.5 h-3.5" />Pause</button>
                )}
                <button onClick={() => updateCampaign(c, 'cancel')} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs hover:bg-red-100" style={{ fontWeight: 500 }}><Ban className="w-3.5 h-3.5" />Cancel</button>
              </div>
            </div>
          ))}
          {!campaigns.length && <div className="px-5 py-8 text-center text-sm text-gray-400">No suspicious campaigns detected.</div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <X className="w-4 h-4 text-red-500" />
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Repeated Failed SMS Abuse</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {failures.map((a, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-4 h-4 text-red-500" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{a.user}</span><span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>{a.count}x failed</span></div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">{a.recipient} - {a.reason}</div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{a.date ? new Date(a.date).toLocaleString() : 'Today'}</span>
            </div>
          ))}
          {!failures.length && <div className="px-5 py-8 text-center text-sm text-gray-400">No repeated SMS failures detected.</div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Ban className="w-4 h-4 text-gray-500" />
          <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Blocked Keywords</h2>
          <span className="text-xs text-gray-400">Messages containing these words are blocked or flagged.</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {keywords.map(kw => (
            <div key={kw} className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-1.5 rounded-xl" style={{ fontWeight: 500 }}>
              {kw}
              <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-red-900 transition-colors"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <input type="text" placeholder={NEW_KEYWORD_PLACEHOLDER} value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
          <button onClick={addKeyword} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}><Plus className="w-4 h-4" />Block</button>
        </div>
      </div>
    </div>
  );
}
