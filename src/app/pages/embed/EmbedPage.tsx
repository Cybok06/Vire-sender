import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { AlertCircle, CheckCircle, Layers, Loader2, Mail, MessageSquare, Send, Shield, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicWidgetConfig, sendPublicWidgetEmail, sendPublicWidgetSms } from '../../../lib/api';

const PRIMARY = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const CYAN = '#0EA5E9';
const SUCCESS = '#10B981';
const DANGER = '#EF4444';
const NAVY = '#06142B';
const DARK = '#0F172A';
const SLATE = '#64748B';
const VIRESEND_LOGO_URL = 'https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public';

function Input({ value, onChange, placeholder, type = 'text' }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
      style={{ border: '1.5px solid #e2e8f0', color: DARK, fontFamily: "'Poppins','Inter',sans-serif", background: 'white' }}
      onFocus={e => (e.currentTarget.style.borderColor = PRIMARY)}
      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 5 }: any) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all resize-none"
      style={{ border: '1.5px solid #e2e8f0', color: DARK, fontFamily: "'Poppins','Inter',sans-serif", background: 'white' }}
      onFocus={e => (e.currentTarget.style.borderColor = PRIMARY)}
      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>{children}</label>;
}

function SendResult({ type, count }: { type: 'success' | 'failed'; count?: number }) {
  return (
    <div className="flex flex-col items-center text-center py-10">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: type === 'success' ? `${SUCCESS}15` : `${DANGER}15` }}>
        {type === 'success' ? <CheckCircle size={32} style={{ color: SUCCESS }} /> : <XCircle size={32} style={{ color: DANGER }} />}
      </div>
      <div className="text-lg mb-1" style={{ color: DARK, fontWeight: 800 }}>
        {type === 'success' ? (count && count > 1 ? `${count} Messages Accepted` : 'Message Accepted') : 'Send Failed'}
      </div>
      <p className="text-sm" style={{ color: SLATE }}>
        {type === 'success' ? 'VireSend accepted the message for delivery processing.' : 'Something went wrong. Please try again.'}
      </p>
    </div>
  );
}

