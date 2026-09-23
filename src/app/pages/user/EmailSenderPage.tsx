import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Mail, Users, Send, Upload, Loader2, ChevronDown, Info,
  CheckCircle, AlertCircle, Eye, X, Wallet, Zap, Calendar,
  Plus, ExternalLink, Settings, Code2, AlignLeft, Monitor,
  Smartphone, Copy, RotateCcw, FileText, Paperclip, Image as ImageIcon,
  FileSpreadsheet, FileType2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';
import { safeClipboardCopy } from '../../utils/clipboard';
import {
  getContactGroups,
  getEmailAccounts,
  getEmailStats,
  getTemplates,
  sendBulkEmail,
  sendSingleEmail,
} from '../../../lib/api.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CONNECTED_ACCOUNTS = [
  { id: 'acc-1', email: 'hello@viresender.com', label: 'hello@viresender.com (Gmail)', provider: 'gmail' },
  { id: 'acc-2', email: 'alerts@viresender.com', label: 'alerts@viresender.com (SMTP)', provider: 'smtp' },
];

const EMAIL_TEMPLATES = [
  { id: 1, name: 'Welcome Email', subject: 'Welcome to VireSend!', type: 'html' as const },
  { id: 2, name: 'OTP Alert', subject: 'Your verification code is ready', type: 'plain' as const },
  { id: 3, name: 'Promo Offer', subject: 'Special offer just for you 🎁', type: 'html' as const },
  { id: 4, name: 'Account Alert', subject: 'Security notice for your account', type: 'plain' as const },
];

const CONTACT_GROUPS = ['All Contacts (2,847)', 'Premium Users (480)', 'Newsletter (1,200)', 'Verified (720)'];
const COST_PER_EMAIL = 0.001;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv';

const VARIABLES = [
  { key: 'name', label: '{{name}}', desc: 'Recipient name' },
  { key: 'email', label: '{{email}}', desc: 'Recipient email' },
  { key: 'company', label: '{{company}}', desc: 'Company name' },
  { key: 'code', label: '{{code}}', desc: 'OTP / verification code' },
  { key: 'date', label: '{{date}}', desc: 'Current date' },
];

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#1E3A8A;padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.5px;">VireSend</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px;">Hello {{name}} 👋</h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                Welcome to VireSend! Your account is ready and you can start receiving OTPs instantly.
              </p>
              <a href="#" style="display:inline-block;background:#1E3A8A;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                Get Started
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                © 2025 VireSend &nbsp;·&nbsp;
                <a href="#" style="color:#94a3b8;">Unsubscribe</a> &nbsp;·&nbsp;
                <a href="#" style="color:#94a3b8;">Privacy Policy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const DEFAULT_PLAIN = `Dear {{name}},

Welcome to VireSend! Your account is ready.

You can now start purchasing virtual numbers and receiving OTPs instantly.

If you have any questions, reply to this email.

Best regards,
The VireSend Team

---
© 2025 VireSend · Unsubscribe at any time`;

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────
function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function attachmentKind(file: File) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return { icon: ImageIcon, label: 'Image', color: 'text-emerald-600 bg-emerald-50' };
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return { icon: FileSpreadsheet, label: 'Spreadsheet', color: 'text-green-600 bg-green-50' };
  if (name.endsWith('.pdf')) return { icon: FileText, label: 'PDF', color: 'text-red-600 bg-red-50' };
  return { icon: FileType2, label: 'Document', color: 'text-blue-600 bg-blue-50' };
}

function validateAttachmentFiles(files: File[]) {
  const allowed = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'];
  const blocked = ['exe', 'bat', 'cmd', 'js', 'php', 'sh', 'zip'];
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (blocked.includes(ext) || !allowed.includes(ext)) return `${file.name} is not an allowed attachment type.`;
    if (file.size > MAX_ATTACHMENT_SIZE) return `${file.name} is larger than 10MB.`;
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_ATTACHMENT_SIZE) return 'Total attachments cannot exceed 20MB.';
  return '';
}

function AttachmentPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

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
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`border border-dashed rounded-xl p-3 transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center">
              <Paperclip className="w-4 h-4 text-blue-700" />
            </div>
            <div>
              <p className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Attachments</p>
              <p className="text-xs text-gray-400">Drop files here or attach images, PDFs, docs, spreadsheets, and CSVs.</p>
            </div>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:border-blue-300 text-gray-700 rounded-xl text-xs transition-colors" style={{ fontWeight: 600 }}>
            <Paperclip className="w-3.5 h-3.5" />
            Attach File
          </button>
          <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={e => {
            if (e.target.files) addFiles(e.target.files);
            e.currentTarget.value = '';
          }} />
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => {
            const kind = attachmentKind(file);
            const Icon = kind.icon;
            return (
              <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kind.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 truncate" style={{ fontWeight: 600 }}>{file.name}</div>
                  <div className="text-xs text-gray-400">{formatBytes(file.size)} - {kind.label}</div>
                </div>
                <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{files.length} file{files.length === 1 ? '' : 's'}</span>
            <span>{formatBytes(totalSize)} total</span>
          </div>
          {totalSize > 15 * 1024 * 1024 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2">Large attachments may take longer to send.</div>}
        </div>
      )}
    </div>
  );
}

function appendEmailFields(formData: FormData, fields: Record<string, any>, attachments: File[]) {
  Object.entries(fields).forEach(([key, value]) => {
    if (Array.isArray(value)) formData.append(key, value.join('\n'));
    else formData.append(key, value ?? '');
  });
  attachments.forEach(file => formData.append('attachments', file));
  return formData;
}

function PreviewModal({
  html,
  subject,
  fromEmail,
  toEmail,
  isPlain,
  onClose,
}: {
  html: string;
  subject: string;
  fromEmail: string;
  toEmail: string;
  isPlain: boolean;
  onClose: () => void;
}) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  const renderContent = isPlain
    ? `<html><head><style>body{font-family:Arial,sans-serif;padding:24px;color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;max-width:560px;margin:0 auto;}</style></head><body>${html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body></html>`
    : html;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex flex-col">
      {/* Modal header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-600" />
            <span className="text-gray-800 text-sm" style={{ fontWeight: 700 }}>Email Preview</span>
          </div>
          {/* Desktop / Mobile toggle */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                viewMode === 'desktop' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ fontWeight: viewMode === 'desktop' ? 600 : 400 }}
            >
              <Monitor className="w-3.5 h-3.5" />
              Desktop
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                viewMode === 'mobile' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ fontWeight: viewMode === 'mobile' ? 600 : 400 }}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Mobile
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl text-sm transition-colors"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto bg-gray-200 flex flex-col items-center py-8 px-4">
        {/* Email client chrome */}
        <div
          className="bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-300"
          style={{ width: viewMode === 'desktop' ? '680px' : '390px', maxWidth: '100%' }}
        >
          {/* Email header bar */}
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-14 shrink-0">From</span>
              <span className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{fromEmail || 'sender@viresender.com'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-14 shrink-0">To</span>
              <span className="text-sm text-gray-700">{toEmail || 'recipient@example.com'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-14 shrink-0">Subject</span>
              <span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>
                {subject || <span className="text-gray-400 font-normal">(no subject)</span>}
              </span>
            </div>
          </div>

          {/* Rendered email content */}
          <div
            className="w-full overflow-auto"
            style={{ minHeight: '400px', maxHeight: 'calc(100vh - 280px)' }}
          >
            <iframe
              key={`${viewMode}-${html.length}`}
              srcDoc={renderContent}
              title="Email Preview"
              className="w-full border-0"
              style={{ minHeight: '500px', height: '600px' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        {/* Viewport label */}
        <div className="mt-4 text-xs text-gray-400 bg-white/70 px-3 py-1.5 rounded-full backdrop-blur-sm">
          {viewMode === 'desktop' ? '680px · Desktop view' : '390px · Mobile view'}
        </div>
      </div>
    </div>
  );
}

// ─── MODE TOGGLE ─────────────────────────────────────────────────────────────
function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'plain' | 'html';
  onChange: (m: 'plain' | 'html') => void;
}) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
      <button
        onClick={() => onChange('plain')}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs transition-all ${
          mode === 'plain' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
        style={{ fontWeight: mode === 'plain' ? 600 : 400 }}
      >
        <AlignLeft className="w-3.5 h-3.5" />
        Plain Text
      </button>
      <button
        onClick={() => onChange('html')}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs transition-all ${
          mode === 'html' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
        style={{ fontWeight: mode === 'html' ? 600 : 400 }}
      >
        <Code2 className="w-3.5 h-3.5" />
        HTML Email
      </button>
    </div>
  );
}

// ─── VARIABLE BAR ─────────────────────────────────────────────────────────────
function VariableBar({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-400 mr-1">Insert:</span>
      {VARIABLES.map(v => (
        <button
          key={v.key}
          onClick={() => onInsert(v.label)}
          title={v.desc}
          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-mono border border-blue-100"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ─── HTML EDITOR ─────────────────────────────────────────────────────────────
function HtmlEditor({
  value,
  onChange,
  rows = 16,
  onPreview,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  onPreview?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lines = value.split('\n').length;

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = value.slice(0, start) + text + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [value, onChange]);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <VariableBar onInsert={insertAtCursor} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{lines} lines · {value.length} chars</span>
          {onPreview && (
            <button
              onClick={onPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs transition-colors"
              style={{ fontWeight: 600 }}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview Email
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50 transition-all">
        {/* Editor top bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-300" />
            <div className="w-3 h-3 rounded-full bg-amber-300" />
            <div className="w-3 h-3 rounded-full bg-emerald-300" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-mono">HTML</span>
            <button
              onClick={() => { onChange(DEFAULT_HTML); toast.success('Reset to default template'); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-md hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={() => { safeClipboardCopy(value); toast.success('HTML copied!'); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-md hover:bg-gray-200 transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          spellCheck={false}
          className="w-full px-4 py-3 text-sm font-mono bg-gray-950 text-emerald-300 outline-none resize-none leading-6"
          style={{ caretColor: '#34d399', tabSize: 2 }}
          placeholder={`<!-- Paste or write your HTML email here -->\n<h2>Hello {{name}}</h2>\n<p>Welcome to our service.</p>`}
        />
      </div>

      {/* HTML hint */}
      {value.length > 0 && !value.trim().startsWith('<') && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Your content doesn't look like HTML. Consider switching to Plain Text mode or wrapping in HTML tags.
        </div>
      )}
    </div>
  );
}

// ─── PLAIN TEXT EDITOR ────────────────────────────────────────────────────────
function PlainEditor({
  value,
  onChange,
  rows = 12,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = value.slice(0, start) + text + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [value, onChange]);

  return (
    <div className="space-y-2">
      <VariableBar onInsert={insertAtCursor} />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={`Dear {{contact_name}},\n\nWrite your email message here.\n\nBest regards,\nVireSend Team`}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none leading-relaxed"
      />
    </div>
  );
}

// ─── FROM SELECTOR ────────────────────────────────────────────────────────────
function FromSelector({ value, onChange, accounts }: { value: string; onChange: (v: string) => void; accounts: any[] }) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm text-gray-700" style={{ fontWeight: 500 }}>From</label>
        <Link to="/user/email-accounts" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
          <Settings className="w-3 h-3" />
          Manage accounts
        </Link>
      </div>
      {accounts.length === 0 ? (
        <Link
          to="/user/email-accounts"
          className="flex items-center justify-between w-full px-3 py-2.5 border border-dashed border-amber-300 rounded-xl text-sm bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            No email account connected — click to connect one
          </div>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      ) : (
        <div className="relative">
          <button
            onClick={() => setOpen(p => !p)}
            className={`w-full flex items-center justify-between px-3 py-2.5 border rounded-xl text-sm hover:border-blue-300 bg-white transition-colors ${
              !value ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
            }`}
          >
            {selected ? (
              <div className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  selected.provider === 'gmail' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  <span className="text-[9px]" style={{ fontWeight: 700 }}>{selected.provider === 'gmail' ? 'G' : '@'}</span>
                </div>
                <span className="text-gray-800" style={{ fontWeight: 500 }}>{selected.email}</span>
                <span className="text-xs text-gray-400">({selected.provider === 'gmail' ? 'Gmail' : 'SMTP'})</span>
                <span className="flex items-center gap-1 text-xs text-emerald-600 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              </div>
            ) : (
              <span className="text-amber-600 text-sm">Select sending account…</span>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
          {open && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { onChange(acc.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${value === acc.id ? 'bg-blue-50' : ''}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    acc.provider === 'gmail' ? 'bg-red-100' : 'bg-blue-100'
                  }`}>
                    <span className="text-[9px]" style={{ fontWeight: 700 }}>{acc.provider === 'gmail' ? 'G' : '@'}</span>
                  </div>
                  <span className="text-gray-800" style={{ fontWeight: 500 }}>{acc.email}</span>
                  <span className="text-gray-400 text-xs ml-auto">{acc.provider === 'gmail' ? 'Gmail' : 'SMTP'}</span>
                  {value === acc.id && <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
              <Link
                to="/user/email-accounts"
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add another account
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── VALIDATION BANNER ────────────────────────────────────────────────────────
function ValidationBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1">
      {errors.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-sm text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
          {e}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function EmailSenderPage() {
  const { user, updateBalance } = useAuth();
  const { isEnabled } = useServiceAvailability();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [contactGroups, setContactGroups] = useState<any[]>([]);
  const [costPerEmail, setCostPerEmail] = useState(COST_PER_EMAIL);
  const [emailEnabled, setEmailEnabled] = useState(true);

  // ── Single email state ──
  const [fromAccount, setFromAccount] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [mode, setMode] = useState<'plain' | 'html'>('plain');
  const [plainBody, setPlainBody] = useState(DEFAULT_PLAIN);
  const [htmlBody, setHtmlBody] = useState(DEFAULT_HTML);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [singleAttachments, setSingleAttachments] = useState<File[]>([]);

  // ── Bulk email state ──
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkMode, setBulkMode] = useState<'plain' | 'html'>('plain');
  const [bulkPlainBody, setBulkPlainBody] = useState('');
  const [bulkHtmlBody, setBulkHtmlBody] = useState(DEFAULT_HTML);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [bulkAttachments, setBulkAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadEmailData = async () => {
      try {
        const [accountRes, statsRes, templateRes, groupRes] = await Promise.all([
          getEmailAccounts(),
          getEmailStats(),
          getTemplates({ category: 'all' }),
          getContactGroups(),
        ]);
        const connectedAccounts = (accountRes.accounts || []).filter((account: any) => account.status === 'connected');
        setAccounts(connectedAccounts);
        const defaultAccount = connectedAccounts.find((account: any) => account.isDefault) || connectedAccounts[0];
        if (defaultAccount) {
          setFromAccount(prev => prev || defaultAccount.id);
          setBulkFrom(prev => prev || defaultAccount.id);
        }
        setCostPerEmail(statsRes.stats?.cost_per_email ?? accountRes.settings?.cost_per_email ?? COST_PER_EMAIL);
        setEmailEnabled(statsRes.stats?.email_enabled ?? accountRes.settings?.email_enabled ?? true);
        setTemplates(templateRes.templates || []);
        setContactGroups(groupRes.groups || []);
      } catch (error: any) {
        toast.error(error?.data?.message || error?.message || 'Could not load email data.');
      }
    };
    loadEmailData();
  }, []);

  if (!isEnabled('email_sender')) return <ServiceLockedOverlay serviceKey="email_sender" />;

  // Computed
  const rawEmails = bulkEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
  const uniqueEmails = [...new Set(rawEmails)];
  const bulkCount = uniqueEmails.length;
  const selectedGroupCount = Number(contactGroups.find((group: any) => (typeof group === 'string' ? group : group.name) === selectedGroup)?.count || 0);
  const bulkRecipientCount = bulkCount + selectedGroupCount;
  const duplicatesRemoved = rawEmails.length - bulkCount;
  const bulkCost = bulkRecipientCount * costPerEmail;
  const emailIsFree = costPerEmail <= 0;

  const selectedFromAccount = accounts.find(a => a.id === fromAccount);

  // Validation
  const getSingleErrors = () => {
    const errs: string[] = [];
    if (!emailEnabled) errs.push('Email sending is currently disabled.');
    if (!fromAccount) errs.push('No sending account selected — connect one first.');
    if (!subject.trim()) errs.push('Subject line is required.');
    if (mode === 'html' && !htmlBody.trim()) errs.push('HTML body cannot be empty.');
    if (mode === 'plain' && !plainBody.trim()) errs.push('Message body cannot be empty.');
    if (!toEmail.trim()) errs.push('Recipient email address is required.');
    else if (!toEmail.includes('@')) errs.push('Recipient email address is invalid.');
    if (!emailIsFree && (user?.balance ?? user?.wallet_balance ?? 0) < costPerEmail) errs.push('Insufficient wallet balance.');
    const attachmentError = validateAttachmentFiles(singleAttachments);
    if (attachmentError) errs.push(attachmentError);
    return errs;
  };

  const getBulkErrors = () => {
    const errs: string[] = [];
    if (!emailEnabled) errs.push('Email sending is currently disabled.');
    if (!bulkFrom) errs.push('No sending account selected.');
    if (!bulkSubject.trim()) errs.push('Subject line is required.');
    if (bulkMode === 'html' && !bulkHtmlBody.trim()) errs.push('HTML body cannot be empty.');
    if (bulkMode === 'plain' && !bulkPlainBody.trim()) errs.push('Message body cannot be empty.');
    if (bulkRecipientCount === 0) errs.push('No valid recipient emails found.');
    if (!emailIsFree && (user?.balance ?? user?.wallet_balance ?? 0) < bulkCost) errs.push('Insufficient wallet balance.');
    const attachmentError = validateAttachmentFiles(bulkAttachments);
    if (attachmentError) errs.push(attachmentError);
    return errs;
  };

  const handleSendSingle = async () => {
    const errs = getSingleErrors();
    if (errs.length > 0) { toast.error(errs[0]); return; }
    setSending(true);
    try {
      const payload = {
        account_id: fromAccount,
        to_email: toEmail,
        subject,
        format: mode,
        message: mode === 'html' ? htmlBody : plainBody,
      };
      const response = await sendSingleEmail(singleAttachments.length ? appendEmailFields(new FormData(), payload, singleAttachments) : payload);
      if (typeof response.wallet_balance === 'number') updateBalance(response.wallet_balance);
      toast.success(response.message || 'Email sent. Delivery status will update if a bounce is detected.');
      setToEmail(''); setSubject('');
      setSingleAttachments([]);
      navigate('/user/email-message-logs');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Email could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const handleSendBulk = async () => {
    const errs = getBulkErrors();
    if (errs.length > 0) { toast.error(errs[0]); return; }
    setSendingBulk(true);
    setBulkProgress(0);
    try {
      const payload = {
        account_id: bulkFrom,
        recipients: uniqueEmails,
        group: selectedGroup,
        subject: bulkSubject,
        format: bulkMode,
        message: bulkMode === 'html' ? bulkHtmlBody : bulkPlainBody,
      };
      const response = await sendBulkEmail(bulkAttachments.length ? appendEmailFields(new FormData(), payload, bulkAttachments) : payload);
      setBulkProgress(100);
      if (typeof response.wallet_balance === 'number') updateBalance(response.wallet_balance);
      toast.success(response.message || 'Emails accepted. Delivery status will update if bounces are detected.');
      setBulkEmails(''); setBulkSubject(''); setBulkProgress(0);
      setBulkAttachments([]);
      navigate('/user/email-message-logs');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Bulk email could not be sent.');
    } finally {
      setSendingBulk(false);
    }
  };

  const importCsvEmails = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const emailIndex = headers.findIndex(h => h === 'email' || h === 'email_address');
    const emails = lines.slice(1).map(line => {
      const cells = line.split(',').map(cell => cell.trim());
      return cells[emailIndex >= 0 ? emailIndex : 0];
    }).filter(email => email && email.includes('@'));
    setBulkEmails(prev => [prev, ...emails].filter(Boolean).join('\n'));
    toast.success(`${emails.length} email(s) imported from CSV.`);
  };

  const applyTemplate = (tId: string) => {
    const t = templates.find(t => t.id === tId || t.template_id === tId);
    if (t) {
      setBulkSubject(t.subject || t.name || '');
      setBulkMode('plain');
      setBulkPlainBody(t.message || '');
      setSelectedTemplate(tId);
      setShowTemplateDropdown(false);
      toast.success(`Template "${t.name}" applied`);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Email Sender</h1>
          <p className="text-gray-500 text-sm mt-0.5">Send plain text or rich HTML emails from your connected accounts.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => navigate('/user/email/copy-paste-mode')}
            className="flex items-center gap-2 bg-white hover:bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-sm border border-blue-100 transition-colors"
            style={{ fontWeight: 600 }}
            type="button"
          >
            <Copy className="w-4 h-4" />
            Copy & Paste Mode
          </button>
          <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-sm border border-blue-100">
            <Wallet className="w-4 h-4" />
            <span style={{ fontWeight: 600 }}>Balance: GHS {user?.balance?.toFixed(2) || '0.00'}</span>
          </div>
        </div>
      </div>

      {/* No accounts banner */}
      {accounts.length === 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm text-amber-800" style={{ fontWeight: 600 }}>No email accounts connected</p>
              <p className="text-xs text-amber-600 mt-0.5">Connect a Gmail or SMTP account before sending.</p>
            </div>
          </div>
          <Link
            to="/user/email-accounts"
            className="flex-shrink-0 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs transition-colors"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-3.5 h-3.5" />
            Connect Account
          </Link>
        </div>
      )}

      {/* Channel tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([['single', 'Single Email', Mail], ['bulk', 'Bulk Email', Users]] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm transition-all ${
              activeTab === tab ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{ fontWeight: activeTab === tab ? 600 : 400 }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SINGLE EMAIL TAB                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'single' && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Left — compose */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* From */}
              <FromSelector value={fromAccount} onChange={setFromAccount} accounts={accounts} />

              {/* To */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>To</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    placeholder="recipient@example.com"
                    value={toEmail}
                    onChange={e => setToEmail(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 ${
                      toEmail && !toEmail.includes('@') ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                </div>
                {toEmail && !toEmail.includes('@') && (
                  <p className="text-xs text-red-500 mt-1">Please enter a valid email address.</p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Your verification code is ready"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 ${
                    !subject ? 'border-gray-200' : 'border-gray-200'
                  }`}
                />
                {subject.length > 78 && (
                  <p className="text-xs text-amber-500 mt-1">Subject is long — some email clients may truncate it.</p>
                )}
              </div>

              {/* Mode toggle */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Message</label>
                  <ModeToggle mode={mode} onChange={m => setMode(m)} />
                </div>

                {/* Plain text editor */}
                {mode === 'plain' && (
                  <PlainEditor value={plainBody} onChange={setPlainBody} rows={12} />
                )}

                {/* HTML editor */}
                {mode === 'html' && (
                  <HtmlEditor
                    value={htmlBody}
                    onChange={setHtmlBody}
                    rows={16}
                    onPreview={() => setShowPreview(true)}
                  />
                )}
              </div>

              <AttachmentPicker files={singleAttachments} onChange={setSingleAttachments} />

              {/* Validation */}
              <ValidationBanner errors={getSingleErrors().filter(e => {
                // only show after user has interacted
                if (e.includes('account') && !fromAccount) return true;
                if (e.includes('Subject') && subject === '') return false; // hide until touched
                return false;
              })} />
            </div>

            {/* HTML info */}
            {mode === 'html' && (
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                <Code2 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-blue-700" style={{ fontWeight: 600 }}>HTML Email Tips</p>
                  <p className="text-xs text-blue-600 mt-1 leading-relaxed">
                    Use inline CSS for maximum email client compatibility. Variables like{' '}
                    <code className="bg-blue-100 px-1 rounded font-mono">{'{{name}}'}</code> are replaced at send time.
                    Click <span style={{ fontWeight: 600 }}>Preview Email</span> to check how it renders.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Sending from */}
            {selectedFromAccount && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>Sending From</div>
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    selectedFromAccount.provider === 'gmail' ? 'bg-red-50' : 'bg-blue-50'
                  }`}>
                    <span className="text-sm" style={{ fontWeight: 700 }}>
                      {selectedFromAccount.provider === 'gmail' ? 'G' : '@'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{selectedFromAccount.email}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="text-xs text-emerald-600">Connected · Ready</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Format badge */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>Email Format</div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                mode === 'html' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {mode === 'html' ? <Code2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                <span style={{ fontWeight: 500 }}>{mode === 'html' ? 'Rich HTML Email' : 'Plain Text Email'}</span>
              </div>
              {mode === 'html' && (
                <button
                  onClick={() => setShowPreview(true)}
                  className="w-full mt-3 flex items-center justify-center gap-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2.5 rounded-xl text-xs transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview Email
                </button>
              )}
            </div>

            {/* Cost */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs text-gray-400 mb-3 uppercase tracking-wide" style={{ fontWeight: 600 }}>Cost Estimate</div>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Per email</span>
                  <span className={emailIsFree ? 'text-emerald-600' : 'text-gray-700'} style={{ fontWeight: 600 }}>{emailIsFree ? 'Free' : `GHS ${costPerEmail.toFixed(3)}`}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Recipients</span>
                  <span className="text-gray-700" style={{ fontWeight: 500 }}>1</span>
                </div>
                <div className="border-t border-gray-100 pt-2.5 flex justify-between">
                  <span className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Total</span>
                  <span className={emailIsFree ? 'text-emerald-600' : 'text-blue-900'} style={{ fontWeight: 700 }}>{emailIsFree ? 'Free' : `GHS ${costPerEmail.toFixed(3)}`}</span>
                </div>
              </div>
              <div className="mt-3 p-2.5 bg-gray-50 rounded-xl flex justify-between text-xs">
                <span className="text-gray-500">Wallet balance</span>
                <span className="text-gray-700" style={{ fontWeight: 600 }}>GHS {user?.balance?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleSendSingle}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm transition-all"
              style={{ fontWeight: 600 }}
            >
              {sending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Send className="w-4 h-4" /> Send Email</>}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BULK EMAIL TAB                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'bulk' && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Left */}
          <div className="lg:col-span-2 space-y-4">
            {/* From + Recipients */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <FromSelector value={bulkFrom} onChange={setBulkFrom} accounts={accounts} />

              <div className="border-t border-gray-100 pt-1">
                <h3 className="text-sm text-gray-700 mb-3" style={{ fontWeight: 600 }}>Recipients</h3>

                {/* Upload CSV */}
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setIsDragging(false);
                    importCsvEmails(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all mb-4 ${
                    isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <Upload className={`w-7 h-7 mx-auto mb-2 ${isDragging ? 'text-blue-500' : 'text-gray-300'}`} />
                  <p className="text-sm text-gray-600" style={{ fontWeight: 500 }}>Drop a CSV or click to upload</p>
                  <p className="text-xs text-gray-400 mt-0.5">Columns: email, name, company — max 100,000 rows</p>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => importCsvEmails(e.target.files?.[0])} />
                </div>

                {/* Contact groups */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Or select a contact group</label>
                  <div className="flex gap-2 flex-wrap">
                    {contactGroups.map((group: any) => {
                      const groupName = typeof group === 'string' ? group : group.name;
                      const label = typeof group === 'string' ? group : `${group.name} (${group.count || 0})`;
                      return (
                      <button
                        key={groupName}
                        onClick={() => setSelectedGroup(selectedGroup === groupName ? '' : groupName)}
                        className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                          selectedGroup === groupName ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    )})}
                  </div>
                </div>

                {/* Manual input */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                    Manual entry <span className="text-gray-400 font-normal">(one email per line)</span>
                  </label>
                  <textarea
                    placeholder="alice@example.com&#10;bob@example.com&#10;charlie@example.com"
                    value={bulkEmails}
                    onChange={e => setBulkEmails(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
                  />
                  {rawEmails.length > 0 && (
                    <div className="flex gap-3 mt-2">
                      <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                        <CheckCircle className="w-3 h-3" /> {bulkCount} valid
                      </span>
                      {duplicatesRemoved > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                          <AlertCircle className="w-3 h-3" /> {duplicatesRemoved} duplicates removed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Email content */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Template picker */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Load from Template <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowTemplateDropdown(p => !p)}
                    className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl text-sm hover:border-gray-300 bg-white"
                  >
                    <span className="text-gray-500">
                      {selectedTemplate ? templates.find(t => t.id === selectedTemplate || t.template_id === selectedTemplate)?.name : 'Select a template…'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  {showTemplateDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                      {templates.map(t => (
                        <button key={t.id || t.template_id} onClick={() => applyTemplate(t.id || t.template_id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                          <div className="text-left">
                            <span className="text-gray-800 block" style={{ fontWeight: 500 }}>{t.name}</span>
                            <span className="text-gray-400 text-xs">{t.category || 'Template'}</span>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            PLAIN
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Subject</label>
                <input
                  type="text"
                  placeholder="Email subject line"
                  value={bulkSubject}
                  onChange={e => setBulkSubject(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>

              {/* Mode toggle + editor */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Message</label>
                  <ModeToggle mode={bulkMode} onChange={m => setBulkMode(m)} />
                </div>

                {bulkMode === 'plain' && (
                  <PlainEditor value={bulkPlainBody} onChange={setBulkPlainBody} rows={10} />
                )}

                {bulkMode === 'html' && (
                  <HtmlEditor
                    value={bulkHtmlBody}
                    onChange={setBulkHtmlBody}
                    rows={18}
                    onPreview={() => setShowBulkPreview(true)}
                  />
                )}
              </div>

              <AttachmentPicker files={bulkAttachments} onChange={setBulkAttachments} />

              {/* Schedule */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Schedule <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>

              {/* Progress bar */}
              {sendingBulk && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Sending {bulkMode === 'html' ? 'HTML' : 'plain text'} emails…</span>
                    <span style={{ fontWeight: 600 }}>{bulkProgress}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${bulkProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Validation */}
              {getBulkErrors().length > 0 && bulkRecipientCount === 0 && bulkEmails.length > 0 && (
                <ValidationBanner errors={getBulkErrors().filter(e => e.includes('recipient'))} />
              )}
            </div>
          </div>

          {/* Right — summary */}
          <div className="space-y-4">
            {/* Sending from */}
            {accounts.find(a => a.id === bulkFrom) && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>Sending From</div>
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    accounts.find(a => a.id === bulkFrom)?.provider === 'gmail' ? 'bg-red-50' : 'bg-blue-50'
                  }`}>
                    <span className="text-sm" style={{ fontWeight: 700 }}>
                      {accounts.find(a => a.id === bulkFrom)?.provider === 'gmail' ? 'G' : '@'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-800" style={{ fontWeight: 600 }}>
                      {accounts.find(a => a.id === bulkFrom)?.email}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="text-xs text-emerald-600">Ready to send</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Format */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>Format</div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                bulkMode === 'html' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {bulkMode === 'html' ? <Code2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                <span style={{ fontWeight: 500 }}>{bulkMode === 'html' ? 'Rich HTML Email' : 'Plain Text Email'}</span>
              </div>
              {bulkMode === 'html' && (
                <button
                  onClick={() => setShowBulkPreview(true)}
                  className="w-full mt-3 flex items-center justify-center gap-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2.5 rounded-xl text-xs transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview Email
                </button>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-xs text-gray-400 mb-3 uppercase tracking-wide" style={{ fontWeight: 600 }}>Send Summary</div>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Recipients</span>
                  <span className="text-gray-800" style={{ fontWeight: 600 }}>{bulkRecipientCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Duplicates removed</span>
                  <span className="text-amber-600" style={{ fontWeight: 500 }}>{duplicatesRemoved}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cost per email</span>
                  <span className={emailIsFree ? 'text-emerald-600' : 'text-gray-700'} style={{ fontWeight: 600 }}>{emailIsFree ? 'Free' : `GHS ${costPerEmail.toFixed(3)}`}</span>
                </div>
                {scheduleTime && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Scheduled for</span>
                    <span className="text-purple-600 text-xs" style={{ fontWeight: 500 }}>{scheduleTime}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Estimated Total</span>
                    <span className={emailIsFree ? 'text-emerald-600 text-lg' : 'text-blue-900 text-lg'} style={{ fontWeight: 700 }}>{emailIsFree ? 'Free' : `GHS ${bulkCost.toFixed(3)}`}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-2.5 bg-gray-50 rounded-xl flex justify-between text-xs">
                <span className="text-gray-500">Wallet balance</span>
                <span className="text-gray-700" style={{ fontWeight: 600 }}>GHS {user?.balance?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3.5">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">
                {scheduleTime
                  ? 'Email will be queued and sent at the scheduled time.'
                  : 'Bulk emails are sent in batches. Bounce tracking updates status later when available.'}
              </p>
            </div>

            <button
              onClick={handleSendBulk}
              disabled={sendingBulk}
              className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm transition-all"
              style={{ fontWeight: 600 }}
            >
              {sendingBulk
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending {bulkProgress}%</>
                : scheduleTime
                  ? <><Calendar className="w-4 h-4" /> Schedule Send{bulkRecipientCount > 0 ? ` (${bulkRecipientCount})` : ''}</>
                  : <><Zap className="w-4 h-4" /> Send Now{bulkRecipientCount > 0 ? ` (${bulkRecipientCount})` : ''}</>}
            </button>
          </div>
        </div>
      )}

      {/* ─── Preview modals ─── */}
      {showPreview && (
        <PreviewModal
          html={mode === 'html' ? htmlBody : plainBody}
          subject={subject}
          fromEmail={selectedFromAccount?.email || ''}
          toEmail={toEmail}
          isPlain={mode === 'plain'}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showBulkPreview && (
        <PreviewModal
          html={bulkMode === 'html' ? bulkHtmlBody : bulkPlainBody}
          subject={bulkSubject}
          fromEmail={accounts.find(a => a.id === bulkFrom)?.email || ''}
          toEmail="preview@example.com"
          isPlain={bulkMode === 'plain'}
          onClose={() => setShowBulkPreview(false)}
        />
      )}
    </div>
  );
}


