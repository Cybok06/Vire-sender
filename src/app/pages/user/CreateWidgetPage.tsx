import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  MessageSquare, Mail, Layers, ChevronRight, ChevronLeft,
  Shield, Globe, Palette,
  CheckCircle, Code2, ExternalLink, Copy, Eye, ArrowLeft, Plus
} from 'lucide-react';
import { useEmbedWidgets, WidgetType, EmbedWidget } from '../../contexts/EmbedWidgetsContext';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { safeClipboardCopy } from '../../utils/clipboard';

// ─── Brand ───────────────────────────────────────────────────────────────────
const PRIMARY = '#2563EB';
const NAVY    = '#06142B';
const CYAN    = '#0EA5E9';
const SUCCESS = '#10B981';
const SLATE   = '#64748B';
const DARK    = '#0F172A';

// ─── Widget type cards ────────────────────────────────────────────────────────
const WIDGET_TYPES: { type: WidgetType; label: string; desc: string; Icon: any; features: string[]; color: string; bg: string }[] = [
  {
    type: 'sms',
    label: 'SMS Sender Widget',
    desc: 'Embed a fully-functional SMS form — single or bulk send.',
    Icon: MessageSquare,
    features: ['Single & Bulk SMS', 'Phone + Sender ID', 'Char counter', 'CSV upload', 'Delivery status'],
    color: PRIMARY,
    bg: `${PRIMARY}10`,
  },
  {
    type: 'email',
    label: 'Email Sender Widget',
    desc: 'Embed an email composer with HTML & plain-text modes.',
    Icon: Mail,
    features: ['Single & Bulk Email', 'HTML / plain-text editor', 'Desktop/mobile preview', 'CSV upload', 'Delivery status'],
    color: '#8b5cf6',
    bg: '#8b5cf610',
  },
  {
    type: 'combined',
    label: 'Combined SMS + Email',
    desc: 'Let visitors choose to send via SMS or Email in one widget.',
    Icon: Layers,
    features: ['Tabbed SMS + Email', 'All SMS features', 'All Email features', 'Seamless switching'],
    color: CYAN,
    bg: `${CYAN}10`,
  },
];

// ─── Default form values ──────────────────────────────────────────────────────
const DEFAULT_FORM = {
  name: '',
  type: 'sms' as WidgetType,
  requireLogin: false,
  enableCaptcha: false,
  defaultSenderId: 'VireSend',
  successRedirectUrl: '',
  webhookUrl: '',
  theme: {
    primary_color: '#2563EB',
    background_color: '#f1f5f9',
    button_text: 'Send',
    show_branding: true,
  },
};

const THEME_PRESETS = [
  { name: 'Vire Blue', primary: '#2563EB', bg: '#f1f5f9' },
  { name: 'Emerald', primary: '#10B981', bg: '#ecfdf5' },
  { name: 'Purple', primary: '#8b5cf6', bg: '#f5f3ff' },
  { name: 'Slate', primary: '#0F172A', bg: '#f8fafc' },
  { name: 'Orange', primary: '#F97316', bg: '#fff7ed' },
];

// ─── Input wrapper ────────────────────────────────────────────────────────────
function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 700 }}>{label}</label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
      style={{ border: '1.5px solid #e2e8f0', fontFamily: 'inherit', color: DARK, background: 'white' }}
      onFocus={e => (e.currentTarget.style.borderColor = PRIMARY)}
      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
    />
  );
}