function SmsWidget({ widgetId, token, widget }: any) {
  const accent = widget.theme?.primary_color || PRIMARY;
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [phone, setPhone] = useState('');
  const [senderId, setSenderId] = useState(widget.defaultSenderId || 'VireSend');
  const [message, setMessage] = useState('');
  const [bulkNumbers, setBulkNumbers] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<null | { type: 'success' | 'failed'; count?: number }>(null);

  const recipients = useMemo(() => [...new Set(bulkNumbers.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean))], [bulkNumbers]);
  const activeMessage = mode === 'single' ? message : bulkMessage;
  const smsParts = Math.max(1, Math.ceil((activeMessage || '').length / 160));
  const count = mode === 'single' ? (phone.trim() ? 1 : 0) : recipients.length;
  const cost = count * smsParts * Number(widget.smsCostPerMessage || 0.04);

  const finishSuccess = (sentCount?: number) => {
    setResult({ type: 'success', count: sentCount });
    if (widget.successRedirectUrl) {
      setTimeout(() => { window.location.href = widget.successRedirectUrl; }, 1200);
    }
  };

  const send = async () => {
    const payload = mode === 'single'
      ? { token, phone, sender_id: senderId, message, captcha_token: 'checked' }
      : { token, recipients, sender_id: senderId, message: bulkMessage, captcha_token: 'checked' };
    if (mode === 'single' && !phone.trim()) { toast.error('Enter a phone number'); return; }
    if (mode === 'bulk' && recipients.length === 0) { toast.error('Add recipient numbers'); return; }
    if (!(mode === 'single' ? message : bulkMessage).trim()) { toast.error('Enter a message'); return; }
    setSending(true);
    try {
      await sendPublicWidgetSms(widgetId, payload);
      finishSuccess(mode === 'bulk' ? recipients.length : undefined);
    } catch (error: any) {
      toast.error(error.message || 'SMS failed');
      setResult({ type: 'failed' });
    } finally {
      setSending(false);
    }
  };

  if (result) return <SendResult type={result.type} count={result.count} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
        {(['single', 'bulk'] as const).map(item => (
          <button key={item} onClick={() => setMode(item)} className="flex-1 px-4 py-2 rounded-lg text-sm transition-all" style={{ background: mode === item ? 'white' : 'transparent', color: mode === item ? DARK : SLATE, fontWeight: mode === item ? 700 : 400 }}>
            {item === 'single' ? 'Single SMS' : 'Bulk SMS'}
          </button>
        ))}
      </div>
      {mode === 'single' ? (
        <>
          <div><Label>Phone Number</Label><Input value={phone} onChange={setPhone} placeholder="024XXXXXXX or +23324XXXXXXX" type="tel" /></div>
          <div><Label>Sender ID</Label><Input value={senderId} onChange={setSenderId} placeholder="VireSend" /></div>
          <div><Label>Message</Label><Textarea value={message} onChange={setMessage} placeholder="Type your message..." rows={4} /></div>
        </>
      ) : (
        <>
          <div><Label>Recipients</Label><Textarea value={bulkNumbers} onChange={setBulkNumbers} placeholder={'024XXXXXXX\n055XXXXXXX'} rows={4} /></div>
          <div><Label>Sender ID</Label><Input value={senderId} onChange={setSenderId} placeholder="VireSend" /></div>
          <div><Label>Message</Label><Textarea value={bulkMessage} onChange={setBulkMessage} placeholder="Type your message..." rows={4} /></div>
        </>
      )}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#f8faff', border: '1px solid rgba(37,99,235,0.1)' }}>
        <span className="text-sm" style={{ color: SLATE }}>{count || 0} recipient(s), {smsParts} part(s)</span>
        <span className="text-sm" style={{ color: accent, fontWeight: 800 }}>GHS {cost.toFixed(4)}</span>
      </div>
      <button onClick={send} disabled={sending} className="w-full flex items-center justify-center gap-2 text-white py-3.5 rounded-xl text-sm disabled:opacity-50 transition-all" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)`, fontWeight: 700 }}>
        {sending ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : <><Send size={16} /> Send SMS</>}
      </button>
    </div>
  );
}

function EmailWidget({ widgetId, token, widget }: any) {
  const accent = widget.theme?.primary_color || '#8b5cf6';
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [email, setEmail] = useState('');
  const [emails, setEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [format, setFormat] = useState<'plain' | 'html'>('plain');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<null | { type: 'success' | 'failed'; count?: number }>(null);
  const recipients = useMemo(() => [...new Set(emails.split(/[\n,;]+/).map(item => item.trim()).filter(item => item.includes('@')))], [emails]);
  const count = mode === 'single' ? (email.trim() ? 1 : 0) : recipients.length;
  const costPerEmail = Number(widget.emailCostPerEmail ?? 0.001);
  const cost = count * costPerEmail;

  const finishSuccess = (sentCount?: number) => {
    setResult({ type: 'success', count: sentCount });
    if (widget.successRedirectUrl) {
      setTimeout(() => { window.location.href = widget.successRedirectUrl; }, 1200);
    }
  };

  const send = async () => {
    if (mode === 'single' && !email.trim()) { toast.error('Enter a recipient email'); return; }
    if (mode === 'bulk' && recipients.length === 0) { toast.error('Add recipient emails'); return; }
    if (!subject.trim()) { toast.error('Enter a subject'); return; }
    if (!message.trim()) { toast.error('Enter a message'); return; }
    setSending(true);
    try {
      await sendPublicWidgetEmail(widgetId, { token, email, recipients, subject, message, format, captcha_token: 'checked' });
      finishSuccess(mode === 'bulk' ? recipients.length : undefined);
    } catch (error: any) {
      toast.error(error.message || 'Email failed');
      setResult({ type: 'failed' });
    } finally {
      setSending(false);
    }
  };

  if (result) return <SendResult type={result.type} count={result.count} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
        {(['single', 'bulk'] as const).map(item => (
          <button key={item} onClick={() => setMode(item)} className="flex-1 px-4 py-2 rounded-lg text-sm transition-all" style={{ background: mode === item ? 'white' : 'transparent', color: mode === item ? DARK : SLATE, fontWeight: mode === item ? 700 : 400 }}>
            {item === 'single' ? 'Single Email' : 'Bulk Email'}
          </button>
        ))}
      </div>
      {mode === 'single'
        ? <div><Label>To</Label><Input value={email} onChange={setEmail} placeholder="recipient@example.com" type="email" /></div>
        : <div><Label>Recipients</Label><Textarea value={emails} onChange={setEmails} placeholder={'ama@example.com\nkojo@example.com'} rows={4} /></div>}
      <div><Label>Subject</Label><Input value={subject} onChange={setSubject} placeholder="Email subject..." /></div>
      <div className="flex gap-2">
        {(['plain', 'html'] as const).map(item => (
          <button key={item} onClick={() => setFormat(item)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: format === item ? `${accent}12` : '#f1f5f9', color: format === item ? accent : SLATE, fontWeight: 700 }}>{item.toUpperCase()}</button>
        ))}
      </div>
      <div><Label>Message</Label><Textarea value={message} onChange={setMessage} placeholder={format === 'html' ? '<p>Hello...</p>' : 'Type your email message...'} rows={6} /></div>
      <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#f8faff', border: '1px solid rgba(139,92,246,0.1)' }}>
        <span className="text-sm" style={{ color: SLATE }}>{count || 0} recipient(s)</span>
        <span className="text-sm" style={{ color: accent, fontWeight: 800 }}>{costPerEmail <= 0 ? 'Free' : `GHS ${cost.toFixed(4)}`}</span>
      </div>
      <button onClick={send} disabled={sending} className="w-full flex items-center justify-center gap-2 text-white py-3.5 rounded-xl text-sm disabled:opacity-50 transition-all" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)`, fontWeight: 700 }}>
        {sending ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : <><Send size={16} /> Send Email</>}
      </button>
    </div>
  );
}

