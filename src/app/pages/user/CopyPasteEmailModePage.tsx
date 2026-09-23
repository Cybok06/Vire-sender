import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Check,
  Clock,
  Edit3,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageCircle,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Send,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  assistVireSendEmail,
  createCopyPasteDraft,
  getCopyPasteJob,
  getCopyPasteDrafts,
  getEmailAccounts,
  getGmailMessage,
  getGmailUnreadInbox,
  getGoogleChatConnectUrl,
  getGoogleChatMessages,
  getGoogleChatSpaces,
  getGoogleChatStatus,
  queueCopyPasteEmails,
  sendCopyPasteEmails,
  sendGmailReply,
  sendGoogleChatMessage,
  startGoogleChat,
  updateCopyPasteDraft,
} from '../../../lib/api.js';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';

const DEFAULT_DOMAINS = ['@gmail.com', '@yahoo.com', '@outlook.com', '@hotmail.com'];
const ACCEPTED_ATTACHMENTS = '.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const ACCOUNT_AVATAR_URL = 'https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/3a3047f5-68bb-46cd-b80e-eee805cdd900/public';
const AI_ACTIONS = [
  { action: 'fix_grammar', label: 'Fix Grammar' },
  { action: 'rewrite', label: 'Rewrite' },
  { action: 'professional', label: 'Professional' },
  { action: 'friendly', label: 'Friendly' },
  { action: 'shorten', label: 'Shorten' },
  { action: 'expand', label: 'Expand' },
  { action: 'marketing', label: 'Marketing' },
  { action: 'formal', label: 'Formal' },
  { action: 'translate', label: 'Translate' },
  { action: 'generate_subject', label: 'Generate Subject' },
  { action: 'custom', label: 'Custom Prompt' },
] as const;

type EmailAccount = {
  id?: string;
  account_id?: string;
  email?: string;
  email_address?: string;
  display_name?: string;
  provider?: string;
  status?: string;
  is_default?: boolean;
  avatar_url?: string;
  profile_image_url?: string;
};

type DraftRecord = {
  id?: string;
  draft_id?: string;
  name?: string;
  account_id?: string;
  selected_domain?: string;
  recipients?: string[];
  subject?: string;
  sender_name?: string;
  message?: string;
  format?: 'plain' | 'html';
  attachments?: Array<{ filename?: string; name?: string; size?: number; mime_type?: string; type?: string }>;
  settings?: Record<string, unknown>;
  updated_at?: string;
};

type GmailInboxMessage = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
};

type GmailFullMessage = GmailInboxMessage & {
  to: string;
  body: string;
  messageId: string;
  references?: string;
};

type GoogleChatSpace = {
  id: string;
  name: string;
  displayName: string;
  spaceType: string;
  lastActiveTime: string;
};

type GoogleChatMessage = {
  id: string;
  senderName: string;
  senderEmail: string;
  text: string;
  createTime: string;
  avatar: string;
  isMine: boolean;
};

type ProgressState = {
  open: boolean;
  total: number;
  sent: number;
  failed: number;
  current: string;
  done: boolean;
};

type EmailStatus = 'draft' | 'sending' | 'sent' | 'failed';
type AiAction = typeof AI_ACTIONS[number]['action'];
type AiPreview = { subject: string; message: string } | null;

const initialProgress: ProgressState = { open: false, total: 0, sent: 0, failed: 0, current: '', done: false };

function accountId(account: EmailAccount | undefined) {
  return account?.account_id || account?.id || '';
}

function accountEmail(account: EmailAccount | undefined) {
  return account?.email_address || account?.email || '';
}

function fileIcon(type = '') {
  if (type.startsWith('image/')) return ImageIcon;
  return FileText;
}

function formatSize(size = 0) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatInboxTime(value = '') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function senderLabel(value = '') {
  const match = value.match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] || value.split('<')[0] || value).trim() || 'Unknown sender';
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPasteCandidate(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.length <= 30 && !/\s/.test(trimmed);
}

