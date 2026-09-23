import { useEffect, useMemo, useState } from 'react';
import { Search, Download, Eye, Megaphone, CheckCircle, Clock, AlertCircle, Loader2, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminEmailCampaigns, getAdminSmsCampaigns } from '../../../lib/api.js';

type Campaign = {
  id: string;
  name: string;
  user: string;
  user_email?: string;
  channel: 'SMS' | 'Email';
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  estCost: number;
  actualCost: number;
  status: 'running' | 'completed' | 'paused' | 'failed' | 'scheduled' | 'draft';
  created?: string;
  createdAt?: string;
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  running: { label: 'Running', color: 'bg-blue-100 text-blue-700', icon: Megaphone },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  paused: { label: 'Paused', color: 'bg-amber-100 text-amber-700', icon: Clock },
  scheduled: { label: 'Scheduled', color: 'bg-purple-100 text-purple-700', icon: Clock },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600', icon: Clock },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

function normalizeSmsCampaign(c: any): Campaign {
  return {
    id: c.id,
    name: c.name,
    user: c.user || 'Unknown',
    user_email: c.user_email || '',
    channel: 'SMS',
    recipients: Number(c.recipients || 0),
    sent: Number(c.sent || 0),
    delivered: Number(c.delivered || 0),
    failed: Number(c.failed || 0),
    estCost: Number(c.estCost || 0),
    actualCost: Number(c.actualCost || 0),
    status: c.status || 'draft',
    created: c.createdAt,
    createdAt: c.createdAt,
  };
}

function normalizeEmailCampaign(c: any): Campaign {
  return {
    id: c.id,
    name: c.name,
    user: c.user || 'Unknown',
    user_email: c.user_email || '',
    channel: 'Email',
    recipients: Number(c.recipients || 0),
    sent: Number(c.sent || 0),
    delivered: Number(c.delivered || c.sent || 0),
    failed: Number(c.failed || 0),
    estCost: Number(c.estCost || 0),
    actualCost: Number(c.actualCost || 0),
    status: c.status || 'completed',
    created: c.created || c.createdAt,
    createdAt: c.createdAt || c.created,
  };
}

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const [smsResponse, emailResponse] = await Promise.all([getAdminSmsCampaigns(), getAdminEmailCampaigns()]);
      const merged = [
        ...(smsResponse.campaigns || []).map(normalizeSmsCampaign),
        ...(emailResponse.campaigns || []).map(normalizeEmailCampaign),
      ].sort((a, b) => new Date(b.createdAt || b.created || 0).getTime() - new Date(a.createdAt || a.created || 0).getTime());
      setCampaigns(merged);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const filtered = useMemo(() => campaigns.filter(c => {
    const query = search.toLowerCase();
    const matchSearch = !query || c.name.toLowerCase().includes(query) || c.user.toLowerCase().includes(query) || (c.user_email || '').toLowerCase().includes(query);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchChannel = channelFilter === 'all' || c.channel === channelFilter;
    return matchSearch && matchStatus && matchChannel;
  }), [campaigns, search, statusFilter, channelFilter]);

  const stats = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'running').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    failed: campaigns.filter(c => c.status === 'failed').length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Campaigns</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monitor all SMS and Email campaigns created by users.</p>
        </div>
        <button onClick={() => toast.success('Export coming from the connected campaign table.')} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
          <Download className="w-4 h-4" />Export
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: stats.total, color: 'text-blue-600' },
          { label: 'Running', value: stats.running, color: 'text-amber-600' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600' },
          { label: 'Failed', value: stats.failed, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-2xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search campaigns or users..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'running', 'completed', 'scheduled', 'draft', 'failed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{s}</button>
          ))}
          <div className="w-px bg-gray-200" />
          {['all', 'SMS', 'Email'].map(ch => (
            <button key={ch} onClick={() => setChannelFilter(ch)} className={`px-3 py-2 rounded-xl text-xs ${channelFilter === ch ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600'}`}>{ch}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Name', 'User', 'Channel', 'Recipients', 'Sent', 'Accepted', 'Failed', 'Est. Cost', 'Actual Cost', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading campaigns...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">No campaigns found.</td></tr>
              ) : filtered.map(c => {
                const sc = statusConfig[c.status] || statusConfig.draft;
                const StatusIcon = sc.icon;
                const deliveryRate = c.sent > 0 ? ((c.delivered / c.sent) * 100).toFixed(0) : '-';
                return (
                  <tr key={`${c.channel}-${c.id}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{c.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{c.id}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-gray-600">{c.user}</div>
                      {c.user_email && <div className="text-xs text-gray-400">{c.user_email}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${c.channel === 'SMS' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'}`} style={{ fontWeight: 500 }}>
                        {c.channel === 'SMS' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{c.recipients.toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{c.sent.toLocaleString()}</td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-emerald-700" style={{ fontWeight: 500 }}>{c.delivered.toLocaleString()}</div>
                      <div className="text-[10px] text-emerald-500">{deliveryRate !== '-' ? `${deliveryRate}%` : '-'}</div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-red-600">{c.failed}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">GHS {c.estCost.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700" style={{ fontWeight: 500 }}>GHS {c.actualCost.toFixed(2)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${sc.color}`} style={{ fontWeight: 500 }}>
                        <StatusIcon className="w-3 h-3" />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{c.createdAt ? new Date(c.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => toast.info('Campaign detail view can be added next.')} className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                    </td>
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