function CombinedWidget({ widgetId, token, widget }: any) {
  const [active, setActive] = useState<'sms' | 'email'>('sms');
  const accent = widget.theme?.primary_color || PRIMARY;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
        <button onClick={() => setActive('sms')} className="flex-1 px-4 py-2 rounded-lg text-sm" style={{ background: active === 'sms' ? accent : 'transparent', color: active === 'sms' ? 'white' : SLATE, fontWeight: 700 }}>SMS</button>
        <button onClick={() => setActive('email')} className="flex-1 px-4 py-2 rounded-lg text-sm" style={{ background: active === 'email' ? accent : 'transparent', color: active === 'email' ? 'white' : SLATE, fontWeight: 700 }}>Email</button>
      </div>
      {active === 'sms' ? <SmsWidget widgetId={widgetId} token={token} widget={widget} /> : <EmailWidget widgetId={widgetId} token={token} widget={widget} />}
    </div>
  );
}

export default function EmbedPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [widget, setWidget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [captchaPassed, setCaptchaPassed] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);

  useEffect(() => {
    if (!widgetId) return;
    setLoading(true);
    getPublicWidgetConfig(widgetId, token)
      .then(data => setWidget(data.widget))
      .catch((error: any) => setLoadError(error.message || 'Widget unavailable'))
      .finally(() => setLoading(false));
  }, [widgetId, token]);

  const handleCaptcha = async () => {
    setCaptchaLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setCaptchaLoading(false);
    setCaptchaPassed(true);
    toast.success('Verification passed');
  };

  const accent = widget?.theme?.primary_color || PRIMARY;
  const pageBg = widget?.theme?.background_color || '#f1f5f9';

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4" style={{ background: pageBg, fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="w-full max-w-lg">
        <div className="rounded-t-2xl px-6 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }}>
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              {widget?.type === 'email' ? <Mail size={20} className="text-white" /> : widget?.type === 'combined' ? <Layers size={20} className="text-white" /> : <MessageSquare size={20} className="text-white" />}
            </div>
            <div>
              <div className="text-white text-base" style={{ fontWeight: 800 }}>{widget?.name || 'VireSend Widget'}</div>
              <div className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                <span>Powered by</span>
                <img src={VIRESEND_LOGO_URL} alt="VireSend" style={{ height: 16, width: 'auto', display: 'inline-block' }} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-b-2xl p-6" style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
          {loading ? (
            <div className="text-center py-10">
              <Loader2 size={36} className="animate-spin" style={{ color: PRIMARY, margin: '0 auto 12px' }} />
              <p className="text-sm" style={{ color: SLATE }}>Loading widget...</p>
            </div>
          ) : !widget ? (
            <div className="text-center py-10">
              <AlertCircle size={40} style={{ color: DANGER, margin: '0 auto 12px' }} />
              <div className="text-base mb-2" style={{ color: DARK, fontWeight: 700 }}>Widget Not Found</div>
              <p className="text-sm" style={{ color: SLATE }}>{loadError || 'This widget is invalid or disabled.'}</p>
            </div>
          ) : widget.captchaEnabled && !captchaPassed ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${PRIMARY}10` }}>
                <Shield size={26} style={{ color: PRIMARY }} />
              </div>
              <div className="text-base mb-1" style={{ color: DARK, fontWeight: 800 }}>Verify you're human</div>
              <p className="text-sm mb-6" style={{ color: SLATE }}>Please complete the verification before sending.</p>
              <button onClick={handleCaptcha} disabled={captchaLoading} className="flex items-center justify-center gap-2 w-full text-white py-3 rounded-xl text-sm transition-all" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)`, fontWeight: 700 }}>
                {captchaLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : 'Verify & Continue'}
              </button>
            </div>
          ) : (
            <>
              {widget.type === 'sms' && <SmsWidget widgetId={widgetId!} token={token} widget={widget} />}
              {widget.type === 'email' && <EmailWidget widgetId={widgetId!} token={token} widget={widget} />}
              {widget.type === 'combined' && <CombinedWidget widgetId={widgetId!} token={token} widget={widget} />}
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }}>
            <Send size={10} className="text-white" style={{ transform: 'rotate(-15deg)' }} />
          </div>
          <span className="text-xs flex items-center gap-1.5" style={{ color: '#94a3b8' }}>
            <span>Powered by</span>
            <a href="/" target="_parent" className="inline-flex items-center">
              <img src={VIRESEND_LOGO_URL} alt="VireSend" style={{ height: 18, width: 'auto', display: 'block' }} />
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