// ─── Step indicators ──────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const steps = ['Choose Type', 'Configure', 'Get Embed Code'];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-all"
              style={{
                background: i < step ? SUCCESS : i === step ? PRIMARY : '#e2e8f0',
                color: i <= step ? 'white' : SLATE,
                fontWeight: 700,
              }}
            >
              {i < step ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className="text-sm hidden sm:block" style={{ color: i === step ? DARK : SLATE, fontWeight: i === step ? 700 : 400 }}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px mx-2" style={{ background: i < step ? SUCCESS : '#e2e8f0' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CreateWidgetPage() {
  const { createWidget, getWidget, updateWidget } = useEmbedWidgets();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { widgetId } = useParams<{ widgetId?: string }>();
  const isEdit = !!widgetId;

  const existing = isEdit ? getWidget(widgetId!) : undefined;

  const [step, setStep] = useState(isEdit ? 1 : 0);
  const [form, setForm] = useState(existing ? {
    name: existing.name,
    type: existing.type,
    requireLogin: false,
    enableCaptcha: false,
    defaultSenderId: existing.defaultSenderId,
    successRedirectUrl: existing.successRedirectUrl,
    webhookUrl: existing.webhookUrl,
    theme: existing.theme || DEFAULT_FORM.theme,
  } : DEFAULT_FORM);
  const [createdWidget, setCreatedWidget] = useState<EmbedWidget | null>(existing || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        name: existing.name,
        type: existing.type,
        requireLogin: false,
        enableCaptcha: false,
        defaultSenderId: existing.defaultSenderId,
        successRedirectUrl: existing.successRedirectUrl,
        webhookUrl: existing.webhookUrl,
        theme: existing.theme || DEFAULT_FORM.theme,
      });
      setCreatedWidget(existing);
    }
  }, [existing?.id]);

  const setField = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));
  const setTheme = (key: string, value: any) => setForm(f => ({ ...f, theme: { ...(f.theme || DEFAULT_FORM.theme), [key]: value } }));

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Please enter a widget name'); return; }
    setSaving(true);
    if (isEdit && existing) {
      try {
        await updateWidget(existing.id, form);
        toast.success('Widget updated!');
        navigate('/user/embed-widgets');
      } catch (error: any) {
        toast.error(error.message || 'Could not update widget');
      } finally {
        setSaving(false);
      }
    } else {
      try {
        const w = await createWidget({
          ...form,
          status: 'active',
          userId: user?.id || '',
          userName: user?.name || 'User',
        });
        setCreatedWidget(w);
        setStep(2);
        toast.success('Widget created successfully!');
      } catch (error: any) {
        toast.error(error.message || 'Could not create widget');
      } finally {
        setSaving(false);
      }
    }
  };

  const hostedUrl  = createdWidget ? `${window.location.origin}/embed/${createdWidget.id}?token=${encodeURIComponent(createdWidget.token)}` : '';
  const iframeCode = createdWidget ? `<iframe\n  src="${hostedUrl}"\n  width="100%"\n  height="720"\n  style="border:0;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,0.12);"\n  title="${createdWidget.name} — VireSend Widget"\n  loading="lazy"\n></iframe>` : '';

  const copy = (text: string, label: string) => { safeClipboardCopy(text); toast.success(label); };

  return (
    <div className="p-5 lg:p-7" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="max-w-3xl mx-auto">

        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => step === 0 ? navigate('/user/embed-widgets') : setStep(s => s - 1)}
            className="p-2 rounded-xl transition-colors hover:bg-slate-100"
          >
            <ArrowLeft size={18} style={{ color: SLATE }} />
          </button>
          <div>
            <h1 className="text-2xl" style={{ color: DARK, fontWeight: 800 }}>{isEdit ? 'Edit Widget' : 'Create Widget'}</h1>
            <p className="text-sm mt-0.5" style={{ color: SLATE }}>Build an embeddable SMS or Email form for any website.</p>
          </div>
        </div>

        <StepBar step={step} />

        {/* ── STEP 0: Choose type ────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: SLATE }}>Choose the type of widget you want to create:</p>
            <div className="grid gap-4">
              {WIDGET_TYPES.map(wt => (
                <button
                  key={wt.type}
                  onClick={() => { setField('type', wt.type); setStep(1); }}
                  className="flex items-start gap-4 p-5 rounded-2xl text-left transition-all hover:-translate-y-0.5"
                  style={{
                    background: 'white',
                    border: `2px solid ${form.type === wt.type ? wt.color : 'rgba(0,0,0,0.06)'}`,
                    boxShadow: form.type === wt.type ? `0 8px 24px ${wt.color}20` : '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: wt.bg }}>
                    <wt.Icon size={22} style={{ color: wt.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-base mb-1" style={{ color: DARK, fontWeight: 700 }}>{wt.label}</div>
                    <p className="text-sm mb-3" style={{ color: SLATE }}>{wt.desc}</p>
                    <div className="flex flex-wrap gap-2">
                      {wt.features.map(f => (
                        <span key={f} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: wt.bg, color: wt.color, fontWeight: 600 }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: '#94a3b8', flexShrink: 0, marginTop: 2 }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 1: Configure ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">

            {/* Basic info */}
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Code2 size={16} style={{ color: PRIMARY }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Basic Information</span>
              </div>
              <FormField label="Widget Name" hint="A memorable name shown in your dashboard.">
                <TextInput value={form.name} onChange={v => setField('name', v)} placeholder="e.g. Contact Form SMS" />
              </FormField>
              <FormField label="Widget Type">
                <div className="flex gap-2 flex-wrap">
                  {WIDGET_TYPES.map(wt => (
                    <button
                      key={wt.type}
                      onClick={() => setField('type', wt.type)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                      style={{
                        background: form.type === wt.type ? wt.color : 'white',
                        color: form.type === wt.type ? 'white' : SLATE,
                        border: `1.5px solid ${form.type === wt.type ? wt.color : '#e2e8f0'}`,
                        fontWeight: form.type === wt.type ? 700 : 400,
                      }}
                    >
                      <wt.Icon size={14} />{wt.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Default Sender ID" hint="Pre-filled sender name shown in the widget.">
                <TextInput value={form.defaultSenderId} onChange={v => setField('defaultSenderId', v)} placeholder="VireSend" />
              </FormField>
            </div>

            {/* Theme */}
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Palette size={16} style={{ color: PRIMARY }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Widget Theme</span>
              </div>
              <div className="grid sm:grid-cols-5 gap-2">
                {THEME_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => setField('theme', { ...(form.theme || DEFAULT_FORM.theme), primary_color: preset.primary, background_color: preset.bg })}
                    className="rounded-xl p-3 text-left transition-all"
                    style={{
                      border: `1.5px solid ${(form.theme?.primary_color || PRIMARY) === preset.primary ? preset.primary : '#e2e8f0'}`,
                      background: preset.bg,
                    }}
                  >
                    <span className="block w-7 h-7 rounded-lg mb-2" style={{ background: preset.primary }} />
                    <span className="text-xs" style={{ color: DARK, fontWeight: 700 }}>{preset.name}</span>
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Primary Color">
                  <input type="color" value={form.theme?.primary_color || '#2563EB'} onChange={e => setTheme('primary_color', e.target.value)} className="w-full h-11 rounded-xl cursor-pointer" style={{ border: '1.5px solid #e2e8f0', background: 'white' }} />
                </FormField>
                <FormField label="Background Color">
                  <input type="color" value={form.theme?.background_color || '#f1f5f9'} onChange={e => setTheme('background_color', e.target.value)} className="w-full h-11 rounded-xl cursor-pointer" style={{ border: '1.5px solid #e2e8f0', background: 'white' }} />
                </FormField>
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: form.theme?.background_color || '#f1f5f9', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="px-4 py-3 text-white text-sm" style={{ background: `linear-gradient(135deg, ${form.theme?.primary_color || PRIMARY}, ${form.theme?.primary_color || PRIMARY}dd)`, fontWeight: 800 }}>
                  {form.name || 'Widget Preview'}
                </div>
                <div className="p-4">
                  <button className="w-full rounded-xl py-2.5 text-white text-sm" style={{ background: form.theme?.primary_color || PRIMARY, fontWeight: 700 }}>
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Callbacks */}
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Globe size={16} style={{ color: CYAN }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Redirects & Webhooks</span>
              </div>
              <FormField label="Success Redirect URL" hint="Redirect visitor to this URL after a successful send (optional).">
                <TextInput value={form.successRedirectUrl} onChange={v => setField('successRedirectUrl', v)} placeholder="https://yoursite.com/thank-you" />
              </FormField>
              <FormField label="Webhook / Callback URL" hint="Receive real-time delivery status POSTs (optional).">
                <TextInput value={form.webhookUrl} onChange={v => setField('webhookUrl', v)} placeholder="https://yoursite.com/webhooks/viresend" />
              </FormField>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-colors"
                style={{ border: '1.5px solid #e2e8f0', color: SLATE, fontWeight: 600 }}
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl text-sm transition-all hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${PRIMARY}, #1D4ED8)`, fontWeight: 700, boxShadow: `0 4px 14px rgba(37,99,235,0.35)` }}
              >
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Widget'} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Embed code ─────────────────────────────── */}
        {step === 2 && createdWidget && (
          <div className="space-y-6">

            {/* Success banner */}
            <div
              className="rounded-2xl p-6 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${NAVY}, #0d2563)`, boxShadow: `0 16px 48px rgba(6,20,43,0.2)` }}
            >
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15" style={{ background: SUCCESS, filter: 'blur(40px)' }} />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${SUCCESS}25` }}>
                  <CheckCircle size={28} style={{ color: SUCCESS }} />
                </div>
                <div>
                  <div className="text-lg text-white" style={{ fontWeight: 800 }}>Widget Created!</div>
                  <div className="text-sm mt-0.5" style={{ color: '#94a3b8' }}><span style={{ color: 'white', fontWeight: 600 }}>{createdWidget.name}</span> is live and ready to embed.</div>
                </div>
              </div>
            </div>

            {/* Widget token info */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} style={{ color: SUCCESS }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Secure Widget Token</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full ml-1" style={{ background: `${SUCCESS}10`, color: SUCCESS, fontWeight: 700 }}>NOT your API key</span>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 px-4 py-2.5 rounded-xl text-sm font-mono" style={{ background: '#f1f5f9', color: '#374151', wordBreak: 'break-all' }}>
                  {createdWidget.token}
                </code>
                <button
                  onClick={() => copy(createdWidget.token, 'Token copied!')}
                  className="px-4 py-2.5 rounded-xl text-sm transition-all hover:opacity-90"
                  style={{ background: `${SUCCESS}10`, color: SUCCESS, fontWeight: 700 }}
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>This token is scoped to this widget only. Wallet checks are enforced on every request.</p>
            </div>

            {/* Hosted link */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3">
                <ExternalLink size={14} style={{ color: CYAN }} />
                <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Hosted Page Link</span>
              </div>
              <p className="text-sm mb-3" style={{ color: SLATE }}>Share this link directly, or open it in a new tab to preview the widget.</p>
              <div className="flex gap-2">
                <code className="flex-1 px-4 py-2.5 rounded-xl text-sm font-mono" style={{ background: '#f1f5f9', color: '#374151' }}>
                  {hostedUrl}
                </code>
                <button onClick={() => copy(hostedUrl, 'Link copied!')} className="px-3 py-2.5 rounded-xl transition-colors hover:bg-slate-100" style={{ border: '1.5px solid #e2e8f0' }}>
                  <Copy size={14} style={{ color: SLATE }} />
                </button>
                <a href={`/embed/${createdWidget.id}?token=${encodeURIComponent(createdWidget.token)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2.5 rounded-xl transition-colors hover:bg-blue-50" style={{ border: '1.5px solid rgba(37,99,235,0.2)' }}>
                  <Eye size={14} style={{ color: PRIMARY }} />
                </a>
              </div>
            </div>

            {/* iframe code */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Code2 size={14} style={{ color: PRIMARY }} />
                  <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>iframe Embed Code</span>
                </div>
                <button
                  onClick={() => copy(iframeCode, 'iframe code copied!')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all hover:opacity-90"
                  style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 700 }}
                >
                  <Copy size={12} /> Copy Code
                </button>
              </div>
              <pre
                className="text-sm rounded-xl p-4 overflow-x-auto leading-relaxed"
                style={{ background: '#0f172a', color: '#94a3b8', fontFamily: 'monospace' }}
              >
                <code style={{ color: '#e2e8f0' }}>{iframeCode}</code>
              </pre>
              <p className="text-xs mt-3" style={{ color: '#94a3b8' }}>
                Paste this code anywhere in your HTML. The widget is fully responsive and adjusts to its container width.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate(`/user/embed-widgets/${createdWidget.id}`)}
                className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm transition-all hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${PRIMARY}, #1D4ED8)`, fontWeight: 700 }}
              >
                <Eye size={14} /> View Widget
              </button>
              <button
                onClick={() => navigate('/user/embed-widgets')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-colors"
                style={{ border: '1.5px solid #e2e8f0', color: SLATE, fontWeight: 600 }}
              >
                Back to Widgets
              </button>
              <button
                onClick={() => { setForm(DEFAULT_FORM); setStep(0); setCreatedWidget(null); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-colors"
                style={{ border: '1.5px solid rgba(37,99,235,0.2)', color: PRIMARY, fontWeight: 600 }}
              >
                <Plus size={14} /> Create Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

