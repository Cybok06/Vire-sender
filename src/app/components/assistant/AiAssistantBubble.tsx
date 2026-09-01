import { useEffect, useRef, useState } from 'react';
import { Loader2, Minimize2, Plus, Send, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  confirmAiDraft,
  createAiConversation,
  getAiAssistantStatus,
  getAiConversation,
  getAiConversations,
  postAiConversationMessage,
  updateAiDraft,
  cancelAiDraft,
} from '../../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext';
import { AiResultCard, DiscoveryTooltip, EmailCampaignPreviewCard, MessageDraftCard, SmsCampaignPreviewCard } from './AiAssistantCards';
import {
  DISCOVERY_DISMISSED_AT_KEY,
  DISCOVERY_SEEN_KEY,
  DISCOVERY_SESSION_KEY,
  QUICK_ACTIONS,
  shouldShowDiscovery,
} from './assistantUi.js';

type AiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'action';
  content: string;
  structured_data?: Record<string, any>;
  created_at?: string | null;
};

type AiConversation = {
  id: string;
  title: string;
  status: string;
  updated_at?: string | null;
};

type ConversationState = {
  selected_mode?: AssistantMode;
  state?: string;
  active_draft_id?: string | null;
  pending_action_id?: string | null;
  channel?: string | null;
  recipient_type?: string | null;
  recipient_count?: number;
};

type AssistantMode = 'direct_sms' | 'group_sms' | 'direct_email' | 'group_email' | 'general_assistant';
const MODE_OPTIONS: Array<{ value: AssistantMode; label: string }> = [
  { value: 'direct_sms', label: 'Direct SMS' },
  { value: 'group_sms', label: 'Group SMS' },
  { value: 'direct_email', label: 'Direct Email' },
  { value: 'group_email', label: 'Group Email' },
  { value: 'general_assistant', label: 'General' },
];
const OPEN_KEY = 'viresend_ai_open';
const CARD_KINDS = new Set(['message_draft', 'preview_sms', 'preview_email', 'campaign_result', 'error', 'sender_selection', 'email_account_selection']);

