import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Plus, Search, Users, CheckCircle, Play, Eye, Trash2, X, Calendar,
  MessageSquare, MoreHorizontal, Loader2, Pause
} from 'lucide-react';
import { toast } from 'sonner';
import { createSmsCampaign, deleteSmsCampaign, getSmsSenderIds, getTemplate, getTemplates, getSmsCampaigns, getSmsContactGroups, sendSmsCampaign, useTemplate } from '../../../lib/api.js';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';

type CampaignStatus = 'completed' | 'running' | 'scheduled' | 'draft' | 'paused';

interface Campaign {
  id: string;
  name: string;
  sender_id: string;
  message: string;
  group: string;
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  status: CampaignStatus;
  createdAt: string;
  scheduledAt: string | null;
}

type ContactGroup = { name: string; count: number };
type SmsTemplate = { id: string; name: string; type?: 'sms' | 'email'; message?: string; body?: string };

const statusConfig: Record<CampaignStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  running: { label: 'Running', color: 'bg-blue-100 text-blue-700', icon: Play },
  scheduled: { label: 'Scheduled', color: 'bg-purple-100 text-purple-700', icon: Calendar },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600', icon: MessageSquare },
  paused: { label: 'Paused', color: 'bg-amber-100 text-amber-700', icon: Pause },
};

function smsParts(message: string) {
  return Math.max(1, Math.ceil((message || '').length / 160));
}