function delayMs(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function aiPromptPlaceholder(action: AiAction) {
  const placeholders: Record<AiAction, string> = {
    fix_grammar: 'Tell VireSend AI what to polish...',
    rewrite: 'Describe how you want the message rewritten...',
    professional: 'Add any professional tone preference...',
    friendly: 'Describe the friendly tone you want...',
    shorten: 'Mention what should stay most important...',
    expand: 'Add details VireSend AI should include...',
    marketing: 'Describe the marketing tone you want...',
    formal: 'Add formality or audience notes...',
    translate: 'Enter target language...',
    generate_subject: 'Describe the subject style you want...',
    custom: 'Tell VireSend AI what to do...',
  };
  return placeholders[action];
}

export default function CopyPasteEmailModePage() {
  const navigate = useNavigate();
  const { isEnabled } = useServiceAvailability();
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastClipboardRef = useRef('');
  const autoSendingRef = useRef(false);

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountModal, setAccountModal] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState('');
  const [loading, setLoading] = useState(true);

  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState('@gmail.com');
  const [customDomain, setCustomDomain] = useState('');
  const [autoPaste, setAutoPaste] = useState(false);
  const [autoAdd, setAutoAdd] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [autoSendConfirmed, setAutoSendConfirmed] = useState(false);
  const [sendDelay, setSendDelay] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeEmailTab, setActiveEmailTab] = useState<'draft' | 'sent'>('draft');
  const [emailStatuses, setEmailStatuses] = useState<Record<string, EmailStatus>>({});
  const [floatingPaste, setFloatingPaste] = useState('');

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('Hello,\n\n');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [progress, setProgress] = useState<ProgressState>(initialProgress);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAction, setAiAction] = useState<AiAction>('fix_grammar');
  const [aiTargetLanguage, setAiTargetLanguage] = useState('');
  const [aiCustomInstruction, setAiCustomInstruction] = useState('');
  const [aiPreview, setAiPreview] = useState<AiPreview>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [gmailInbox, setGmailInbox] = useState<GmailInboxMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');
  const [selectedGmailMessage, setSelectedGmailMessage] = useState<GmailFullMessage | null>(null);
  const [gmailMessageLoading, setGmailMessageLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [chatConnected, setChatConnected] = useState(false);
  const [chatEmail, setChatEmail] = useState('');
  const [chatSpaces, setChatSpaces] = useState<GoogleChatSpace[]>([]);
  const [selectedChatSpace, setSelectedChatSpace] = useState<GoogleChatSpace | null>(null);
  const [chatMessages, setChatMessages] = useState<GoogleChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessagesLoading, setChatMessagesLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [newChatLoading, setNewChatLoading] = useState(false);

  const aiPromptValue = aiAction === 'translate' ? aiTargetLanguage : aiCustomInstruction;

  const sentCount = useMemo(
    () => recipients.filter((email) => emailStatuses[email] === 'sent').length,
    [emailStatuses, recipients],
  );
  const draftCount = recipients.length - sentCount;
  const visibleRecipients = useMemo(
    () => recipients.filter((email) => (activeEmailTab === 'sent' ? emailStatuses[email] === 'sent' : emailStatuses[email] !== 'sent')),
    [activeEmailTab, emailStatuses, recipients],
  );
  const filteredChatSpaces = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return chatSpaces;
    return chatSpaces.filter((space) => `${space.displayName} ${space.spaceType}`.toLowerCase().includes(query));
  }, [chatSearch, chatSpaces]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => accountId(account) === selectedAccountId),
    [accounts, selectedAccountId],
  );

  const previewText = useMemo(() => {
    const cleanBody = message.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return cleanBody || 'No message yet. Click Edit to compose.';
  }, [message]);

  const buildEmail = useCallback((rawValue: string) => {
    const cleaned = rawValue.trim().replace(/^mailto:/i, '').replace(/[<>"']/g, '');
    if (!cleaned) return '';
    if (cleaned.includes('@')) return cleaned.toLowerCase();
    const domain = selectedDomain === 'custom'
      ? customDomain.trim().replace(/^\s*@?/, '@')
      : selectedDomain;
    if (!domain || domain === '@') return cleaned.toLowerCase();
    return `${cleaned.replace(/\s+/g, '')}${domain}`.toLowerCase();
  }, [customDomain, selectedDomain]);

  const buildSendForm = useCallback((recipient: string) => {
    const formData = new FormData();
    formData.append('account_id', selectedAccountId);
    formData.append('recipients', recipient);
    formData.append('subject', subject);
    formData.append('format', 'plain');
    formData.append('message', message);
    attachments.forEach((file) => formData.append('attachments', file));
    return formData;
  }, [attachments, message, selectedAccountId, subject]);

  const canSendNow = useCallback((quiet = false) => {
    if (!selectedAccountId) {
      if (!quiet) toast.error('Select a connected email account.');
      return false;
    }
    if (!subject.trim() || !message.replace(/<[^>]+>/g, ' ').trim()) {
      if (!quiet) {
        toast.error('Add a subject and message first.');
        setEditorOpen(true);
      }
      return false;
    }
    return true;
  }, [message, selectedAccountId, subject]);

  const sendRecipients = useCallback(async (targetEmails: string[], showProgress = false) => {
    const pending = targetEmails.filter((email) => emailStatuses[email] !== 'sent' && emailStatuses[email] !== 'sending');
    if (!pending.length) return { sent: 0, failed: 0 };
    if (!canSendNow(!showProgress)) return { sent: 0, failed: pending.length };

    cancelRef.current = false;
    let sent = 0;
    let failed = 0;
    if (showProgress) {
      setProgress({ open: true, total: pending.length, sent: 0, failed: 0, current: pending[0] || '', done: false });
    }
    setEmailStatuses((current) => {
      const next = { ...current };
      pending.forEach((email) => {
        next[email] = 'sending';
      });
      return next;
    });

    if (!attachments.length && pending.length > 10) {
      try {
        const queued = await queueCopyPasteEmails({
          account_id: selectedAccountId,
          recipients: pending,
          subject,
          message,
          format: 'plain',
        });
        const jobId = queued.job_id || queued.job?.job_id;
        if (!queued.success || !jobId) {
          throw new Error(queued.message || 'Unable to queue emails.');
        }

        let done = false;
        let polls = 0;
        const maxPolls = 180;
        while (!done && !cancelRef.current) {
          const response = await getCopyPasteJob(jobId);
          const job = response.job || {};
          sent = Number(job.sent || 0);
          failed = Number(job.failed || 0);
          const currentRecipient = job.current || pending.find((email) => emailStatuses[email] !== 'sent') || '';
          if (Array.isArray(job.items)) {
            setEmailStatuses((current) => {
              const next = { ...current };
              job.items.forEach((item: { recipient?: string; status?: string }) => {
                if (!item.recipient) return;
                if (item.status === 'sent') next[item.recipient] = 'sent';
                else if (item.status === 'failed') next[item.recipient] = 'failed';
                else next[item.recipient] = 'sending';
              });
              return next;
            });
          }
          if (showProgress) {
            setProgress((current) => ({ ...current, sent, failed, current: currentRecipient }));
          }
          done = ['completed', 'failed', 'cancelled'].includes(String(job.status || ''));
          polls += 1;
          if (!done && polls >= maxPolls) {
            throw new Error('Email sending is taking too long. Please check Message Logs or try again.');
          }
          if (!done) await delayMs(1);
        }

        if (showProgress) {
          setProgress((current) => ({ ...current, sent, failed, done: true, current: '' }));
          toast.success(`Completed: ${sent} sent, ${failed} failed.`);
        }
        return { sent, failed };
      } catch (error) {
        setEmailStatuses((current) => {
          const next = { ...current };
          pending.forEach((email) => {
            if (next[email] === 'sending') next[email] = 'failed';
          });
          return next;
        });
        if (showProgress) {
          setProgress((current) => ({ ...current, failed: pending.length, done: true, current: '' }));
          toast.error(error instanceof Error ? error.message : 'Unable to send emails.');
        }
        return { sent: 0, failed: pending.length };
      }
    }

    for (const recipient of pending) {
      if (cancelRef.current) break;
      if (showProgress) setProgress((current) => ({ ...current, current: recipient }));
      try {
        const response = await sendCopyPasteEmails(buildSendForm(recipient));
        if (response.success && Number(response.sent || 0) > 0) {
          sent += 1;
          setEmailStatuses((current) => ({ ...current, [recipient]: 'sent' }));
        } else {
          failed += 1;
          setEmailStatuses((current) => ({ ...current, [recipient]: 'failed' }));
        }
      } catch {
        failed += 1;
        setEmailStatuses((current) => ({ ...current, [recipient]: 'failed' }));
      }
      if (showProgress) setProgress((current) => ({ ...current, sent, failed }));
      if (sendDelay > 0 && recipient !== pending[pending.length - 1] && !cancelRef.current) {
        await delayMs(sendDelay);
      }
    }

    if (showProgress) {
      setProgress((current) => ({ ...current, sent, failed, done: true, current: '' }));
      toast.success(`Completed: ${sent} sent, ${failed} failed.`);
    }
    return { sent, failed };
  }, [attachments.length, buildSendForm, canSendNow, emailStatuses, message, selectedAccountId, sendDelay, subject]);

  const addRecipient = useCallback((rawValue = recipientInput) => {
    const pieces = String(rawValue).split(/[\s,;]+/).map(buildEmail).filter(Boolean);
    if (!pieces.length) {
      toast.error('Enter a username or email first.');
      return [];
    }
    const existing = new Set(recipients);
    const added: string[] = [];
    const invalid: string[] = [];

    pieces.forEach((email) => {
      if (!validEmail(email)) {
        invalid.push(email);
        return;
      }
      if (existing.has(email)) return;
      existing.add(email);
      added.push(email);
    });

    if (added.length) {
      setRecipients((current) => [...current, ...added.filter((email) => !current.includes(email))]);
    }
    if (added.length) {
      setEmailStatuses((current) => {
        const next = { ...current };
        added.forEach((email) => {
          next[email] = next[email] || 'draft';
        });
        return next;
      });
    }
    if (invalid.length) toast.error(`${invalid.length} invalid email(s) skipped.`);
    if (added.length) {
      toast.success(`${added.length} recipient${added.length === 1 ? '' : 's'} added.`);
      setRecipientInput('');
    } else if (!invalid.length) {
      toast.info('That email is already in the list.');
    }
    return added;
  }, [buildEmail, recipientInput, recipients]);

  const readClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!isPasteCandidate(trimmed)) return;
      const email = buildEmail(trimmed);
      if (!validEmail(email) || recipients.includes(email) || lastClipboardRef.current === email) return;
      lastClipboardRef.current = email;
      setFloatingPaste(trimmed);
      window.setTimeout(() => setFloatingPaste(''), 900);
      setRecipientInput(trimmed);
      if (autoAdd) {
        addRecipient(trimmed);
      }
    } catch {
      toast.info('Clipboard permission is blocked by the browser.');
    }
  }, [addRecipient, autoAdd, buildEmail, recipients]);

  const draftPayload = useCallback(() => ({
    name: subject || 'Copy Paste Draft',
    account_id: selectedAccountId,
    selected_domain: selectedDomain,
    recipients,
    subject,
    sender_name: '',
    message,
    format: 'plain',
    attachments: attachments.map((file) => ({ name: file.name, size: file.size, type: file.type })),
    settings: { autoPaste, autoAdd, autoSend, sendDelay, customDomain, theme, emailStatuses },
  }), [
    attachments,
    autoAdd,
    autoPaste,
    autoSend,
    customDomain,
    emailStatuses,
    message,
    recipients,
    selectedAccountId,
    selectedDomain,
    sendDelay,
    subject,
    theme,
  ]);

  const persistCurrentDraft = useCallback(async (nextSubject: string, nextMessage: string) => {
    const payload = {
      ...draftPayload(),
      name: nextSubject || 'Copy Paste Draft',
      subject: nextSubject,
      message: nextMessage,
    };
    localStorage.setItem('viresend_copy_paste_email_draft', JSON.stringify(payload));
    try {
      const response = activeDraftId
        ? await updateCopyPasteDraft(activeDraftId, payload)
        : await createCopyPasteDraft(payload);
      const draft = response.draft;
      if (draft?.draft_id) setActiveDraftId(draft.draft_id);
    } catch {
      // Autosave will retry shortly; applying AI should still feel instant.
    }
  }, [activeDraftId, draftPayload]);

  const runAiAssist = useCallback(async () => {
    const cleanBody = message.replace(/<[^>]+>/g, ' ').trim();
    if (!cleanBody) {
      toast.error('Write a message before using AI Assist.');
      return;
    }
    if (aiAction === 'translate' && !aiTargetLanguage.trim()) {
      toast.error('Enter a target language first.');
      return;
    }
    if (aiAction === 'custom' && !aiCustomInstruction.trim()) {
      toast.error('Tell AI what to do first.');
      return;
    }

    setAiLoading(true);
    setAiError('');
    try {
      const response = await assistVireSendEmail({
        action: aiAction,
        subject,
        message,
        custom_instruction: aiCustomInstruction,
        target_language: aiTargetLanguage,
        source: 'copy_paste_mode',
      });
      setAiPreview({
        subject: response.subject || subject,
        message: response.message || message,
      });
    } catch (error: any) {
      setAiError(error?.data?.message || error?.message || 'VireSend AI could not improve this message.');
    } finally {
      setAiLoading(false);
    }
  }, [aiAction, aiCustomInstruction, aiTargetLanguage, message, subject]);

  const applyAiPreview = useCallback(async () => {
    if (!aiPreview) return;
    setSubject(aiPreview.subject);
    setMessage(aiPreview.message);
    await persistCurrentDraft(aiPreview.subject, aiPreview.message);
    setAiPreview(null);
    setAiOpen(false);
    toast.success('AI version applied.');
  }, [aiPreview, persistCurrentDraft]);

  const loadGmailInbox = useCallback(async () => {
    setGmailLoading(true);
    setGmailError('');
    try {
      const response = await getGmailUnreadInbox();
      setGmailInbox(response.messages || []);
    } catch (error: any) {
      setGmailInbox([]);
      setGmailError(error?.data?.message || error?.message || 'Could not load Gmail inbox.');
    } finally {
      setGmailLoading(false);
    }
  }, []);

  const openGmailMessage = useCallback(async (messageId: string) => {
    setGmailMessageLoading(true);
    setGmailError('');
    setSelectedGmailMessage(null);
    setReplyBody('');
    try {
      const response = await getGmailMessage(messageId);
      setSelectedGmailMessage(response.message || null);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not open this email.');
    } finally {
      setGmailMessageLoading(false);
    }
  }, []);

  const sendReplyToGmailMessage = useCallback(async () => {
    if (!selectedGmailMessage) return;
    if (!replyBody.trim()) {
      toast.error('Write a reply first.');
      return;
    }
    setReplySending(true);
    try {
      await sendGmailReply({
        messageId: selectedGmailMessage.id,
        threadId: selectedGmailMessage.threadId,
        to: selectedGmailMessage.from,
        subject: selectedGmailMessage.subject,
        body: replyBody,
        inReplyTo: selectedGmailMessage.messageId,
        references: selectedGmailMessage.references || selectedGmailMessage.messageId,
      });
      toast.success('Reply sent.');
      setSelectedGmailMessage(null);
      setReplyBody('');
      loadGmailInbox();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not send reply.');
    } finally {
      setReplySending(false);
    }
  }, [loadGmailInbox, replyBody, selectedGmailMessage]);

  const loadChatSpaces = useCallback(async (quiet = false) => {
    if (!quiet) setChatLoading(true);
    setChatError('');
    try {
      const response = await getGoogleChatSpaces();
      const spaces = response.spaces || [];
      setChatSpaces(spaces);
      setSelectedChatSpace((current) => {
        if (!current) return spaces[0] || null;
        return spaces.find((space: GoogleChatSpace) => space.name === current.name) || current;
      });
    } catch (error: any) {
      setChatError(error?.data?.message || error?.message || 'Could not load Google Chat conversations.');
    } finally {
      if (!quiet) setChatLoading(false);
    }
  }, []);

  const loadChatStatus = useCallback(async () => {
    setChatLoading(true);
    setChatError('');
    try {
      const response = await getGoogleChatStatus();
      setChatConnected(Boolean(response.connected));
      setChatEmail(response.email || '');
      if (response.connected) {
        await loadChatSpaces(true);
      }
    } catch (error: any) {
      setChatError(error?.data?.message || error?.message || 'Could not check Google Chat status.');
    } finally {
      setChatLoading(false);
    }
  }, [loadChatSpaces]);

  const loadChatMessages = useCallback(async (spaceName: string, quiet = false) => {
    if (!spaceName) return;
    if (!quiet) setChatMessagesLoading(true);
    setChatError('');
    try {
      const response = await getGoogleChatMessages(spaceName);
      setChatMessages(response.messages || []);
    } catch (error: any) {
      setChatMessages([]);
      setChatError(error?.data?.message || error?.message || 'Could not load chat messages.');
    } finally {
      if (!quiet) setChatMessagesLoading(false);
    }
  }, []);

  const selectChatSpace = useCallback((space: GoogleChatSpace) => {
    setSelectedChatSpace(space);
    setChatMessages([]);
    loadChatMessages(space.name);
  }, [loadChatMessages]);

  const connectGoogleChat = useCallback(() => {
    window.location.href = getGoogleChatConnectUrl();
  }, []);

  const sendChatMessage = useCallback(async () => {
    if (!selectedChatSpace || !chatInput.trim()) return;
    setChatSending(true);
    try {
      await sendGoogleChatMessage(selectedChatSpace.name, { text: chatInput });
      setChatInput('');
      await loadChatMessages(selectedChatSpace.name, true);
      await loadChatSpaces(true);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Could not send Google Chat message.');
    } finally {
      setChatSending(false);
    }
  }, [chatInput, loadChatMessages, loadChatSpaces, selectedChatSpace]);

  const startNewGoogleChat = useCallback(async () => {
    if (!validEmail(newChatEmail.trim())) {
      toast.error('Enter a valid Gmail address.');
      return;
    }
    setNewChatLoading(true);
    try {
      const response = await startGoogleChat({ email: newChatEmail.trim() });
      const space = response.space || {
        id: response.spaceId,
        name: `spaces/${response.spaceId}`,
        displayName: response.displayName || newChatEmail.trim(),
        spaceType: 'DIRECT_MESSAGE',
        lastActiveTime: '',
      };
      setChatSpaces((current) => current.some((item) => item.name === space.name) ? current : [space, ...current]);
      setSelectedChatSpace(space);
      setNewChatOpen(false);
      setNewChatEmail('');
      await loadChatMessages(space.name, true);
    } catch (error: any) {
      toast.error(error?.data?.message || 'Unable to start a chat with this user. The user may not have Google Chat enabled or may not allow direct messages.');
    } finally {
      setNewChatLoading(false);
    }
  }, [loadChatMessages, newChatEmail]);

  const applyDraft = useCallback((draft: DraftRecord) => {
    const draftRecipients = Array.isArray(draft.recipients) ? draft.recipients : [];
    const settings = draft.settings || {};
    const savedStatuses = settings.emailStatuses && typeof settings.emailStatuses === 'object'
      ? settings.emailStatuses as Record<string, EmailStatus>
      : {};
    setActiveDraftId(draft.draft_id || draft.id || '');
    setSelectedAccountId(draft.account_id || '');
    setSelectedDomain(draft.selected_domain || '@gmail.com');
    setRecipients(draftRecipients);
    setEmailStatuses(Object.fromEntries(draftRecipients.map((email) => [email, savedStatuses[email] || 'draft' as EmailStatus])));
    setSubject(draft.subject || '');
    setMessage(draft.message || 'Hello,\n\n');
    setAutoPaste(Boolean(settings.autoPaste));
    setAutoAdd(Boolean(settings.autoAdd));
    setAutoSend(Boolean(settings.autoSend));
    setSendDelay(Number(settings.sendDelay || 0));
    setCustomDomain(String(settings.customDomain || ''));
    setTheme(settings.theme === 'dark' ? 'dark' : 'light');
    setAttachments([]);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [accountResponse, draftResponse] = await Promise.all([getEmailAccounts(), getCopyPasteDrafts()]);
        if (!mounted) return;
        const loadedAccounts = accountResponse.accounts || [];
        setAccounts(loadedAccounts);
        const latestDraft = draftResponse.drafts?.[0];
        if (latestDraft) {
          applyDraft(latestDraft);
          if (!latestDraft.account_id && loadedAccounts.length) {
            setSelectedAccountId(accountId(loadedAccounts.find((account: EmailAccount) => account.is_default) || loadedAccounts[0]));
          }
        } else if (loadedAccounts.length) {
          setSelectedAccountId(accountId(loadedAccounts.find((account: EmailAccount) => account.is_default) || loadedAccounts[0]));
        }
      } catch {
        toast.error('Could not load email accounts.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applyDraft]);

  useEffect(() => {
    loadGmailInbox();
  }, [loadGmailInbox]);

  useEffect(() => {
    loadChatStatus();
  }, [loadChatStatus]);

  useEffect(() => {
    if (!selectedChatSpace?.name) return undefined;
    loadChatMessages(selectedChatSpace.name);
    return undefined;
  }, [loadChatMessages, selectedChatSpace?.name]);

  useEffect(() => {
    if (!chatConnected) return undefined;
    const timer = window.setInterval(() => loadChatSpaces(true), 30000);
    return () => window.clearInterval(timer);
  }, [chatConnected, loadChatSpaces]);

  useEffect(() => {
    if (!chatConnected || !selectedChatSpace?.name) return undefined;
    const timer = window.setInterval(() => loadChatMessages(selectedChatSpace.name, true), 10000);
    return () => window.clearInterval(timer);
  }, [chatConnected, loadChatMessages, selectedChatSpace?.name]);

  useEffect(() => {
    if (loading) return undefined;
    if (!recipients.length && !subject.trim() && message === 'Hello,\n\n' && !attachments.length) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const payload = draftPayload();
        const response = activeDraftId
          ? await updateCopyPasteDraft(activeDraftId, payload)
          : await createCopyPasteDraft(payload);
        const draft = response.draft;
        if (draft?.draft_id) setActiveDraftId(draft.draft_id);
      } catch {
        // Autosave stays silent so the workspace remains focused.
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeDraftId, attachments.length, draftPayload, emailStatuses, loading, message, recipients.length, subject]);

  useEffect(() => {
    if (!autoPaste) return undefined;
    const onFocus = () => readClipboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [autoPaste, readClipboard]);

  useEffect(() => {
    if (!autoSend || autoSendingRef.current) return undefined;
    const pending = recipients.filter((email) => (emailStatuses[email] || 'draft') === 'draft');
    if (!pending.length) return undefined;
    if (!canSendNow(true)) return undefined;

    const timer = window.setTimeout(async () => {
      if (autoSendingRef.current) return;
      autoSendingRef.current = true;
      try {
        await sendRecipients(pending, false);
      } finally {
        autoSendingRef.current = false;
      }
    }, sendDelay * 1000);

    return () => window.clearTimeout(timer);
  }, [autoSend, canSendNow, emailStatuses, recipients, sendDelay, sendRecipients]);

  const handleFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const currentTotal = attachments.reduce((sum, file) => sum + file.size, 0);
    let nextTotal = currentTotal;
    const accepted: File[] = [];
    incoming.forEach((file) => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast.error(`${file.name} is larger than 10MB.`);
        return;
      }
      if (nextTotal + file.size > MAX_TOTAL_ATTACHMENT_SIZE) {
        toast.error('Total attachments cannot exceed 20MB.');
        return;
      }
      nextTotal += file.size;
      accepted.push(file);
    });
    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
  };

  async function startSend() {
    const pending = recipients.filter((email) => emailStatuses[email] !== 'sent' && emailStatuses[email] !== 'sending');
    if (!pending.length) {
      toast.error('Add at least one recipient.');
      return;
    }
    const result = await sendRecipients(pending, true);
    if (result.sent > 0) {
      setActiveEmailTab('sent');
    }
  }

  const finishAndViewLogs = () => {
    setProgress(initialProgress);
    navigate('/user/email-message-logs');
  };

  const toggleAutoSend = () => {
    if (!autoSend && !canSendNow(false)) return;
    if (!autoSend && !autoSendConfirmed) {
      const ok = window.confirm('Enable Auto Send? Any new valid email you add will send in the background.');
      if (!ok) return;
      setAutoSendConfirmed(true);
    }
    setAutoSend((value) => !value);
  };

  const resetEmailSections = async () => {
    setRecipients([]);
    setEmailStatuses({});
    setActiveEmailTab('draft');
    setRecipientInput('');
    lastClipboardRef.current = '';
    if (activeDraftId) {
      try {
        await updateCopyPasteDraft(activeDraftId, { ...draftPayload(), recipients: [] });
      } catch {
        // Keep reset instant even if draft persistence fails.
      }
    }
    toast.success('Email sections reset.');
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const percent = progress.total ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  if (!isEnabled('email_sender')) return <ServiceLockedOverlay serviceKey="email_sender" />;

  return (
    <div className={`cp-page ${theme}`}>
      <style>{`
        .cp-page{height:100vh;width:100%;max-width:100%;min-width:0;overflow:hidden;background:radial-gradient(circle at top left,rgba(77,124,254,.14),transparent 34%),radial-gradient(circle at bottom right,rgba(20,184,166,.12),transparent 32%),#eef3f9;color:#172033;padding:18px 22px 20px;display:grid;grid-template-columns:minmax(270px,320px) minmax(420px,1fr) minmax(300px,360px);grid-template-rows:72px 1fr 285px;gap:16px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .cp-panel{background:rgba(255,255,255,.88);border:1px solid rgba(203,213,225,.78);box-shadow:0 18px 45px rgba(31,41,55,.08);border-radius:24px;min-width:0}
        .cp-inbox{grid-row:1 / 4;min-height:0;padding:14px;display:flex;flex-direction:column;gap:12px}
        .cp-chat{grid-column:3;grid-row:1 / 4;min-height:0;padding:14px;display:flex;flex-direction:column;gap:12px}
        .cp-top,.cp-main,.cp-bottom{grid-column:2}
        .cp-top{display:grid;grid-template-columns:270px 1fr 92px 104px;gap:14px;align-items:center}
        .cp-account,.cp-preview{height:72px;padding:12px 14px;display:flex;align-items:center;gap:12px}
        .cp-avatar{height:42px;width:42px;border-radius:16px;background:linear-gradient(135deg,#dbeafe,#ccfbf1);display:grid;place-items:center;color:#2563eb;font-weight:800}
        .cp-avatar img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}
        .cp-small{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:800}
        .cp-strong{font-size:14px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cp-muted{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cp-main{display:grid;place-items:center;min-height:0}
        .cp-work{width:min(980px,100%);padding:26px;display:grid;gap:18px}
        .cp-paste-line{display:grid;grid-template-columns:minmax(320px,1fr) 180px 86px;gap:10px}
        .cp-input,.cp-select,.cp-textarea{width:100%;max-width:100%;min-width:0;box-sizing:border-box;border:1px solid #d7e0ec;background:#fff;border-radius:16px;padding:0 14px;height:48px;outline:none;color:#111827;font-size:14px}
        .cp-textarea{height:160px;padding:12px;resize:none;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
        .cp-input:focus,.cp-select:focus,.cp-textarea:focus{border-color:#7aa7ff;box-shadow:0 0 0 4px rgba(59,130,246,.12)}
        .cp-btn{border:0;border-radius:16px;height:48px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800;cursor:pointer;transition:.16s ease;background:#fff;color:#1e3a8a;border:1px solid #d8e3f3}
        .cp-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(15,23,42,.08)}
        .cp-btn:disabled{opacity:.6;cursor:not-allowed;transform:none;box-shadow:none}
        .cp-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
        .cp-btn.green{background:#10b981;color:#fff;border-color:#10b981}
        .cp-btn.ai{background:linear-gradient(135deg,#2563eb,#7c3aed);border-color:transparent;color:#fff;box-shadow:0 14px 30px rgba(79,70,229,.25)}
        .cp-btn.ghost{background:rgba(255,255,255,.72)}
        .cp-toggle-row{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
        .cp-toggle{height:38px;padding:0 13px;border-radius:999px;border:1px solid #dbe4f0;background:#fff;color:#475569;font-size:13px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}
        .cp-toggle.active{background:#e0f2fe;color:#075985;border-color:#93c5fd}
        .cp-bottom{display:grid;grid-template-columns:155px 1fr;gap:14px;min-height:0}
        .cp-inbox-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .cp-inbox-list{min-height:0;overflow:auto;display:grid;gap:9px;padding-right:2px}
        .cp-inbox-item{border:1px solid var(--cp-border,#e2e8f0);background:var(--cp-panel-solid,#fff);border-radius:16px;padding:11px;display:grid;gap:6px;text-align:left;color:inherit;cursor:pointer;transition:.16s ease}
        .cp-inbox-item:hover{transform:translateY(-1px);border-color:var(--cp-primary,#2563eb);box-shadow:0 12px 24px rgba(15,23,42,.08)}
        .cp-inbox-meta{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .cp-inbox-dot{height:8px;width:8px;border-radius:999px;background:#2563eb;flex:0 0 auto}
        .cp-inbox-snippet{font-size:12px;line-height:1.4;color:var(--cp-muted,#64748b);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
        .cp-empty{border:1px dashed var(--cp-border,#cbd5e1);border-radius:18px;padding:18px;text-align:center;color:var(--cp-muted,#64748b);font-size:13px;line-height:1.5}
        .cp-mail-body{border:1px solid var(--cp-border,#e2e8f0);border-radius:18px;background:var(--cp-soft,#f8fafc);padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.55;font-size:13px;color:var(--cp-strong,#0f172a);max-height:34vh;overflow:auto}
        .cp-chat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .cp-chat-status{height:9px;width:9px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.14);flex:0 0 auto;margin-top:4px}
        .cp-chat-status.on{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.16)}
        .cp-chat-search{height:40px;border-radius:14px;font-size:13px}
        .cp-chat-layout{min-height:0;display:grid;grid-template-rows:minmax(120px,32%) minmax(0,1fr);gap:10px;flex:1}
        .cp-chat-spaces{min-height:0;overflow:auto;display:grid;gap:8px;padding-right:2px}
        .cp-chat-space{border:1px solid var(--cp-border,#e2e8f0);background:var(--cp-panel-solid,#fff);border-radius:15px;padding:10px;text-align:left;display:grid;gap:5px;color:inherit;cursor:pointer}
        .cp-chat-space.active{border-color:var(--cp-primary,#2563eb);background:rgba(37,99,235,.08)}
        .cp-chat-window{min-height:0;border:1px solid var(--cp-border,#e2e8f0);border-radius:18px;background:var(--cp-panel-solid,#fff);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}
        .cp-chat-title{padding:12px;border-bottom:1px solid var(--cp-border,#e2e8f0);display:flex;align-items:center;gap:10px}
        .cp-chat-avatar{height:34px;width:34px;border-radius:12px;background:linear-gradient(135deg,#e0f2fe,#dcfce7);display:grid;place-items:center;color:#1d4ed8;font-weight:900;flex:0 0 auto;overflow:hidden}
        .cp-chat-avatar img{width:100%;height:100%;object-fit:cover}
        .cp-chat-messages{min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:9px;background:var(--cp-soft,#f8fafc)}
        .cp-chat-bubble{max-width:86%;border:1px solid var(--cp-border,#e2e8f0);background:var(--cp-panel-solid,#fff);border-radius:15px;padding:9px 10px;align-self:flex-start;box-shadow:0 8px 18px rgba(15,23,42,.05)}
        .cp-chat-bubble.mine{align-self:flex-end;background:linear-gradient(135deg,var(--cp-primary,#2563eb),var(--cp-primary-2,#1d4ed8));color:#fff;border-color:transparent}
        .cp-chat-bubble.mine .cp-muted{color:rgba(255,255,255,.78)}
        .cp-chat-text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-size:13px;line-height:1.45}
        .cp-chat-compose{padding:10px;border-top:1px solid var(--cp-border,#e2e8f0);display:grid;grid-template-columns:minmax(0,1fr) 42px;gap:8px}
        .cp-tabs{padding:12px;display:grid;align-content:start;gap:10px}
        .cp-tab{height:44px;border-radius:15px;border:1px solid transparent;background:#fff;color:#475569;display:flex;align-items:center;gap:9px;padding:0 12px;font-weight:800;font-size:13px}
        .cp-tab.active{background:#1d4ed8;color:#fff}
        .cp-list{padding:14px;min-height:0;display:flex;flex-direction:column}
        .cp-list-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .cp-recips{overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;padding-right:4px}
        .cp-chip{height:42px;border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:0 8px 0 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;color:#334155;font-size:13px}
        .cp-chip.sent{background:#dcfce7;border-color:#86efac;color:#166534}
        .cp-chip.sending{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}
        .cp-chip.failed{background:#fee2e2;border-color:#fca5a5;color:#991b1b}
        .cp-icon-btn{height:30px;width:30px;border-radius:10px;border:0;background:#f1f5f9;color:#64748b;display:grid;place-items:center;cursor:pointer}
        .cp-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.34);display:grid;place-items:center;z-index:50;padding:18px}
        .cp-settings-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.24);z-index:45}
        .cp-settings-drawer{position:fixed;left:18px;top:18px;bottom:18px;width:min(340px,calc(100vw - 36px));z-index:46;padding:18px;display:flex;flex-direction:column;gap:14px;animation:cpSlideIn .18s ease-out}
        .cp-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}
        .cp-switch{height:28px;width:50px;border-radius:999px;border:0;background:#cbd5e1;padding:3px;display:flex;justify-content:flex-start;cursor:pointer;transition:.16s ease}
        .cp-switch.active{background:#2563eb;justify-content:flex-end}
        .cp-switch span{height:22px;width:22px;border-radius:999px;background:#fff;box-shadow:0 2px 6px rgba(15,23,42,.18)}
        .cp-danger{background:#fff1f2;color:#be123c;border-color:#fecdd3}
        .cp-modal{width:min(920px,100%);max-width:100%;min-width:0;max-height:92vh;overflow:auto;background:#fff;border-radius:24px;border:1px solid #e2e8f0;box-shadow:0 25px 70px rgba(15,23,42,.25);padding:20px}
        .cp-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
        .cp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .cp-attach{border:1px dashed #b8c7dc;background:#f8fafc;border-radius:18px;padding:16px;text-align:center;color:#64748b}
        .cp-attach-list{display:grid;gap:8px;margin-top:10px}
        .cp-file{height:40px;border:1px solid #e2e8f0;border-radius:12px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:12px}
        .cp-progress-bar{height:10px;border-radius:999px;background:#e2e8f0;overflow:hidden}
        .cp-progress-fill{height:100%;background:#2563eb;border-radius:999px;transition:.2s ease}
        .cp-fly{position:fixed;left:50%;top:92px;transform:translateX(-50%);z-index:60;background:#fff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:999px;padding:10px 16px;box-shadow:0 18px 40px rgba(15,23,42,.16);font-weight:800;font-size:13px;animation:cpFly .85s ease forwards}
        .cp-ai-panel{margin-top:12px;padding:15px;border:1px solid rgba(147,197,253,.44);border-radius:22px;background:linear-gradient(145deg,rgba(37,99,235,.10),rgba(124,58,237,.075),rgba(255,255,255,.28));display:grid;gap:13px;box-shadow:0 18px 42px rgba(37,99,235,.10);animation:cpAiReveal .18s ease-out;overflow:hidden}
        .cp-ai-head{display:flex;align-items:flex-start;gap:10px}
        .cp-ai-mark{height:34px;width:34px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;box-shadow:0 12px 28px rgba(79,70,229,.30);flex-shrink:0}
        .cp-ai-options{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;margin-bottom:-4px;scrollbar-width:thin}
        .cp-ai-option{height:34px;border-radius:999px;border:1px solid rgba(148,163,184,.24);background:rgba(255,255,255,.72);color:var(--cp-primary-2,#1d4ed8);font-size:12px;font-weight:800;cursor:pointer;padding:0 14px;white-space:nowrap;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
        .cp-ai-option:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(37,99,235,.14)}
        .cp-ai-option.active{background:linear-gradient(135deg,#2563eb,#7c3aed);border-color:transparent;color:#fff;box-shadow:0 12px 26px rgba(79,70,229,.26)}
        .cp-ai-prompt{min-height:76px;height:76px;border-radius:18px;padding:12px 14px;resize:none}
        .cp-ai-preview{border:1px solid rgba(147,197,253,.36);border-radius:20px;background:rgba(255,255,255,.72);padding:13px;display:grid;gap:10px;box-shadow:0 14px 32px rgba(15,23,42,.08);animation:cpAiReveal .18s ease-out}
        .cp-ai-preview-box{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-height:150px;overflow:auto;border-radius:14px;background:var(--cp-soft,#f8fafc);padding:10px 11px;color:var(--cp-strong,#0f172a);font-size:13px;line-height:1.5}
        .cp-ai-error{border:1px solid #fecdd3;background:#fff1f2;color:#be123c;border-radius:14px;padding:10px;font-size:12px;font-weight:700}
        .cp-ai-loading{position:relative;overflow:hidden}
        .cp-ai-loading:before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.42),transparent);transform:translateX(-100%);animation:cpShimmer 1.2s infinite}
        .cp-page{--cp-bg:#eef3f9;--cp-bg-a:rgba(77,124,254,.14);--cp-bg-b:rgba(20,184,166,.12);--cp-panel:rgba(255,255,255,.9);--cp-panel-solid:#ffffff;--cp-border:rgba(203,213,225,.78);--cp-text:#172033;--cp-strong:#0f172a;--cp-muted:#64748b;--cp-input:#ffffff;--cp-focus:rgba(59,130,246,.14);--cp-primary:#2563eb;--cp-primary-2:#1d4ed8;--cp-success:#10b981;--cp-soft:#f8fafc;--cp-shadow:0 22px 55px rgba(31,41,55,.1)}
        .cp-page.dark{--cp-bg:#07111f;--cp-bg-a:rgba(37,99,235,.22);--cp-bg-b:rgba(16,185,129,.13);--cp-panel:rgba(15,23,42,.82);--cp-panel-solid:#101b2e;--cp-border:rgba(71,85,105,.72);--cp-text:#e5edf7;--cp-strong:#f8fafc;--cp-muted:#9fb0c7;--cp-input:#0b1628;--cp-focus:rgba(96,165,250,.2);--cp-primary:#60a5fa;--cp-primary-2:#2563eb;--cp-success:#34d399;--cp-soft:#0f1d31;--cp-shadow:0 24px 70px rgba(0,0,0,.34)}
        .cp-page{background:radial-gradient(circle at top left,var(--cp-bg-a),transparent 34%),radial-gradient(circle at bottom right,var(--cp-bg-b),transparent 32%),var(--cp-bg);color:var(--cp-text)}
        .cp-panel{background:var(--cp-panel);border-color:var(--cp-border);box-shadow:var(--cp-shadow);backdrop-filter:blur(18px)}
        .cp-strong{color:var(--cp-strong)}.cp-muted{color:var(--cp-muted)}.cp-small{color:var(--cp-muted)}
        .cp-input,.cp-select,.cp-textarea{background:var(--cp-input);border-color:var(--cp-border);color:var(--cp-strong)}
        .cp-input:focus,.cp-select:focus,.cp-textarea:focus{border-color:var(--cp-primary);box-shadow:0 0 0 4px var(--cp-focus)}
        .cp-btn{background:linear-gradient(180deg,var(--cp-panel-solid),var(--cp-soft));border-color:var(--cp-border);color:var(--cp-primary-2);box-shadow:0 10px 24px rgba(15,23,42,.06)}
        .cp-btn.primary{background:linear-gradient(135deg,var(--cp-primary),var(--cp-primary-2));border-color:transparent;color:#fff;box-shadow:0 14px 28px rgba(37,99,235,.26)}
        .cp-btn.green{background:linear-gradient(135deg,var(--cp-success),#059669);border-color:transparent;color:#fff;box-shadow:0 14px 28px rgba(16,185,129,.24)}
        .cp-btn.ghost{background:var(--cp-panel);color:var(--cp-primary)}
        .cp-btn:hover{transform:translateY(-2px);filter:saturate(1.06)}
        .cp-tab{background:var(--cp-panel-solid);color:var(--cp-muted);border-color:var(--cp-border)}
        .cp-tab.active{background:linear-gradient(135deg,var(--cp-primary-2),var(--cp-primary));color:#fff;box-shadow:0 12px 28px rgba(37,99,235,.24)}
        .cp-chip{background:var(--cp-panel-solid);border-color:var(--cp-border);color:var(--cp-strong)}
        .cp-icon-btn{background:var(--cp-soft);color:var(--cp-muted)}
        .cp-modal{background:var(--cp-panel-solid);border-color:var(--cp-border);color:var(--cp-text)}
        .cp-setting-row{background:var(--cp-panel-solid);border-color:var(--cp-border)}
        .cp-attach{background:var(--cp-soft);border-color:var(--cp-border);color:var(--cp-muted)}
        .cp-file{background:var(--cp-panel-solid);border-color:var(--cp-border);color:var(--cp-strong)}
        .cp-fly{background:var(--cp-panel-solid);border-color:var(--cp-primary);color:var(--cp-primary)}
        .cp-ai-panel{border-color:var(--cp-border);background:linear-gradient(145deg,rgba(37,99,235,.14),rgba(124,58,237,.08),rgba(255,255,255,.03))}
        .cp-page.dark .cp-ai-option{background:rgba(15,23,42,.72)}
        .cp-page.dark .cp-ai-preview{background:rgba(15,23,42,.64)}
        .cp-danger{background:linear-gradient(135deg,#fff1f2,#ffe4e6);color:#be123c;border-color:#fecdd3}
        .cp-page.dark .cp-danger{background:rgba(190,18,60,.16);color:#fecdd3;border-color:rgba(251,113,133,.38)}
        @keyframes cpFly{0%{opacity:0;transform:translate(-50%,-28px) scale(.96)}35%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,38px) scale(.98)}}
        @keyframes cpSlideIn{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
        @keyframes cpAiReveal{from{opacity:0;transform:translateY(-6px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes cpShimmer{100%{transform:translateX(100%)}}
        @media(max-width:1180px){.cp-page{grid-template-columns:minmax(250px,300px) minmax(0,1fr);grid-template-rows:72px minmax(360px,1fr) 285px minmax(520px,70vh)}.cp-chat{grid-column:1 / 3;grid-row:4}.cp-chat-layout{grid-template-columns:minmax(240px,32%) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}}
        @media(max-width:980px){.cp-page{overflow:auto;height:auto;min-height:100vh;grid-template-columns:1fr;grid-template-rows:auto auto auto auto auto}.cp-inbox,.cp-top,.cp-main,.cp-bottom,.cp-chat{grid-column:1;grid-row:auto}.cp-inbox{max-height:420px}.cp-chat{min-height:620px}.cp-chat-layout{grid-template-columns:1fr;grid-template-rows:220px minmax(360px,1fr)}.cp-top,.cp-paste-line,.cp-bottom,.cp-grid2{grid-template-columns:1fr}.cp-top{gap:10px}.cp-btn{width:100%}.cp-ai-options{flex-wrap:nowrap}.cp-ai-panel{padding:12px}.cp-ai-actions{display:grid!important;grid-template-columns:1fr;gap:8px}.cp-ai-actions .cp-btn{width:100%}}
      `}</style>
      {floatingPaste && <div className="cp-fly">{floatingPaste}</div>}

      <aside className="cp-panel cp-inbox">
        <div className="cp-inbox-head">
          <div style={{ minWidth: 0 }}>
            <div className="cp-small">Gmail inbox</div>
            <div className="cp-strong">Unread messages</div>
            <div className="cp-muted">Top 20 inbox emails</div>
          </div>
          <button className="cp-icon-btn" onClick={loadGmailInbox} disabled={gmailLoading} type="button" title="Refresh inbox">
            <RefreshCw size={15} className={gmailLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {gmailError && (
          <div className="cp-empty">
            {gmailError}
            <button className="cp-btn ghost" style={{ height: 34, marginTop: 10 }} onClick={() => navigate('/user/email-accounts')} type="button">
              Connect Gmail
            </button>
          </div>
        )}

        {!gmailError && gmailLoading && (
          <div className="cp-empty">
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            Loading unread mail...
          </div>
        )}

        {!gmailError && !gmailLoading && gmailInbox.length === 0 && (
          <div className="cp-empty">No unread inbox messages right now.</div>
        )}

        {!gmailError && gmailInbox.length > 0 && (
          <div className="cp-inbox-list">
            {gmailInbox.map((item) => (
              <button className="cp-inbox-item" key={item.id} onClick={() => openGmailMessage(item.id)} type="button">
                <div className="cp-inbox-meta">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {item.unread && <span className="cp-inbox-dot" />}
                    <span className="cp-strong">{senderLabel(item.from)}</span>
                  </div>
                  <span className="cp-muted" style={{ flex: '0 0 auto' }}>{formatInboxTime(item.date)}</span>
                </div>
                <div className="cp-muted" style={{ fontWeight: 800 }}>{item.subject || '(No subject)'}</div>
                <div className="cp-inbox-snippet">{item.snippet || 'No preview available.'}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <aside className="cp-panel cp-chat">
        <div className="cp-chat-head">
          <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
            <span className={`cp-chat-status ${chatConnected ? 'on' : ''}`} />
            <div style={{ minWidth: 0 }}>
              <div className="cp-small">Google Chat</div>
              <div className="cp-strong">{chatConnected ? 'Connected' : 'Not connected'}</div>
              <div className="cp-muted">{chatEmail || 'Connect your Chat account'}</div>
            </div>
          </div>
          <button className="cp-icon-btn" onClick={() => (chatConnected ? loadChatSpaces(false) : loadChatStatus())} disabled={chatLoading} type="button" title="Refresh Google Chat">
            <RefreshCw size={15} className={chatLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {!chatConnected ? (
          <div className="cp-empty">
            <MessageCircle size={22} style={{ margin: '0 auto 8px' }} />
            Connect Google Chat to view conversations and send messages.
            {chatError && <div style={{ marginTop: 8 }}>{chatError}</div>}
            <button className="cp-btn primary" style={{ height: 40, marginTop: 12 }} onClick={connectGoogleChat} type="button">
              <MessageCircle size={16} /> Connect Google Chat
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <input
                className="cp-input cp-chat-search"
                value={chatSearch}
                onChange={(event) => setChatSearch(event.target.value)}
                placeholder="Search conversations..."
              />
              <button className="cp-btn ghost" style={{ height: 40, padding: '0 12px' }} onClick={() => setNewChatOpen(true)} type="button">
                <Plus size={15} /> New Chat
              </button>
            </div>

            {chatError && <div className="cp-ai-error">{chatError}</div>}

            <div className="cp-chat-layout">
              <div className="cp-chat-spaces">
                {chatLoading && (
                  <div className="cp-empty">
                    <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    Loading conversations...
                  </div>
                )}
                {!chatLoading && filteredChatSpaces.length === 0 && (
                  <div className="cp-empty">No Google Chat conversations found.</div>
                )}
                {!chatLoading && filteredChatSpaces.map((space) => (
                  <button
                    className={`cp-chat-space ${selectedChatSpace?.name === space.name ? 'active' : ''}`}
                    key={space.name}
                    onClick={() => selectChatSpace(space)}
                    type="button"
                  >
                    <div className="cp-strong">{space.displayName || 'Conversation'}</div>
                    <div className="cp-muted">{space.spaceType || 'Chat'} {formatInboxTime(space.lastActiveTime)}</div>
                  </button>
                ))}
              </div>

              <div className="cp-chat-window">
                <div className="cp-chat-title">
                  <div className="cp-chat-avatar">
                    {selectedChatSpace?.displayName?.charAt(0)?.toUpperCase() || <MessageCircle size={17} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cp-strong">{selectedChatSpace?.displayName || 'Select a conversation'}</div>
                    <div className="cp-muted">{selectedChatSpace ? 'Online status unavailable' : 'Choose a chat from the list'}</div>
                  </div>
                </div>
                <div className="cp-chat-messages">
                  {chatMessagesLoading && (
                    <div className="cp-empty">
                      <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      Loading messages...
                    </div>
                  )}
                  {!chatMessagesLoading && selectedChatSpace && chatMessages.length === 0 && (
                    <div className="cp-empty">No messages in this conversation yet.</div>
                  )}
                  {!chatMessagesLoading && !selectedChatSpace && (
                    <div className="cp-empty">Select a conversation to open the chat window.</div>
                  )}
                  {!chatMessagesLoading && chatMessages.map((item) => (
                    <div className={`cp-chat-bubble ${item.isMine ? 'mine' : ''}`} key={item.id || `${item.createTime}-${item.text}`}>
                      <div className="cp-chat-text">{item.text || '(No text)'}</div>
                      <div className="cp-muted" style={{ marginTop: 4 }}>{item.senderName} - {formatInboxTime(item.createTime)}</div>
                    </div>
                  ))}
                </div>
                <div className="cp-chat-compose">
                  <input
                    className="cp-input"
                    style={{ height: 42, borderRadius: 14 }}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    disabled={!selectedChatSpace || chatSending}
                    placeholder="Type a message..."
                  />
                  <button className="cp-icon-btn" style={{ height: 42, width: 42 }} onClick={sendChatMessage} disabled={!selectedChatSpace || chatSending || !chatInput.trim()} type="button" title="Send message">
                    {chatSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      <section className="cp-top">
        <button className="cp-panel cp-account" onClick={() => setAccountModal(true)} type="button">
          <div className="cp-avatar">
            <img
              src={ACCOUNT_AVATAR_URL}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div className="cp-small">Sending account</div>
            <div className="cp-strong">{accountEmail(selectedAccount) || (loading ? 'Loading accounts...' : 'Select account')}</div>
            <div className="cp-muted">{selectedAccount?.provider || 'Gmail / SMTP'}</div>
          </div>
        </button>

        <div className="cp-panel cp-preview">
          <Mail size={20} color="#2563eb" />
          <div style={{ minWidth: 0 }}>
            <div className="cp-small">{subject || 'No subject'}</div>
            <div className="cp-muted">{previewText}</div>
          </div>
        </div>

        <button className="cp-btn ghost" onClick={() => setEditorOpen(true)} type="button">
          <Edit3 size={16} /> Edit
        </button>
        <button className="cp-btn primary" onClick={() => startSend()} type="button">
          <Send size={16} /> Send
        </button>
      </section>

      <main className="cp-main">
        <div className="cp-panel cp-work">
          <div className="cp-paste-line">
            <input
              className="cp-input"
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              onPaste={(event) => {
                const text = event.clipboardData.getData('text').trim();
                if (isPasteCandidate(text)) {
                  setFloatingPaste(text);
                  window.setTimeout(() => setFloatingPaste(''), 900);
                  if (autoAdd) {
                    event.preventDefault();
                    addRecipient(text);
                  }
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addRecipient();
              }}
              placeholder="Paste username or full email"
            />
            <select className="cp-select" value={selectedDomain} onChange={(event) => setSelectedDomain(event.target.value)}>
              {DEFAULT_DOMAINS.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
              <option value="custom">Custom domain</option>
            </select>
            <button className="cp-btn green" onClick={() => addRecipient()} type="button"><Plus size={16} /> Add</button>
          </div>
          {selectedDomain === 'custom' && (
            <input className="cp-input" value={customDomain} onChange={(event) => setCustomDomain(event.target.value)} placeholder="@yourdomain.com" />
          )}
        </div>
      </main>

      <section className="cp-bottom">
        <aside className="cp-panel cp-tabs">
          <button className="cp-tab" type="button"><Mail size={16} /> Emails</button>
          <button className={`cp-tab ${activeEmailTab === 'draft' ? 'active' : ''}`} onClick={() => setActiveEmailTab('draft')} type="button">
            <FileText size={16} /> Draft ({draftCount})
          </button>
          <button className={`cp-tab ${activeEmailTab === 'sent' ? 'active' : ''}`} onClick={() => setActiveEmailTab('sent')} type="button">
            <Check size={16} /> Sent ({sentCount})
          </button>
          <button className="cp-tab" onClick={() => setSettingsOpen(true)} type="button"><Settings size={16} /> Settings</button>
          <button className="cp-tab" onClick={() => navigate('/user/email-sender')} type="button"><ArrowLeft size={16} /> Back</button>
        </aside>
        <div className="cp-panel cp-list">
          <div className="cp-list-head">
            <div>
              <div className="cp-strong">Recipients</div>
              <div className="cp-muted">{draftCount} draft, {sentCount} sent. Duplicates are skipped automatically.</div>
            </div>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
              <button className="cp-btn primary" style={{ height: 34, minWidth: 132, pointerEvents: 'none' }} type="button">
                Total Emails: {recipients.length}
              </button>
              <button
                className="cp-btn ghost"
                style={{ height: 38 }}
                onClick={() => {
                  setRecipients([]);
                  setEmailStatuses({});
                }}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="cp-recips">
            {visibleRecipients.length === 0 ? (
              <div className="cp-muted">Paste usernames like cytech73, select a domain, then Add.</div>
            ) : visibleRecipients.map((email) => (
              <div className={`cp-chip ${emailStatuses[email] || 'draft'}`} key={email}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{emailStatuses[email] || 'draft'}</span>
                  <button
                    className="cp-icon-btn"
                    onClick={() => {
                      setRecipients((items) => items.filter((item) => item !== email));
                      setEmailStatuses((current) => {
                        const next = { ...current };
                        delete next[email];
                        return next;
                      });
                    }}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {(gmailMessageLoading || selectedGmailMessage) && (
        <div className="cp-modal-backdrop">
          <div className="cp-modal">
            <div className="cp-modal-head">
              <div style={{ minWidth: 0 }}>
                <h2 className="cp-strong">{selectedGmailMessage?.subject || 'Opening email...'}</h2>
                <div className="cp-muted">
                  {selectedGmailMessage ? `${senderLabel(selectedGmailMessage.from)} - ${formatInboxTime(selectedGmailMessage.date)}` : 'Fetching Gmail message'}
                </div>
              </div>
              <button
                className="cp-icon-btn"
                onClick={() => {
                  setSelectedGmailMessage(null);
                  setGmailMessageLoading(false);
                }}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {gmailMessageLoading && (
              <div className="cp-empty">
                <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Loading message...
              </div>
            )}

            {selectedGmailMessage && !gmailMessageLoading && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="cp-grid2">
                  <div>
                    <div className="cp-small">From</div>
                    <div className="cp-strong">{selectedGmailMessage.from}</div>
                  </div>
                  <div>
                    <div className="cp-small">To</div>
                    <div className="cp-strong">{selectedGmailMessage.to || 'Me'}</div>
                  </div>
                </div>
                <div className="cp-mail-body">{selectedGmailMessage.body || selectedGmailMessage.snippet || 'No body content available.'}</div>
                <div>
                  <div className="cp-small" style={{ marginBottom: 8 }}>Reply</div>
                  <textarea
                    className="cp-textarea"
                    style={{ height: 120 }}
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Write your reply..."
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <button className="cp-btn ghost" onClick={() => setSelectedGmailMessage(null)} type="button"><X size={16} /> Close</button>
                  <button className="cp-btn primary" onClick={sendReplyToGmailMessage} disabled={replySending} type="button">
                    {replySending ? <Loader2 size={16} className="animate-spin" /> : <Reply size={16} />}
                    Send Reply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {newChatOpen && (
        <div className="cp-modal-backdrop">
          <div className="cp-modal" style={{ maxWidth: 480 }}>
            <div className="cp-modal-head">
              <div>
                <h2 className="cp-strong">New Chat (Beta)</h2>
                <div className="cp-muted">Start a direct message with a Gmail address.</div>
              </div>
              <button className="cp-icon-btn" onClick={() => setNewChatOpen(false)} type="button"><X size={16} /></button>
            </div>
            <div className="cp-small" style={{ marginBottom: 8 }}>Gmail address</div>
            <input
              className="cp-input"
              value={newChatEmail}
              onChange={(event) => setNewChatEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') startNewGoogleChat();
              }}
              placeholder="john@gmail.com"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="cp-btn ghost" onClick={() => setNewChatOpen(false)} type="button"><X size={16} /> Cancel</button>
              <button className="cp-btn primary" onClick={startNewGoogleChat} disabled={newChatLoading} type="button">
                {newChatLoading ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                {newChatLoading ? 'Creating chat...' : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <>
          <div className="cp-settings-backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="cp-panel cp-settings-drawer">
            <div className="cp-modal-head">
              <div>
                <h2 className="cp-strong">Copy & Paste settings</h2>
                <div className="cp-muted">Control paste, add, and background sending.</div>
              </div>
              <button className="cp-icon-btn" onClick={() => setSettingsOpen(false)} type="button"><X size={16} /></button>
            </div>

            <div className="cp-setting-row">
              <div>
                <div className="cp-strong">Auto Paste</div>
                <div className="cp-muted">Reads new clipboard text when you return.</div>
              </div>
              <button className={`cp-switch ${autoPaste ? 'active' : ''}`} onClick={() => setAutoPaste((value) => !value)} type="button"><span /></button>
            </div>

            <div className="cp-setting-row">
              <div>
                <div className="cp-strong">Auto Add</div>
                <div className="cp-muted">Adds valid pasted emails automatically.</div>
              </div>
              <button className={`cp-switch ${autoAdd ? 'active' : ''}`} onClick={() => setAutoAdd((value) => !value)} type="button"><span /></button>
            </div>

            <div className="cp-setting-row">
              <div>
                <div className="cp-strong">Auto Send</div>
                <div className="cp-muted">New emails send in the background.</div>
              </div>
              <button className={`cp-switch ${autoSend ? 'active' : ''}`} onClick={toggleAutoSend} type="button"><span /></button>
            </div>

            <div>
              <div className="cp-small" style={{ marginBottom: 8 }}>Appearance</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  className={`cp-btn ${theme === 'light' ? 'primary' : 'ghost'}`}
                  style={{ height: 42 }}
                  onClick={() => setTheme('light')}
                  type="button"
                >
                  <Sun size={16} /> Light
                </button>
                <button
                  className={`cp-btn ${theme === 'dark' ? 'primary' : 'ghost'}`}
                  style={{ height: 42 }}
                  onClick={() => setTheme('dark')}
                  type="button"
                >
                  <Moon size={16} /> Dark
                </button>
              </div>
            </div>

            <div>
              <div className="cp-small" style={{ marginBottom: 8 }}>Auto send delay</div>
              <select className="cp-select" style={{ width: '100%' }} value={sendDelay} onChange={(event) => setSendDelay(Number(event.target.value))}>
                <option value={0}>Send immediately</option>
                <option value={5}>Send every 5 sec</option>
                <option value={10}>Send every 10 sec</option>
                <option value={30}>Send every 30 sec</option>
              </select>
            </div>

            <button className="cp-btn cp-danger" onClick={resetEmailSections} type="button">
              <Trash2 size={16} /> Reset Sent & Draft
            </button>
          </div>
        </>
      )}

      {accountModal && (
        <div className="cp-modal-backdrop">
          <div className="cp-modal" style={{ maxWidth: 560 }}>
            <div className="cp-modal-head">
              <h2 className="cp-strong">Choose sending account</h2>
              <button className="cp-icon-btn" onClick={() => setAccountModal(false)} type="button"><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {accounts.map((account) => (
                <button
                  key={accountId(account)}
                  className="cp-btn ghost"
                  style={{ justifyContent: 'flex-start', height: 56 }}
                  onClick={() => {
                    setSelectedAccountId(accountId(account));
                    setAccountModal(false);
                  }}
                  type="button"
                >
                  <div className="cp-avatar" style={{ height: 34, width: 34, borderRadius: 12 }}>
                    <img
                      src={ACCOUNT_AVATAR_URL}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  <span>{accountEmail(account)} ({account.provider || 'email'})</span>
                </button>
              ))}
              <button className="cp-btn primary" onClick={() => navigate('/user/email-accounts')} type="button"><Plus size={16} /> Add Account</button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="cp-modal-backdrop">
          <div className="cp-modal">
            <div className="cp-modal-head">
              <div>
                <h2 className="cp-strong">Edit message</h2>
                <div className="cp-muted">Compose once, then send one by one to your recipient list.</div>
              </div>
              <button className="cp-icon-btn" onClick={() => setEditorOpen(false)} type="button"><X size={16} /></button>
            </div>
            <div className="cp-small" style={{ marginBottom: 8 }}>Subject</div>
            <input className="cp-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
            <div style={{ height: 12 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div className="cp-small">Message</div>
              <button
                className="cp-btn ai"
                style={{ height: 38 }}
                onClick={() => {
                  setAiOpen((value) => !value);
                  setAiError('');
                }}
                disabled={aiLoading}
                type="button"
              >
                {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                AI Assist
              </button>
            </div>
            <textarea className="cp-textarea" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your email message..." />
            {aiOpen && (
              <div className="cp-ai-panel">
                <div className="cp-ai-head">
                  <div className="cp-ai-mark"><Sparkles size={17} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cp-strong">VireSend AI</div>
                    <div className="cp-muted">Rewrite, translate, improve tone, and polish your message instantly.</div>
                  </div>
                </div>
                <div className="cp-ai-options">
                  {AI_ACTIONS.map((option) => (
                    <button
                      key={option.action}
                      className={`cp-ai-option ${aiAction === option.action ? 'active' : ''}`}
                      onClick={() => {
                        setAiAction(option.action);
                        setAiPreview(null);
                        setAiError('');
                        if (option.action !== 'translate') setAiTargetLanguage('');
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="cp-textarea cp-ai-prompt"
                  value={aiPromptValue}
                  onChange={(event) => {
                    if (aiAction === 'translate') setAiTargetLanguage(event.target.value);
                    else setAiCustomInstruction(event.target.value);
                  }}
                  placeholder={aiPromptPlaceholder(aiAction)}
                />
                {aiLoading && (
                  <div className="cp-ai-preview cp-ai-loading" style={{ alignItems: 'center', justifyItems: 'center', minHeight: 92 }}>
                    <Loader2 size={22} className="animate-spin" color="#2563eb" />
                    <div className="cp-strong">Improving message...</div>
                  </div>
                )}
                {aiError && (
                  <div className="cp-ai-error">
                    {aiError}
                    <button className="cp-btn ghost" style={{ height: 32, marginLeft: 10 }} onClick={runAiAssist} type="button">Retry</button>
                  </div>
                )}
                {aiPreview && !aiLoading && (
                  <div className="cp-ai-preview">
                    <div>
                      <div className="cp-strong">VireSend AI preview</div>
                      <div className="cp-muted">Review the improved version before replacing your draft.</div>
                    </div>
                    <div>
                      <div className="cp-small">Subject</div>
                      <div className="cp-ai-preview-box">{aiPreview.subject || 'No subject'}</div>
                    </div>
                    <div>
                      <div className="cp-small">Message</div>
                      <div className="cp-ai-preview-box">{aiPreview.message}</div>
                    </div>
                    <div className="cp-ai-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      <button className="cp-btn ghost" style={{ height: 38 }} onClick={() => setAiPreview(null)} type="button"><X size={15} /> Keep Original</button>
                      <button className="cp-btn ghost" style={{ height: 38 }} onClick={runAiAssist} type="button"><Sparkles size={15} /> Regenerate</button>
                      <button className="cp-btn ai" style={{ height: 38 }} onClick={applyAiPreview} type="button"><Check size={15} /> Apply Changes</button>
                    </div>
                  </div>
                )}
                {!aiPreview && !aiLoading && (
                  <div className="cp-ai-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="cp-btn ghost" style={{ height: 38 }} onClick={() => setAiOpen(false)} type="button">Cancel</button>
                    <button className="cp-btn ai" style={{ height: 38 }} onClick={runAiAssist} type="button"><Sparkles size={15} /> Improve</button>
                  </div>
                )}
              </div>
            )}
            <div className="cp-attach" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              <Paperclip size={18} style={{ margin: '0 auto 8px' }} />
              <div>Drag files here or attach files like Gmail compose.</div>
              <button className="cp-btn ghost" style={{ height: 38, marginTop: 10 }} onClick={() => fileInputRef.current?.click()} type="button">
                <Paperclip size={15} /> Attach File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_ATTACHMENTS}
                hidden
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  if (event.target.files) handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>
            <div className="cp-attach-list">
              {attachments.map((file) => {
                const Icon = fileIcon(file.type);
                return (
                  <div className="cp-file" key={`${file.name}-${file.size}`}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon size={14} /> {file.name} ({formatSize(file.size)})</span>
                    <button className="cp-icon-btn" onClick={() => setAttachments((items) => items.filter((item) => item !== file))} type="button"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="cp-btn primary" onClick={() => setEditorOpen(false)} type="button"><Check size={16} /> Done</button>
            </div>
          </div>
        </div>
      )}

      {progress.open && (
        <div className="cp-modal-backdrop">
          <div className="cp-modal" style={{ maxWidth: 520 }}>
            <div className="cp-modal-head">
              <div>
                <h2 className="cp-strong">{progress.done ? 'Sending complete' : 'Sending emails'}</h2>
                <div className="cp-muted">{progress.current || 'All recipients processed.'}</div>
              </div>
              <Clock size={20} color="#2563eb" />
            </div>
            <div className="cp-progress-bar"><div className="cp-progress-fill" style={{ width: `${percent}%` }} /></div>
            <div className="cp-grid2" style={{ marginTop: 16 }}>
              <div className="cp-panel" style={{ padding: 14 }}><div className="cp-small">Sent</div><div className="cp-strong">{progress.sent}</div></div>
              <div className="cp-panel" style={{ padding: 14 }}><div className="cp-small">Failed</div><div className="cp-strong">{progress.failed}</div></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              {!progress.done ? (
                <button className="cp-btn ghost" onClick={() => { cancelRef.current = true; }} type="button"><X size={16} /> Cancel</button>
              ) : (
                <button className="cp-btn primary" onClick={finishAndViewLogs} type="button"><Mail size={16} /> View Logs</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
