import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Search, Pause, Play, XCircle, Eye, Download, CheckCircle, Clock, AlertCircle, X, Monitor, Smartphone, Loader2, Mail, Paperclip, Image as ImageIcon, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';
import { toast } from 'sonner';
import { getContactGroups, getEmailAccounts, getEmailCampaigns, getTemplate, getTemplates, sendBulkEmail, useTemplate } from '../../../lib/api.js';

type Campaign = {
  id: string; name: string; fromEmail: string; recipients: number;
  sent: number; failed: number; scheduledAt: string;
  status: 'running' | 'completed' | 'paused' | 'scheduled' | 'failed';
  subject: string; htmlPreview: string;
};

type EmailTemplate = { id: string; name: string; type?: 'email' | 'sms'; subject?: string; body?: string; message?: string };
type EmailAccount = { id?: string; account_id?: string; email_address?: string; emailAddress?: string; display_name?: string; displayName?: string; provider?: string; status?: string; is_default?: boolean };
type ContactGroup = { name: string; count?: number };
const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024;

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  running: { label: 'Running', color: 'bg-blue-100 text-blue-700', icon: Play },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  paused: { label: 'Paused', color: 'bg-amber-100 text-amber-700', icon: Pause },
  scheduled: { label: 'Scheduled', color: 'bg-purple-100 text-purple-700', icon: Clock },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

function accountId(account: EmailAccount) {
  return account.account_id || account.id || '';
}

function accountLabel(account: EmailAccount) {
  const email = account.email_address || account.emailAddress || '';
  const name = account.display_name || account.displayName || email;
  return `${name}${email && name !== email ? ` (${email})` : ''}${account.provider ? ` - ${account.provider}` : ''}`;
}

function renderSample(message: string) {
  return (message || '')
    .replace(/\{\{\s*contact_name\s*\}\}/g, 'Ama Mensah')
    .replace(/\{\{\s*email\s*\}\}/g, 'ama@example.com')
    .replace(/\{\{\s*location\s*\}\}/g, 'Accra')
    .replace(/\{\{\s*company\s*\}\}/g, 'VireSend');
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function validateAttachmentFiles(files: File[]) {
  const allowed = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'];
  const blocked = ['exe', 'bat', 'cmd', 'js', 'php', 'sh', 'zip'];
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (blocked.includes(ext) || !allowed.includes(ext)) return `${file.name} is not an allowed attachment type.`;
    if (file.size > MAX_ATTACHMENT_SIZE) return `${file.name} is larger than 10MB.`;
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_ATTACHMENT_SIZE) return 'Total attachments cannot exceed 20MB.';
  return '';
}

function attachmentIcon(file: File) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return { icon: ImageIcon, color: 'text-emerald-600 bg-emerald-50' };
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return { icon: FileSpreadsheet, color: 'text-green-600 bg-green-50' };
  if (name.endsWith('.pdf')) return { icon: FileText, color: 'text-red-600 bg-red-50' };
  return { icon: FileType2, color: 'text-blue-600 bg-blue-50' };
}

function AttachmentPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const total = files.reduce((sum, file) => sum + file.size, 0);

  const addFiles = (incoming: FileList | File[]) => {
    const next = [...files, ...Array.from(incoming)];
    const error = validateAttachmentFiles(next);
    if (error) {
      toast.error(error);
      return;
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`block border border-dashed rounded-xl p-3 cursor-pointer transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300'}`}
      >
        <input type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={e => {
          if (e.target.files) addFiles(e.target.files);
          e.currentTarget.value = '';
        }} />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center"><Paperclip className="w-4 h-4 text-blue-700" /></div>
            <div>
              <div className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Attachments</div>
              <div className="text-xs text-gray-400">Drop files here or click to attach.</div>
            </div>
          </div>
          <span className="text-xs text-blue-700" style={{ fontWeight: 700 }}>Attach File</span>
        </div>
      </label>
      {files.map((file, index) => {
        const meta = attachmentIcon(file);
        const Icon = meta.icon;
        return (
          <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.color}`}><Icon className="w-4 h-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-800 truncate" style={{ fontWeight: 600 }}>{file.name}</div>
              <div className="text-xs text-gray-400">{formatBytes(file.size)}</div>
            </div>
            <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} className="p-1.5 hover:bg-red-50 rounded-lg"><X className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
          </div>
        );
      })}
      {files.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{files.length} file{files.length === 1 ? '' : 's'}</span>
          <span>{formatBytes(total)} total</span>
        </div>
      )}
      {total > 15 * 1024 * 1024 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2">Large attachments may take longer to send.</div>}
    </div>
  );
}

function campaignFormData(fields: Record<string, any>, attachments: File[]) {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.append(key, Array.isArray(value) ? value.join('\n') : value ?? ''));
  attachments.forEach(file => data.append('attachments', file));
  return data;
}

function CreateCampaignModal({ onClose, onCreated, initialTemplateId }: { onClose: () => void; onCreated: () => void; initialTemplateId?: string | null }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [account, setAccount] = useState('');
  const [body, setBody] = useState('');
  const [htmlMode, setHtmlMode] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(true);
  const [manualRecipients, setManualRecipients] = useState('');
  const [group, setGroup] = useState('');
  const [templateId, setTemplateId] = useState(initialTemplateId || '');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const recipientCount = useMemo(() => {
    const manual = manualRecipients.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
    const selected = groups.find(item => item.name === group)?.count || 0;
    return manual.length + selected;
  }, [manualRecipients, group, groups]);

  const applyTemplate = (template: EmailTemplate) => {
    if ((template.type || 'email') !== 'email') {
      toast.error('Select an email template for email campaigns.');
      return;
    }
    setTemplateId(template.id);
    setSubject(template.subject || '');
    setBody(template.body || template.message || '');
  };

  useEffect(() => {
    Promise.all([getEmailAccounts(), getTemplates({ type: 'email' }), getContactGroups()])
      .then(([accountResponse, templateResponse, groupResponse]) => {
        const loadedAccounts = accountResponse.accounts || [];
        setAccounts(loadedAccounts);
        setTemplates(templateResponse.templates || []);
        setGroups(groupResponse.groups || []);
        const defaultAccount = loadedAccounts.find((item: EmailAccount) => item.is_default) || loadedAccounts[0];
        if (defaultAccount) setAccount(accountId(defaultAccount));
      })
      .catch((error: any) => toast.error(error?.data?.message || error?.message || 'Unable to load campaign data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!initialTemplateId) return;
    getTemplate(initialTemplateId)
      .then(response => {
        if (response.template) applyTemplate(response.template);
      })
      .catch((error: any) => toast.error(error?.data?.message || error?.message || 'Unable to load template.'));
  }, [initialTemplateId]);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const template = templates.find(item => item.id === id);
    if (template) applyTemplate(template);
  };

  const validateStep = () => {
    if (step === 1 && (!name.trim() || !account || recipientCount < 1)) {
      toast.error('Campaign name, sender account, and recipients are required.');
      return false;
    }
    if (step === 2 && (!subject.trim() || !body.trim())) {
      toast.error('Email subject and body are required.');
      return false;
    }
    const attachmentError = validateAttachmentFiles(attachments);
    if (attachmentError) {
      toast.error(attachmentError);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep(value => Math.min(3, value + 1));
  };

  const handleCreate = async () => {
    if (!validateStep()) return;
    try {
      setSaving(true);
      const payload = {
        account_id: account,
        campaign_name: name,
        template_id: templateId,
        recipients: manualRecipients,
        group,
        subject,
        message: body,
        format: htmlMode ? 'html' : 'plain',
        type: 'campaign',
      };
      const response = await sendBulkEmail(attachments.length ? campaignFormData(payload, attachments) : payload);
      if (templateId) {
        useTemplate(templateId).catch(() => null);
      }
      toast.success(response.message || 'Email campaign sent. Delivery status will update if a bounce is detected.');
      onCreated();
      onClose();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to create campaign.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Create Email Campaign</h2>
            <div className="flex items-center gap-2 mt-1">
              {[1, 2, 3].map(s => (
                <div key={s} className={`w-6 h-1.5 rounded-full transition-colors ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
              ))}
              <span className="text-xs text-gray-400">Step {step} of 3</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading email campaign tools...</div>
        ) : (
          <div className="grid lg:grid-cols-5 gap-0 overflow-y-auto">
            <div className="lg:col-span-3 p-6 space-y-4">
              {step === 1 && (
                <>
                  <Field label="Campaign Name" value={name} onChange={setName} placeholder="e.g. May Newsletter" />
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Sender Account</label>
                    <select value={account} onChange={e => setAccount(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-700">
                      <option value="">Select connected email account</option>
                      {accounts.map(item => <option key={accountId(item)} value={accountId(item)}>{accountLabel(item)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Contact Group</label>
                    <select value={group} onChange={e => setGroup(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-700">
                      <option value="">No group selected</option>
                      {groups.map(item => <option key={item.name} value={item.name}>{item.name} ({item.count || 0})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Manual Recipients</label>
                    <textarea value={manualRecipients} onChange={e => setManualRecipients(e.target.value)} rows={4} placeholder="one@email.com&#10;two@email.com" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 resize-none" />
                    <p className="text-xs text-gray-400 mt-1">{recipientCount} recipient{recipientCount === 1 ? '' : 's'} selected</p>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Select Template</label>
                    <select value={templateId} onChange={e => handleTemplateChange(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-700">
                      <option value="">Start from blank email</option>
                      {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </div>
                  <Field label="Subject Line" value={subject} onChange={setSubject} placeholder="e.g. Welcome to VireSend" />
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Message Body</label>
                      <div className="flex bg-gray-100 rounded-xl p-0.5">
                        {['Plain', 'HTML'].map(m => (
                          <button key={m} onClick={() => setHtmlMode(m === 'HTML')} className={`px-3 py-1 rounded-lg text-xs transition-all ${(htmlMode ? 'HTML' : 'Plain') === m ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`} style={{ fontWeight: (htmlMode ? 'HTML' : 'Plain') === m ? 600 : 400 }}>{m}</button>
                        ))}
                      </div>
                    </div>
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder={htmlMode ? '<h1>Hello {{contact_name}}</h1>' : 'Hi {{contact_name}}, your message here...'} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 font-mono resize-none" />
                  </div>
                  <AttachmentPicker files={attachments} onChange={setAttachments} />
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <label className="block text-sm text-gray-700 mb-3" style={{ fontWeight: 500 }}>Schedule</label>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <button type="button" onClick={() => setScheduleNow(true)} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${scheduleNow ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                        <Play className="w-4 h-4 text-blue-700" />
                        <span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>Send Now</span>
                      </button>
                      <button type="button" onClick={() => setScheduleNow(false)} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${!scheduleNow ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                        <Clock className="w-4 h-4 text-blue-700" />
                        <span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>Schedule Later</span>
                      </button>
                    </div>
                    {!scheduleNow && <input type="datetime-local" className="mt-3 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400" />}
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl space-y-2 text-sm">
                    {[['Campaign', name || '-'], ['Recipients', recipientCount.toLocaleString()], ['Subject', subject || '-'], ['Schedule', scheduleNow ? 'Send immediately' : 'Scheduled']].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <span className="text-gray-500">{k}:</span>
                        <span className="text-gray-800 text-right" style={{ fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                    {attachments.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Attachments:</span>
                        <span className="text-gray-800 text-right" style={{ fontWeight: 500 }}>{attachments.length} file{attachments.length === 1 ? '' : 's'}</span>
                      </div>
                    )}
                  </div>
                  {!scheduleNow && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">Scheduling UI is ready, but this backend currently sends email campaigns immediately. Use Send Now for live sending.</div>}
                </>
              )}
            </div>

            <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50 p-6">
              <div className="flex items-center gap-2 text-sm text-gray-700 mb-3" style={{ fontWeight: 700 }}><Mail className="w-4 h-4 text-blue-700" />Template Preview</div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs text-gray-400 mb-2">Subject</div>
                <div className="text-sm text-gray-800 mb-4" style={{ fontWeight: 600 }}>{renderSample(subject) || 'No subject yet'}</div>
                <div className="text-xs text-gray-400 mb-2">Body</div>
                <div className="text-sm text-gray-600 whitespace-pre-wrap max-h-80 overflow-y-auto">{renderSample(body) || 'Choose a template or write your email body.'}</div>
                {attachments.length > 0 && <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">{attachments.length} attachment{attachments.length === 1 ? '' : 's'} ready</div>}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:border-gray-300 transition-colors" style={{ fontWeight: 500 }}>
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          <button onClick={() => step < 3 ? handleNext() : handleCreate()} disabled={saving || loading} className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-sm transition-colors flex items-center gap-2" style={{ fontWeight: 500 }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : step < 3 ? 'Next' : 'Launch Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmailCampaignsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null);
  const [previewCmp, setPreviewCmp] = useState<Campaign | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const loadCampaigns = () => {
    getEmailCampaigns()
      .then(response => setCampaigns(response.campaigns || []))
      .catch((error: any) => toast.error(error?.data?.message || error?.message || 'Could not load email campaigns.'));
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    const templateId = searchParams.get('templateId');
    if (!templateId) return;
    setInitialTemplateId(templateId);
    setShowCreate(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = campaigns.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const togglePause = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = c.status === 'running' ? 'paused' : 'running';
      toast.success(`Campaign ${next === 'paused' ? 'paused' : 'resumed'}.`);
      return { ...c, status: next };
    }));
  };

  const stats = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'running').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    scheduled: campaigns.filter(c => c.status === 'scheduled').length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Email Campaigns</h1>
          <p className="text-gray-500 text-sm mt-0.5">Create and manage bulk email campaigns.</p>
        </div>
        <button onClick={() => { setInitialTemplateId(null); setShowCreate(true); }} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
          <Plus className="w-4 h-4" />New Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-blue-600' },
          { label: 'Running', value: stats.running, color: 'text-amber-600' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600' },
          { label: 'Scheduled', value: stats.scheduled, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-2xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label} Campaigns</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'running', 'completed', 'paused', 'scheduled', 'failed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">No email campaigns found.</div>
        ) : filtered.map(cmp => {
          const sc = statusConfig[cmp.status] || statusConfig.completed;
          const StatusIcon = sc.icon;
          const deliveryRate = cmp.sent > 0 ? (((cmp.sent - cmp.failed) / cmp.sent) * 100).toFixed(0) : '-';
          return (
            <div key={cmp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-sm text-gray-800 truncate" style={{ fontWeight: 600 }}>{cmp.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">{cmp.fromEmail}</div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${sc.color}`} style={{ fontWeight: 500 }}>
                  <StatusIcon className="w-3 h-3" />{sc.label}
                </span>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate">{cmp.subject}</div>
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                {[
                  { label: 'Recipients', value: cmp.recipients.toLocaleString() },
                  { label: 'Sent', value: cmp.sent.toLocaleString() },
                  { label: 'Accepted', value: deliveryRate !== '-' ? `${deliveryRate}%` : '-' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-2">
                    <div className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{s.value}</div>
                    <div className="text-[10px] text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-400 mb-4"><Clock className="w-3 h-3 inline mr-1" />{cmp.scheduledAt || '-'}</div>
              <div className="flex items-center gap-2 mt-auto">
                <button onClick={() => { setPreviewCmp(cmp); setPreviewMode('desktop'); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors" style={{ fontWeight: 500 }}>
                  <Eye className="w-3.5 h-3.5" />Preview
                </button>
                {(cmp.status === 'running' || cmp.status === 'paused') && (
                  <button onClick={() => togglePause(cmp.id)} className={`p-2 rounded-xl border transition-colors ${cmp.status === 'running' ? 'border-amber-200 text-amber-600 hover:bg-amber-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                    {cmp.status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                )}
                {cmp.status === 'running' && (
                  <button onClick={() => { setCampaigns(p => p.map(c => c.id === cmp.id ? { ...c, status: 'failed' } : c)); toast.info('Campaign cancelled.'); }} className="p-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => toast.success('Exporting report...')} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {previewCmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewCmp(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{previewCmp.name}</h2>
                <p className="text-gray-400 text-xs">{previewCmp.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setPreviewMode('desktop')} className={`p-1.5 rounded-lg transition-colors ${previewMode === 'desktop' ? 'bg-white shadow' : ''}`}><Monitor className="w-4 h-4 text-gray-600" /></button>
                  <button onClick={() => setPreviewMode('mobile')} className={`p-1.5 rounded-lg transition-colors ${previewMode === 'mobile' ? 'bg-white shadow' : ''}`}><Smartphone className="w-4 h-4 text-gray-600" /></button>
                </div>
                <button onClick={() => setPreviewCmp(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="p-6">
              <div className={`bg-gray-50 rounded-2xl p-6 ${previewMode === 'mobile' ? 'max-w-xs mx-auto' : ''}`}>
                <div className="bg-white rounded-xl border border-gray-200 p-5">{previewCmp.htmlPreview}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && <CreateCampaignModal initialTemplateId={initialTemplateId} onCreated={loadCampaigns} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
    </div>
  );
}