function ProgressBar({ value, total, color = 'bg-blue-500' }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export default function SmsCampaignsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [senderIds, setSenderIds] = useState<string[]>([]);
  const [activeSmsProvider, setActiveSmsProvider] = useState('arkesel');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newSenderId, setNewSenderId] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newAudience, setNewAudience] = useState('');
  const [newSchedule, setNewSchedule] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sendNow, setSendNow] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const [campaignResponse, groupResponse, templateResponse] = await Promise.all([
        getSmsCampaigns(),
        getSmsContactGroups(),
        getTemplates({ type: 'sms' }),
      ]);
      const senderResponse = await getSmsSenderIds();
      setCampaigns(campaignResponse.campaigns || []);
      setGroups(groupResponse.groups || []);
      setTemplates(templateResponse.templates || []);
      setSenderIds(senderResponse.sender_ids || []);
      setActiveSmsProvider(senderResponse.active_sms_provider || 'arkesel');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load SMS campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    const templateId = searchParams.get('templateId');
    if (!templateId) return;
    getTemplate(templateId)
      .then(response => {
        const template = response.template;
        if (!template) return;
        if ((template.type || 'sms') !== 'sms') {
          toast.error('This is not an SMS template.');
          return;
        }
        setSelectedTemplateId(template.id);
        setNewMessage(template.body || template.message || '');
        setShowCreateModal(true);
        setSearchParams({}, { replace: true });
      })
      .catch((error: any) => toast.error(error?.data?.message || error?.message || 'Unable to load template.'));
  }, [searchParams, setSearchParams]);

  const filtered = campaigns.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = useMemo(() => ({
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'running').length,
    totalReach: campaigns.reduce((s, c) => s + c.recipients, 0),
    deliveryRate: Math.round((campaigns.reduce((s, c) => s + c.delivered, 0) / Math.max(campaigns.reduce((s, c) => s + c.sent, 0), 1)) * 100),
  }), [campaigns]);
  const moolreActive = activeSmsProvider === 'moolre';
  const noMoolreSenderId = moolreActive && senderIds.length === 0;

  const resetForm = () => {
    setNewName('');
    setNewSenderId('');
    setNewMessage('');
    setNewAudience('');
    setNewSchedule('');
    setSelectedTemplateId('');
    setSendNow(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newSenderId.trim() || !newMessage.trim() || !newAudience) {
      toast.error('Please fill in campaign name, sender ID, message, and audience.');
      return;
    }
    if (noMoolreSenderId) {
      toast.error('You need an approved Sender ID before sending SMS through Moolre.');
      return;
    }
    try {
      setCreating(true);
      const response = await createSmsCampaign({
        name: newName,
        sender_id: newSenderId,
        message: newMessage,
        group: newAudience,
        scheduled_at: sendNow ? '' : newSchedule,
        template_id: selectedTemplateId,
      });
      if (sendNow && response.campaign?.id) {
        await sendSmsCampaign(response.campaign.id);
        await loadCampaigns();
      } else {
        setCampaigns(prev => [response.campaign, ...prev]);
      }
      if (selectedTemplateId) {
        useTemplate(selectedTemplateId).catch(() => null);
      }
      setShowCreateModal(false);
      resetForm();
      toast.success(sendNow ? 'Campaign sent successfully.' : 'Campaign created successfully.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to create campaign.');
    } finally {
      setCreating(false);
    }
  };

  const handleSendCampaign = async (id: string) => {
    try {
      setProcessingId(id);
      const response = await sendSmsCampaign(id);
      toast.success(response.message || 'Campaign sent successfully.');
      await loadCampaigns();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to send campaign.');
    } finally {
      setProcessingId(null);
      setOpenMenuId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSmsCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      toast.success('Campaign deleted.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete campaign.');
    } finally {
      setOpenMenuId(null);
    }
  };

  const { isEnabled } = useServiceAvailability();
  if (!isEnabled('sms_campaigns')) return <ServiceLockedOverlay serviceKey="sms_campaigns" />;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>SMS Campaigns</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage and track all your SMS campaigns.</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl transition-colors text-sm" style={{ fontWeight: 500 }}>
          <Plus className="w-4 h-4" />Create Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: stats.total, color: 'text-blue-600' },
          { label: 'Running Now', value: stats.running, color: 'text-emerald-600' },
          { label: 'Total Reach', value: stats.totalReach.toLocaleString(), color: 'text-purple-600' },
          { label: 'Avg Delivery Rate', value: `${stats.deliveryRate}%`, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-lg ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'running', 'scheduled', 'completed', 'draft', 'paused'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Campaign', 'Recipients', 'Sent', 'Delivered', 'Failed', 'Status', 'Created', ''].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Loading campaigns...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400"><MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />No campaigns found.</td></tr>
              ) : filtered.map(camp => {
                const s = statusConfig[camp.status] || statusConfig.draft;
                const StatusIcon = s.icon;
                return (
                  <tr key={camp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{camp.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate">{camp.message}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Sender ID: {camp.sender_id || '-'}</div>
                      {camp.scheduledAt && <div className="text-xs text-purple-600 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />{camp.scheduledAt}</div>}
                    </td>
                    <td className="px-4 py-4"><div className="flex items-center gap-1.5 text-sm text-gray-700" style={{ fontWeight: 500 }}><Users className="w-3.5 h-3.5 text-gray-400" />{camp.recipients.toLocaleString()}</div></td>
                    <td className="px-4 py-4"><div className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{camp.sent.toLocaleString()}</div>{camp.recipients > 0 && camp.sent > 0 && <ProgressBar value={camp.sent} total={camp.recipients} />}</td>
                    <td className="px-4 py-4"><div className="text-sm text-emerald-600" style={{ fontWeight: 500 }}>{camp.delivered.toLocaleString()}</div>{camp.sent > 0 && <ProgressBar value={camp.delivered} total={camp.sent} color="bg-emerald-500" />}</td>
                    <td className="px-4 py-4"><div className={`text-sm ${camp.failed > 0 ? 'text-red-500' : 'text-gray-400'}`} style={{ fontWeight: 500 }}>{camp.failed.toLocaleString()}</div></td>
                    <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${s.color}`} style={{ fontWeight: 500 }}><StatusIcon className="w-3 h-3" />{s.label}</span></td>
                    <td className="px-4 py-4"><span className="text-xs text-gray-400">{camp.createdAt ? new Date(camp.createdAt).toLocaleDateString() : '-'}</span></td>
                    <td className="px-4 py-4">
                      <div className="relative">
                        <button onClick={() => setOpenMenuId(openMenuId === camp.id ? null : camp.id)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><MoreHorizontal className="w-4 h-4 text-gray-400" /></button>
                        {openMenuId === camp.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 w-44 overflow-hidden">
                            <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"><Eye className="w-4 h-4 text-gray-400" /> View Details</button>
                            <button disabled={processingId === camp.id || camp.status === 'completed'} onClick={() => handleSendCampaign(camp.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"><Play className="w-4 h-4" /> Send Now</button>
                            <button onClick={() => handleDelete(camp.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Delete</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && <div className="px-5 py-3 border-t border-gray-100 bg-gray-50"><span className="text-sm text-gray-500">Showing {filtered.length} of {campaigns.length} campaigns</span></div>}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Create SMS Campaign</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <TextField label="Campaign Name" value={newName} onChange={setNewName} placeholder="e.g. May Promotion" />
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Company Name/Sender ID</label>
                {moolreActive ? (
                  <select value={newSenderId} onChange={e => setNewSenderId(e.target.value)} disabled={noMoolreSenderId} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:bg-gray-50">
                    <option value="">{noMoolreSenderId ? 'No approved Sender ID' : 'Select an approved Sender ID'}</option>
                    {senderIds.map(id => <option key={id} value={id}>{id} - Approved</option>)}
                  </select>
                ) : (
                  <input type="text" maxLength={11} placeholder="e.g. MyBrand" value={newSenderId} onChange={e => setNewSenderId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                )}
                {moolreActive && (
                  <p className="text-xs text-gray-500 mt-1">
                    {noMoolreSenderId ? <>You need an approved Sender ID before sending campaigns through Moolre. <Link to="/user/sender-ids" className="text-blue-700 underline">Manage Sender IDs</Link></> : 'Only Moolre-approved Sender IDs are selectable.'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Select SMS Template</label>
                <select value={selectedTemplateId} onChange={e => {
                  const id = e.target.value;
                  setSelectedTemplateId(id);
                  const template = templates.find(item => item.id === id);
                  if (template) setNewMessage(template.body || template.message || '');
                }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-700">
                  <option value="">Start from blank message</option>
                  {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Message</label>
                <textarea placeholder="Your campaign message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} rows={5} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none" />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">{newMessage.length} characters</p>
                  <p className="text-xs text-gray-400">{smsParts(newMessage)} SMS part{smsParts(newMessage) > 1 ? 's' : ''}</p>
                </div>
                {newMessage && <div className="mt-2 bg-gray-50 rounded-xl p-3 text-xs text-gray-600 whitespace-pre-wrap">{newMessage}</div>}
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Recipients</label>
                <div className="flex gap-2 flex-wrap">
                  {groups.map(g => (
                    <button key={g.name} onClick={() => setNewAudience(newAudience === g.name ? '' : g.name)} className={`px-3 py-1.5 rounded-full text-xs transition-colors ${newAudience === g.name ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>{g.name} ({g.count})</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Delivery</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setSendNow(true)} className={`rounded-xl border px-3 py-2.5 text-sm ${sendNow ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>Send now</button>
                  <button type="button" onClick={() => setSendNow(false)} className={`rounded-xl border px-3 py-2.5 text-sm ${!sendNow ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>Save or schedule</button>
                </div>
                {!sendNow && <input type="datetime-local" value={newSchedule} onChange={e => setNewSchedule(e.target.value)} className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 py-2.5 rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>{creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Working...</> : sendNow ? 'Send Campaign' : 'Create Campaign'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; maxLength?: number }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <input type="text" maxLength={maxLength} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
    </div>
  );
}
