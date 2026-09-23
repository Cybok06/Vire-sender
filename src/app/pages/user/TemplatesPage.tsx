import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Edit2, Trash2, Copy, X, Search, FileText, Tag, Send,
  Loader2, Eye, AlertCircle, Mail, MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createTemplate,
  deleteTemplate,
  getTemplateStats,
  getTemplateVariables,
  getTemplates,
  updateTemplate,
} from '../../../lib/api.js';
import { safeClipboardCopy } from '../../utils/clipboard';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';

type TemplateType = 'email' | 'sms';

interface Template {
  id: string;
  name: string;
  type?: TemplateType;
  subject?: string;
  body?: string;
  message: string;
  category: string;
  variables: string[];
  unknown_variables?: string[];
  usageCount: number;
  createdAt: string;
}

type VariableGroups = Record<'basic' | 'demographic' | 'business' | 'custom', string[]>;
type VariableTab = keyof VariableGroups;

const CATEGORIES = ['All', 'Marketing', 'Transactional', 'Reminder', 'Onboarding', 'Security', 'Custom'];
const FORM_CATEGORIES = CATEGORIES.slice(1);
const TAB_LABELS: Record<VariableTab, string> = {
  basic: 'Basic',
  demographic: 'Demographic',
  business: 'Business',
  custom: 'Custom Fields',
};

const categoryColors: Record<string, string> = {
  Onboarding: 'bg-emerald-100 text-emerald-700',
  Security: 'bg-red-100 text-red-700',
  Marketing: 'bg-purple-100 text-purple-700',
  Transactional: 'bg-amber-100 text-amber-700',
  Reminder: 'bg-cyan-100 text-cyan-700',
  Custom: 'bg-gray-100 text-gray-600',
  OTP: 'bg-blue-100 text-blue-700',
};

const defaultVariables: VariableGroups = {
  basic: ['contact_name', 'phone', 'email', 'sender_id'],
  demographic: ['age', 'gender', 'location', 'region'],
  business: ['occupation', 'business_type', 'company', 'customer_type'],
  custom: [],
};

function getBody(template: Template) {
  return template.body ?? template.message ?? '';
}

function getType(template: Template): TemplateType {
  return template.type === 'email' ? 'email' : 'sms';
}

function VariablePill({ variable }: { variable: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono border border-blue-100">
      {'{{' + variable + '}}'}
    </span>
  );
}

function extractVariables(msg: string) {
  const matches = msg.match(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim()))];
}

function smsParts(message: string) {
  return Math.max(1, Math.ceil((message || '').length / 160));
}

function renderPreview(message: string, sample: Record<string, string>) {
  return (message || '').replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => sample[key] ?? '');
}