function CampaignStatusCard({ data }: { data: Record<string, any> }) {
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  if (!campaigns.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <div className="text-slate-900 font-semibold">Recent Campaigns</div>
      <div className="mt-3 space-y-2">
        {campaigns.map((item: any) => (
          <div key={`${item.channel}-${item.id}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="break-words text-slate-800 font-semibold">{item.name || 'Campaign'}</div>
            <div className="mt-1 text-xs text-slate-500">{String(item.channel || '').toUpperCase()} • {item.status} • {item.recipients} recipients</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiAssistantBubble() {
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(localStorage.getItem(OPEN_KEY) === '1');
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [selectedMode, setSelectedMode] = useState<AssistantMode>('general_assistant');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string>('');
  const [editContext, setEditContext] = useState<{ draftId: string; field: 'message' | 'contact_group_name' | 'sender_id' | 'email_account_id' } | null>(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    if (open) {
      setShowDiscovery(false);
      sessionStorage.setItem(DISCOVERY_SESSION_KEY, '1');
      localStorage.setItem(DISCOVERY_SEEN_KEY, '1');
    }
  }, [open]);

  const sessionKey = user?.id ? `viresend_ai_active_conversation:${user.id}` : '';

  useEffect(() => {
    if (sessionKey && conversationId) sessionStorage.setItem(sessionKey, conversationId);
  }, [conversationId, sessionKey]);

  useEffect(() => {
    if (!user || user.role !== 'user') return;
    const load = async () => {
      try {
        setLoading(true);
        const status = await getAiAssistantStatus();
        if (!status.enabled) {
          setEnabled(false);
          return;
        }
        setEnabled(true);
        const list = await getAiConversations();
        const items = list.conversations || [];
        setConversations(items);
        const sessionId = sessionKey ? sessionStorage.getItem(sessionKey) || '' : '';
        const nextId = sessionId && items.some((item: AiConversation) => item.id === sessionId) ? sessionId : '';
        if (nextId) {
          setConversationId(nextId);
          const detail = await getAiConversation(nextId);
          setMessages(detail.messages || []);
          setConversationState(detail.conversation_state || {});
          setSelectedMode(detail.conversation_state?.selected_mode || 'general_assistant');
        } else {
          const created = await createAiConversation({ title: 'New Conversation', selected_mode: 'general_assistant' });
          setConversationId(created.conversation.id);
          setConversations([created.conversation]);
          setMessages(created.welcome_message ? [created.welcome_message] : []);
          setConversationState(created.conversation_state || { state: 'idle', selected_mode: 'general_assistant' });
        }
      } catch (error: any) {
        if (error?.status !== 403) {
          toast.error(error?.data?.message || error?.message || 'Unable to load VireSend AI.');
        }
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  useEffect(() => {
    if (!enabled || open) return;
    const shouldDisplay = shouldShowDiscovery({
      seen: localStorage.getItem(DISCOVERY_SEEN_KEY) === '1',
      dismissedAt: Number(localStorage.getItem(DISCOVERY_DISMISSED_AT_KEY) || 0),
      sessionSeen: sessionStorage.getItem(DISCOVERY_SESSION_KEY) === '1',
    });
    if (!shouldDisplay) return;
    const showTimer = window.setTimeout(() => setShowDiscovery(true), 2400);
    const hideTimer = window.setTimeout(() => setShowDiscovery(false), 11000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [enabled, open, conversationId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const dismissDiscovery = () => {
    setShowDiscovery(false);
    sessionStorage.setItem(DISCOVERY_SESSION_KEY, '1');
    localStorage.setItem(DISCOVERY_DISMISSED_AT_KEY, String(Date.now()));
    localStorage.setItem(DISCOVERY_SEEN_KEY, '1');
  };

  const reloadConversation = async (targetId: string) => {
    const detail = await getAiConversation(targetId);
    setMessages(detail.messages || []);
    setConversationState(detail.conversation_state || {});
    setSelectedMode(detail.conversation_state?.selected_mode || 'general_assistant');
  };

  const startNewConversation = async () => {
    if ((conversationState.pending_action_id || input.trim()) && !window.confirm('Start a new chat? The current unsent draft will be left behind.')) return;
    try {
      setActionLoading('new');
      const response = await createAiConversation({ title: 'New Conversation', selected_mode: selectedMode });
      setConversations(prev => [response.conversation, ...prev]);
      setConversationId(response.conversation.id);
      setMessages(response.welcome_message ? [response.welcome_message] : []);
      setConversationState(response.conversation_state || { state: 'idle' });
      setInput('');
      setEditContext(null);
      setOpen(true);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to start a new conversation.');
    } finally {
      setActionLoading('');
    }
  };

  const sendMessage = async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || !conversationId || sending) return;
    const sequence = ++requestSequenceRef.current;
    try {
      setSending(true);
      setInput('');
      if (editContext) {
        const response = await updateAiDraft(editContext.draftId, { [editContext.field]: trimmed });
        setMessages(prev => [...prev, {
          id: `local-edit-${Date.now()}`,
          role: 'user',
          content: trimmed,
          created_at: new Date().toISOString(),
        }, response.assistant_message].filter(Boolean));
        setEditContext(null);
        return;
      }
      const response = await postAiConversationMessage(conversationId, {
        message: trimmed,
        client_message_id: `web-${Date.now()}-${sequence}`,
        active_draft_id: conversationState.active_draft_id || null,
        pending_action_id: conversationState.pending_action_id || null,
        selected_mode: selectedMode,
      });
      if (sequence !== requestSequenceRef.current) return;
      setMessages(prev => [...prev, response.user_message, response.assistant_message].filter(Boolean));
      setConversationState(response.conversation_state || {});
      setSelectedMode(response.conversation_state?.selected_mode || selectedMode);
      if (response.conversation) {
        setConversations(prev => {
          const next = prev.filter(item => item.id !== response.conversation.id);
          return [response.conversation, ...next];
        });
      }
    } catch (error: any) {
      const message = error?.data?.assistant_message?.content || error?.data?.message || error?.message || 'VireSend AI could not process that request.';
      setMessages(prev => [...prev, {
        id: `local-error-${Date.now()}`,
        role: 'assistant',
        content: message,
        structured_data: { kind: 'error', title: error?.data?.error?.code === 'AI_WORKFLOW_ERROR' ? 'Request Could Not Be Prepared' : 'Connection Error', message },
      }]);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (message: AiMessage, option: any, confirmToken?: string) => {
    const data = message.structured_data || {};
    const draftId = data.draft_id;
    const key = `${message.id}:${option?.action || 'confirm'}:${option?.value || ''}`;
    try {
      setActionLoading(key);
      if (option?.action === 'prefill_input') {
        setInput(option.prompt || '');
        if (draftId && option.field) setEditContext({ draftId, field: option.field });
        window.setTimeout(() => textAreaRef.current?.focus(), 0);
        return;
      }
      if (option?.action === 'select_group') {
        const response = await updateAiDraft(draftId, { contact_group_name: option.value });
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
      } else if (option?.action === 'set_channel') {
        const response = await updateAiDraft(draftId, { channel: option.value });
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
      } else if (option?.action === 'set_recipient_type') {
        const response = await updateAiDraft(draftId, { recipient_type: option.value });
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
      } else if (option?.action === 'select_sender_id') {
        const response = await updateAiDraft(draftId, { sender_id: option.value });
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
      } else if (option?.action === 'select_email_account') {
        const response = await updateAiDraft(draftId, { email_account_id: option.value });
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
      } else if (option?.action === 'cancel_draft') {
        const response = await cancelAiDraft(draftId);
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
      } else if (option?.action === 'choose_group') {
        navigate('/user/contacts');
      } else if (option?.action === 'confirm_send') {
        const response = await confirmAiDraft(draftId, { confirmation_token: confirmToken });
        setMessages(prev => [...prev, response.assistant_message].filter(Boolean));
        const balance = response.campaign?.wallet_balance;
        if (typeof balance === 'number') updateBalance(balance);
      } else if (option?.prompt) {
        setInput(option.prompt);
        window.setTimeout(() => textAreaRef.current?.focus(), 0);
      } else if (option?.url) {
        navigate(option.url);
      }
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Action failed.');
    } finally {
      setActionLoading('');
    }
  };

  if (!enabled || !user || user.role !== 'user') return null;

  return (
    <>
      {showDiscovery && !open && <DiscoveryTooltip onOpen={() => { dismissDiscovery(); setOpen(true); }} onDismiss={dismissDiscovery} />}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[min(78vh,760px)] sm:w-[min(720px,calc(100vw-2rem))] sm:rounded-[28px] sm:border sm:border-slate-200"
          style={{ boxShadow: '0 24px 70px rgba(15,23,42,0.22)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 text-white" style={{ background: 'linear-gradient(135deg, #06142B, #1D4ED8)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-slate-950/70 p-1">
                <img src="/images/viresend_ai.png" alt="" className="h-full w-full rounded-xl object-contain" />
              </div>
              <div>
                <div className="max-w-[220px] truncate font-extrabold">{conversations.find(item => item.id === conversationId)?.title || 'VireSend AI'}</div>
                <div className="text-xs text-blue-100">Ready</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={startNewConversation} title="New Chat" className="rounded-xl p-2 hover:bg-white/10" aria-label="New Chat">
                {actionLoading === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-xl p-2 hover:bg-white/10" aria-label="Minimize assistant">
                <Minimize2 className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} className="rounded-xl p-2 hover:bg-white/10" aria-label="Close assistant">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3" aria-label="Assistant mode">
            {MODE_OPTIONS.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setSelectedMode(mode.value)}
                disabled={sending || !!actionLoading}
                aria-pressed={selectedMode === mode.value}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${selectedMode === mode.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {conversations.length > 1 && (
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <select
                aria-label="Conversation history"
                value={conversationId}
                disabled={sending || !!actionLoading}
                onChange={async (event) => {
                  const nextId = event.target.value;
                  setConversationId(nextId);
                  setLoading(true);
                  try { await reloadConversation(nextId); } finally { setLoading(false); }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
              >
                {conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </div>
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading VireSend AI...
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  const data = message.structured_data || {};
                  const confirmToken = data.confirmation_token;
                  const hidePlainText = !isUser && CARD_KINDS.has(String(data.kind || ''));
                  return (
                    <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`${isUser ? 'max-w-[88%] rounded-[22px] bg-blue-600 px-4 py-3 text-white' : 'w-full rounded-[22px] bg-slate-100 px-3 py-3 text-slate-800 sm:px-4'}`}>
                        {!isUser && (
                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                            <img src="/images/viresend_ai.png" alt="" className="h-4 w-4 rounded object-contain" />
                            VireSend AI
                          </div>
                        )}
                        {!hidePlainText && message.content ? <div className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</div> : null}
                        {data.kind === 'message_draft' ? (
                          <MessageDraftCard
                            draft={data.draft || {}}
                            onAction={(action, prompt) => {
                              if (action === 'refine' && prompt) sendMessage(prompt);
                              if (action === 'edit') {
                                setInput(`Rewrite the current draft as follows:\n${data.draft?.body || ''}`);
                                window.setTimeout(() => textAreaRef.current?.focus(), 0);
                              }
                              if (action === 'prepare') sendMessage('I want to send this draft.');
                            }}
                          />
                        ) : null}
                        {(data.kind === 'preview_sms' || (data.kind === 'sender_selection' && data.preview?.channel === 'sms')) ? <SmsCampaignPreviewCard preview={data.preview || {}} /> : null}
                        {(data.kind === 'preview_email' || (data.kind === 'email_account_selection' && data.preview?.channel === 'email')) ? <EmailCampaignPreviewCard preview={data.preview || {}} /> : null}
                        {(data.kind === 'campaign_result' || data.kind === 'error') ? <AiResultCard data={data} /> : null}
                        {data.kind === 'campaign_status' ? <CampaignStatusCard data={data} /> : null}
                        {Array.isArray(data.options) && data.options.length > 0 && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {data.options.map((option: any) => {
                              const key = `${message.id}:${option.action}:${option.value || ''}`;
                              return (
                                <button
                                  key={`${option.action}-${option.value || option.label}`}
                                  onClick={() => handleAction(message, option)}
                                  disabled={actionLoading === key}
                                  className="rounded-2xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60"
                                >
                                  {actionLoading === key ? 'Working...' : option.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {Array.isArray(data.links) && data.links.length > 0 && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {data.links.map((link: any) => (
                              <button
                                key={`${link.label}-${link.url}`}
                                onClick={() => link.url && navigate(link.url)}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {link.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {(data.kind === 'preview_sms' || data.kind === 'preview_email') && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {[
                              { label: 'Edit Message', prompt: '', field: 'message' },
                              { label: 'Change Recipient', prompt: '', field: 'contact_group_name' },
                              { label: data.kind === 'preview_sms' ? 'Change Sender ID' : 'Change Account', prompt: '', field: data.kind === 'preview_sms' ? 'sender_id' : 'email_account_id' },
                            ].map((action) => (
                              <button key={action.label} onClick={() => handleAction(message, { action: 'prefill_input', prompt: action.prompt, field: action.field })} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                {action.label}
                              </button>
                            ))}
                            <button
                              onClick={() => handleAction(message, { action: 'cancel_draft' })}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleAction(message, { action: 'confirm_send' }, confirmToken)}
                              disabled={!data.can_confirm || !confirmToken || actionLoading === `${message.id}:confirm_send:`}
                              className="rounded-2xl bg-blue-600 px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
                            >
                              {actionLoading === `${message.id}:confirm_send:` ? 'Sending...' : 'Confirm and Send'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!messages.length && (
                  <div className="py-10 text-center text-sm text-slate-500">No conversation yet.</div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-3 py-4 sm:px-4">
            {messages.length <= 1 && <div className="mb-3 grid grid-cols-2 gap-2">
              {(Array.isArray(messages[0]?.structured_data?.quick_actions) ? messages[0]?.structured_data?.quick_actions : QUICK_ACTIONS).slice(0, 5).map((item: any) => (
                <button
                  key={item.label}
                  onClick={() => sendMessage(item.prompt)}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <span className="block truncate">{item.label}</span>
                </button>
              ))}
            </div>}
            <div className="flex items-end gap-2">
              <textarea
                ref={textAreaRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  event.target.style.height = 'auto';
                  event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(input);
                  }
                }}
                rows={2}
                placeholder="Message VireSend AI…"
                className="min-h-[52px] max-h-40 flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={sending || !input.trim()}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-blue-600 text-white disabled:opacity-60"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (!open) dismissDiscovery();
          setOpen((value) => !value);
          if (!open && conversationId) reloadConversation(conversationId).catch(() => null);
        }}
        className="fixed bottom-5 right-4 z-[70] flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-105 motion-reduce:transition-none"
        style={{ background: 'linear-gradient(135deg, #06142B, #2563EB)', boxShadow: '0 18px 45px rgba(37,99,235,0.35)' }}
        aria-label={open ? 'Close VireSend AI' : 'Open VireSend AI'}
      >
        <span className={`absolute inset-0 rounded-full ${open ? '' : 'motion-safe:animate-ping'}`} style={{ background: 'rgba(37,99,235,0.22)' }} />
        <span className="relative">
          {open ? <X className="h-6 w-6" /> : <img src="/images/viresend_ai.png" alt="" className="h-12 w-12 rounded-full object-contain" />}
        </span>
      </button>
    </>
  );
}
