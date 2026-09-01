import { useEffect, useMemo, useState } from 'react';
import { Search, Eye, Trash2, Ban, Monitor, Smartphone, X, Loader2, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAdminTemplate, getAdminTemplateStats, getAdminTemplates, updateAdminTemplateStatus } from '../../../lib/api.js';

type Template = {
  id: string;
  template_id?: string;
  name: string;
  user: string;
  user_email?: string;
  type?: 'email' | 'sms';
  subject?: string;
  body?: string;
  message?: string;
  category?: string;
  status?: string;
  usageCount?: number;
  createdAt?: string;
};

function bodyOf(template: Template) {
  return template.body || template.message || '';
}

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState({ total_templates: 0, sms_templates: 0, email_templates: 0, active_templates: 0, total_uses: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const [templateResponse, statsResponse] = await Promise.all([getAdminTemplates(), getAdminTemplateStats()]);
      setTemplates(templateResponse.templates || []);
      setStats(statsResponse.stats || {});
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filtered = useMemo(() => templates.filter(t => {
    const query = search.toLowerCase();
    const type = t.type === 'email' ? 'Email' : 'SMS';
    const matchSearch = !query || t.name.toLowerCase().includes(query) || (t.user || '').toLowerCase().includes(query) || (t.user_email || '').toLowerCase().includes(query);
    const matchType = typeFilter === 'all' || type === typeFilter;
    return matchSearch && matchType;
  }), [templates, search, typeFilter]);

  const toggleStatus = async (template: Template) => {
    const next = template.status === 'disabled' ? 'active' : 'disabled';
    try {
      await updateAdminTemplateStatus(template.id, next);
      setTemplates(prev => prev.map(item => item.id === template.id ? { ...item, status: next } : item));
      toast.success(`Template ${next === 'disabled' ? 'disabled' : 'enabled'}.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to update template.');
    }
  };

  const removeTemplate = async (template: Template) => {
    try {
      await deleteAdminTemplate(template.id);
      setTemplates(prev => prev.filter(item => item.id !== template.id));
      toast.success(`Template "${template.name}" deleted.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete template.');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Templates</h1>
        <p className="text-gray-500 text-sm mt-0.5">View and moderate SMS and Email templates created by users.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Templates', value: stats.total_templates || templates.length, color: 'text-blue-600' },
          { label: 'SMS Templates', value: stats.sms_templates || templates.filter(t => t.type !== 'email').length, color: 'text-cyan-600' },
          { label: 'Email Templates', value: stats.email_templates || templates.filter(t => t.type === 'email').length, color: 'text-indigo-600' },
          { label: 'Active', value: stats.active_templates || templates.filter(t => (t.status || 'active') === 'active').length, color: 'text-emerald-600' },
          { label: 'Total Uses', value: stats.total_uses || templates.reduce((sum, t) => sum + Number(t.usageCount || 0), 0), color: 'text-purple-600' },
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
          <input type="text" placeholder="Search template name or user..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex gap-2">
          {['all', 'SMS', 'Email'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-2.5 rounded-xl text-sm transition-colors ${typeFilter === t ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>{t === 'all' ? 'All' : t}</button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">No templates found.</div>
        ) : filtered.map(tpl => {
          const type = tpl.type === 'email' ? 'Email' : 'SMS';
          const disabled = tpl.status === 'disabled' || tpl.status === 'archived';
          return (
            <div key={tpl.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col ${disabled ? 'opacity-60 border-gray-100' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{tpl.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{tpl.user} - {tpl.createdAt ? new Date(tpl.createdAt).toLocaleDateString() : '-'}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${type === 'SMS' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'}`} style={{ fontWeight: 500 }}>
                    {type === 'SMS' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                    {type}
                  </span>
                  {disabled && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Disabled</span>}
                </div>
              </div>

              {type === 'Email' && tpl.subject && <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 truncate">Subject: {tpl.subject}</div>}
              <div className="flex-1 bg-gray-50 rounded-xl p-3 mb-4">
                <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{bodyOf(tpl).replace(/<[^>]*>/g, ' ')}</p>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { setPreviewTpl(tpl); setPreviewMode('desktop'); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors" style={{ fontWeight: 500 }}>
                  <Eye className="w-3.5 h-3.5" />Preview
                </button>
                <button onClick={() => toggleStatus(tpl)} className={`p-2 rounded-xl border transition-colors ${disabled ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                  <Ban className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => removeTemplate(tpl)} className="p-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {previewTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewTpl(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{previewTpl.name}</h2>
                <p className="text-gray-400 text-xs">{previewTpl.type === 'email' ? 'Email' : 'SMS'} Template - {previewTpl.user}</p>
              </div>
              <div className="flex items-center gap-2">
                {previewTpl.type === 'email' && (
                  <div className="flex bg-gray-100 rounded-xl p-1">
                    <button onClick={() => setPreviewMode('desktop')} className={`p-1.5 rounded-lg transition-colors ${previewMode === 'desktop' ? 'bg-white shadow' : ''}`}><Monitor className="w-4 h-4 text-gray-600" /></button>
                    <button onClick={() => setPreviewMode('mobile')} className={`p-1.5 rounded-lg transition-colors ${previewMode === 'mobile' ? 'bg-white shadow' : ''}`}><Smartphone className="w-4 h-4 text-gray-600" /></button>
                  </div>
                )}
                <button onClick={() => setPreviewTpl(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="p-6">
              <div className={`bg-gray-50 rounded-2xl p-6 ${previewMode === 'mobile' ? 'max-w-xs mx-auto' : ''}`}>
                {previewTpl.type !== 'email' ? (
                  <div className="bg-blue-500 rounded-2xl rounded-tl-sm p-4 max-w-xs">
                    <p className="text-white text-sm leading-relaxed">{bodyOf(previewTpl)}</p>
                    <p className="text-blue-200 text-xs mt-2 text-right">Now</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    {previewTpl.subject && <div className="text-xs text-gray-400 mb-3">Subject: {previewTpl.subject}</div>}
                    <div dangerouslySetInnerHTML={{ __html: bodyOf(previewTpl) }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