export default function TemplatesPage() {
  const { isEnabled } = useServiceAvailability();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState({ total_templates: 0, most_used: '', total_uses: 0, categories_count: 0 });
  const [variables, setVariables] = useState<VariableGroups>(defaultVariables);
  const [sample, setSample] = useState<Record<string, string>>({});
  const [activeVariableTab, setActiveVariableTab] = useState<VariableTab>('basic');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [useTarget, setUseTarget] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<TemplateType>('sms');
  const [formSubject, setFormSubject] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formCategory, setFormCategory] = useState(FORM_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [templateResponse, statsResponse, variableResponse] = await Promise.all([
        getTemplates(),
        getTemplateStats(),
        getTemplateVariables(),
      ]);
      setTemplates(templateResponse.templates || []);
      setStats(statsResponse.stats || {});
      setVariables({ ...defaultVariables, ...(variableResponse.variables || {}) });
      setSample(variableResponse.sample || {});
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = templates.filter(t => {
    const body = getBody(t);
    const query = search.toLowerCase();
    const matchSearch = !query || t.name.toLowerCase().includes(query) || body.toLowerCase().includes(query) || (t.subject || '').toLowerCase().includes(query);
    const matchCat = categoryFilter === 'All' || t.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const detectedVariables = useMemo(() => extractVariables(`${formSubject}\n${formMessage}`), [formSubject, formMessage]);
  const allKnownVariables = useMemo(() => new Set(Object.values(variables).flat().concat('group')), [variables]);
  const unknownVariables = detectedVariables.filter(variable => !allKnownVariables.has(variable));
  const previewMessage = renderPreview(formMessage, sample);

  const openCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormType('sms');
    setFormSubject('');
    setFormMessage('');
    setFormCategory(FORM_CATEGORIES[0]);
    setActiveVariableTab('basic');
    setShowModal(true);
  };

  const openEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormType(getType(template));
    setFormSubject(template.subject || '');
    setFormMessage(getBody(template));
    setFormCategory(FORM_CATEGORIES.includes(template.category) ? template.category : 'Custom');
    setActiveVariableTab('basic');
    setShowModal(true);
  };

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const textarea = textareaRef.current;
    if (!textarea) {
      setFormMessage(prev => `${prev}${prev ? ' ' : ''}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? formMessage.length;
    const end = textarea.selectionEnd ?? formMessage.length;
    const next = `${formMessage.slice(0, start)}${token}${formMessage.slice(end)}`;
    setFormMessage(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleSave = async () => {
    if (!formName.trim() || !formMessage.trim()) {
      toast.error('Template name and body are required.');
      return;
    }
    try {
      setSaving(true);
      const payload = { name: formName, type: formType, subject: formSubject, body: formMessage, message: formMessage, category: formCategory };
      const response = editingTemplate
        ? await updateTemplate(editingTemplate.id, payload)
        : await createTemplate(payload);
      toast.success(response.message || 'Template saved.');
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success(response.message || 'Template deleted.');
      await getTemplateStats().then(res => setStats(res.stats || stats)).catch(() => null);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete template.');
    }
  };

  const handleCopy = (template: Template) => {
    safeClipboardCopy(getBody(template));
    toast.success('Template body copied to clipboard.');
  };

  const confirmUse = async (target: 'email' | 'sms') => {
    if (!useTarget) return;
    const template = useTarget;
    const templateType = getType(template);
    const body = getBody(template);

    if (target === 'email' && templateType === 'sms') {
      const ok = window.confirm('This is an SMS template. Convert it into an email campaign body?');
      if (!ok) return;
    }
    if (target === 'sms' && templateType === 'email') {
      if ((template.subject || '').trim() || body.length > 480) {
        toast.error('This email template has a subject or is too long for SMS. Create a short SMS version first.');
        return;
      }
      const ok = window.confirm('This is an email template. Convert its body into an SMS campaign?');
      if (!ok) return;
    }

    setUseTarget(null);
    navigate(target === 'email' ? `/user/email-campaigns?templateId=${encodeURIComponent(template.id)}` : `/user/sms-campaigns?templateId=${encodeURIComponent(template.id)}`);
  };

  if (!isEnabled('templates')) return <ServiceLockedOverlay serviceKey="templates" />;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Message Templates</h1>
          <p className="text-gray-500 text-sm mt-0.5">Create reusable email and SMS templates with dynamic variables.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl transition-colors text-sm" style={{ fontWeight: 500 }}>
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Templates', value: stats.total_templates || templates.length, color: 'text-blue-600' },
          { label: 'Most Used', value: stats.most_used || 'None', color: 'text-emerald-600' },
          { label: 'Total Uses', value: (stats.total_uses || 0).toLocaleString(), color: 'text-purple-600' },
          { label: 'Categories', value: stats.categories_count || 0, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className={`text-lg ${s.color} truncate`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(category => (
            <button key={category} onClick={() => setCategoryFilter(category)} className={`px-3 py-1.5 rounded-full text-xs transition-colors ${categoryFilter === category ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3.5">
        <FileText className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs text-blue-700" style={{ fontWeight: 600 }}>Template Variables</p>
          <p className="text-xs text-blue-600 mt-1">Use contact fields like <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">{'{{contact_name}}'}</code>, <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">{'{{location}}'}</code>, and custom fields from More Details.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Loading templates...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            No templates found.
          </div>
        ) : (
          filtered.map(template => {
            const templateType = getType(template);
            const body = getBody(template);
            return (
              <div key={template.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 hover:shadow-md transition-all flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{template.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${templateType === 'email' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`} style={{ fontWeight: 600 }}>
                        {templateType === 'email' ? <Mail className="w-2.5 h-2.5" /> : <MessageSquare className="w-2.5 h-2.5" />}
                        {templateType === 'email' ? 'Email Template' : 'SMS Template'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${categoryColors[template.category] || 'bg-gray-100 text-gray-600'}`} style={{ fontWeight: 500 }}>
                        <Tag className="w-2.5 h-2.5" />
                        {template.category}
                      </span>
                      <span className="text-xs text-gray-400">{template.usageCount.toLocaleString()} uses</span>
                    </div>
                  </div>
                  <button onClick={() => handleCopy(template)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>

                {templateType === 'email' && template.subject && <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 truncate">Subject: {template.subject}</div>}
                <div className="flex-1 bg-gray-50 rounded-xl p-3 mb-3">
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                    {body.split(/(\{\{[^}]+\}\})/g).map((part, i) =>
                      part.startsWith('{{') ? <span key={i} className="text-blue-600 font-mono bg-blue-50 px-0.5 rounded">{part}</span> : part
                    )}
                  </p>
                </div>

                {template.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.variables.map(variable => <VariablePill key={variable} variable={variable} />)}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => openEdit(template)} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 hover:border-gray-300 text-gray-600 py-2 rounded-xl text-xs transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => setPreviewTemplate(template)} className="p-2 border border-gray-200 hover:border-gray-300 rounded-xl transition-colors">
                    <Eye className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button onClick={() => setUseTarget(template)} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-white py-2 rounded-xl text-xs transition-colors" style={{ fontWeight: 600 }}>
                    <Send className="w-3.5 h-3.5" /> Use
                  </button>
                  <button onClick={() => handleDelete(template.id)} className="p-2 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{editingTemplate ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Template Name</label>
                  <input type="text" placeholder="e.g. Promo for market customers" value={formName} onChange={e => setFormName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Template Type</label>
                  <div className="grid grid-cols-2 bg-gray-100 rounded-xl p-1">
                    {(['sms', 'email'] as TemplateType[]).map(type => (
                      <button key={type} type="button" onClick={() => setFormType(type)} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm capitalize ${formType === type ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500'}`} style={{ fontWeight: 600 }}>
                        {type === 'email' ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Category</label>
                <div className="flex flex-wrap gap-2">
                  {FORM_CATEGORIES.map(category => (
                    <button key={category} type="button" onClick={() => setFormCategory(category)} className={`px-3 py-1.5 rounded-full text-xs transition-colors ${formCategory === category ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              {formType === 'email' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Email Subject</label>
                  <input type="text" placeholder="e.g. Hello {{contact_name}}, here is your offer" value={formSubject} onChange={e => setFormSubject(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
                </div>
              )}
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="flex gap-2 flex-wrap mb-3">
                  {(Object.keys(TAB_LABELS) as VariableTab[]).map(tab => (
                    <button key={tab} type="button" onClick={() => setActiveVariableTab(tab)} className={`px-3 py-1.5 rounded-full text-xs transition-colors ${activeVariableTab === tab ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(variables[activeVariableTab] || []).length ? variables[activeVariableTab].map(variable => (
                    <button key={variable} type="button" onClick={() => insertVariable(variable)} className="font-mono text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100">
                      {'{{' + variable + '}}'}
                    </button>
                  )) : <span className="text-xs text-gray-400">No fields available yet.</span>}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{formType === 'email' ? 'Email Body' : 'SMS Message'}</label>
                  {formType === 'sms' && <span className="text-xs text-gray-400">{formMessage.length} chars - {smsParts(formMessage)} SMS part{smsParts(formMessage) > 1 ? 's' : ''}</span>}
                </div>
                <textarea ref={textareaRef} placeholder="Your message... Click variables above to insert them." value={formMessage} onChange={e => setFormMessage(e.target.value)} rows={6} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none" />
                {detectedVariables.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs text-gray-500 mr-1">Variables detected:</span>
                    {detectedVariables.map(variable => <VariablePill key={variable} variable={variable} />)}
                  </div>
                )}
                {unknownVariables.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    Unknown variables: {unknownVariables.join(', ')}. They will be blank if no matching contact field exists.
                  </div>
                )}
              </div>
              {formMessage && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Preview</label>
                  <div className="bg-gray-50 rounded-xl p-3">
                    {formType === 'email' && formSubject && <div className="text-xs text-gray-500 mb-2">Subject: {renderPreview(formSubject, sample)}</div>}
                    <div className="bg-blue-900 text-white rounded-2xl rounded-tl-sm px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap">
                      {previewMessage}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 py-2.5 rounded-xl text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {useTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Use Template</h2>
                <p className="text-xs text-gray-400 mt-1">{useTarget.name}</p>
              </div>
              <button onClick={() => setUseTarget(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <button onClick={() => confirmUse('email')} className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${getType(useTarget) === 'email' ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 hover:border-blue-200'}`}>
                <Mail className="w-5 h-5 text-blue-700" />
                <div>
                  <div className="text-sm text-gray-800" style={{ fontWeight: 700 }}>Create Email Campaign</div>
                  <div className="text-xs text-gray-500">Load subject and body into Email Campaigns.</div>
                </div>
              </button>
              <button onClick={() => confirmUse('sms')} className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${getType(useTarget) === 'sms' ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 hover:border-blue-200'}`}>
                <MessageSquare className="w-5 h-5 text-blue-700" />
                <div>
                  <div className="text-sm text-gray-800" style={{ fontWeight: 700 }}>Create SMS Campaign</div>
                  <div className="text-xs text-gray-500">Load the body into SMS Campaigns.</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{previewTemplate.name}</h2>
                <p className="text-xs text-gray-400 mt-1">{getType(previewTemplate) === 'email' ? 'Email Template' : 'SMS Template'} - {previewTemplate.category}</p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl p-3">
                {getType(previewTemplate) === 'email' && previewTemplate.subject && <div className="text-xs text-gray-500 mb-2">Subject: {renderPreview(previewTemplate.subject, sample)}</div>}
                <div className="bg-blue-900 text-white rounded-2xl rounded-tl-sm px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {renderPreview(getBody(previewTemplate), sample)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
