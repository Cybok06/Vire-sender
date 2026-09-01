import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, Send, CheckCircle, RefreshCw, User,
  Clock, AlertCircle, Tag, Hash, Loader2, Lock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  useComplaints, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_LABELS, TicketStatus
} from '../../contexts/ComplaintsContext';
import { toast } from 'sonner';

// ── Timeline entry ─────────────────────────────────────────────────────────────
const TIMELINE_MESSAGES: Record<TicketStatus, string> = {
  open:         'Ticket submitted',
  in_review:    'Under review by support',
  waiting_user: 'Waiting for your response',
  resolved:     'Issue resolved',
  closed:       'Ticket closed',
};

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { tickets, addMessage, changeStatus } = useComplaints();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [reply, setReply]     = useState('');
  const [sending, setSending] = useState(false);

  const ticket = tickets.find(t => t.id === ticketId);

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
        <h2 className="text-gray-500 text-lg" style={{ fontWeight: 600 }}>Ticket not found</h2>
        <Link to="/user/support" className="mt-4 text-blue-600 text-sm hover:text-blue-800">← Back to Support</Link>
      </div>
    );
  }

  const sc = STATUS_CONFIG[ticket.status];
  const pc = PRIORITY_CONFIG[ticket.priority];
  const canReply  = ticket.status !== 'closed';
  const canClose  = ticket.status === 'resolved';
  const canReopen = ticket.status === 'resolved' || ticket.status === 'closed';

  const handleSendReply = async () => {
    if (!reply.trim() || !canReply) return;
    setSending(true);
    try {
      await addMessage(ticket.id, 'user', user?.name || user?.full_name || 'User', reply.trim());
      setReply('');
      toast.success('Reply sent!');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    try {
      await changeStatus(ticket.id, 'closed');
      toast.success('Ticket closed. Thank you!');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to close ticket.');
    }
  };

  const handleReopen = async () => {
    try {
      await changeStatus(ticket.id, 'open');
      toast.success('Ticket reopened. Our team will review it again.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to reopen ticket.');
    }
  };

  // Build timeline from status progression
  const ALL_STATUSES: TicketStatus[] = ['open', 'in_review', 'waiting_user', 'resolved', 'closed'];
  const currentIdx = ALL_STATUSES.indexOf(ticket.status);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Back */}
      <Link to="/user/support" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to Support Center
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-lg" style={{ fontWeight: 600 }}>{ticket.id}</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${sc.color}`} style={{ fontWeight: 500 }}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                {sc.label}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs ${pc.color}`} style={{ fontWeight: 500 }}>{pc.label} Priority</span>
            </div>
            <h1 className="text-xl text-gray-800 mt-2" style={{ fontWeight: 700 }}>{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{TYPE_LABELS[ticket.type]}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Submitted {ticket.createdAt}</span>
              {ticket.relatedId && <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />Ref: {ticket.relatedId}</span>}
              {ticket.assignedAdmin && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Assigned to {ticket.assignedAdmin}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {canClose && (
              <button onClick={handleClose} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                <CheckCircle className="w-4 h-4" />Close Ticket
              </button>
            )}
            {canReopen && ticket.status !== 'resolved' && (
              <button onClick={handleReopen} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                <RefreshCw className="w-4 h-4" />Reopen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: Timeline + Details */}
        <div className="space-y-5">
          {/* Status Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm text-gray-700 mb-4" style={{ fontWeight: 600 }}>Status Timeline</h3>
            <div className="space-y-3">
              {ALL_STATUSES.map((s, i) => {
                const cfg = STATUS_CONFIG[s];
                const isPast    = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={s} className="flex items-start gap-3">
                    <div className="relative flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                        isCurrent ? cfg.dot.replace('bg-', 'bg-') + ' ring-4 ring-offset-1' :
                        isPast    ? 'bg-emerald-400' : 'bg-gray-200'
                      } ${isCurrent ? `ring-${cfg.dot.split('-')[1]}-100` : ''}`}>
                        {isPast ? (
                          <CheckCircle className="w-3 h-3 text-white" />
                        ) : isCurrent ? (
                          <span className={`w-2 h-2 rounded-full bg-white`} />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-gray-300" />
                        )}
                      </div>
                      {i < ALL_STATUSES.length - 1 && (
                        <div className={`w-0.5 h-6 mt-1 ${isPast ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                      )}
                    </div>
                    <div className="pb-3">
                      <p className={`text-xs ${isCurrent ? 'text-gray-800' : isPast ? 'text-emerald-600' : 'text-gray-400'}`} style={{ fontWeight: isCurrent ? 600 : 400 }}>
                        {cfg.label}
                      </p>
                      {isCurrent && <p className="text-[10px] text-gray-400 mt-0.5">{ticket.updatedAt}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ticket info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h3 className="text-sm text-gray-700 mb-1" style={{ fontWeight: 600 }}>Ticket Details</h3>
            {[
              { label: 'Type',     value: TYPE_LABELS[ticket.type] },
              { label: 'Priority', value: pc.label },
              { label: 'Status',   value: sc.label },
              { label: 'Submitted',value: ticket.createdAt },
              { label: 'Last Update',value: ticket.updatedAt },
              ...(ticket.relatedId ? [{ label: 'Reference', value: ticket.relatedId }] : []),
              ...(ticket.assignedAdmin ? [{ label: 'Agent', value: ticket.assignedAdmin }] : []),
              ...(ticket.resolvedAt ? [{ label: 'Resolved', value: ticket.resolvedAt }] : []),
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{row.label}</span>
                <span className="text-gray-700" style={{ fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Conversation */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col" style={{ minHeight: '500px' }}>
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Conversation</h3>
            <p className="text-xs text-gray-400 mt-0.5">{ticket.messages.length} message{ticket.messages.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Messages */}
          <div className="flex-1 p-5 space-y-4 overflow-y-auto">
            {ticket.messages.map(msg => {
              const isUser = msg.senderType === 'user';
              return (
                <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-blue-900' : 'bg-amber-500'}`}>
                    <span className="text-white text-xs" style={{ fontWeight: 600 }}>
                      {msg.senderName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      isUser ? 'bg-blue-900 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.message}
                    </div>
                    <div className="flex items-center gap-2 mt-1 px-1">
                      <span className="text-[10px] text-gray-400">{msg.senderName}</span>
                      <span className="text-[10px] text-gray-400">·</span>
                      <span className="text-[10px] text-gray-400">{msg.createdAt}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply box */}
          {canReply ? (
            <div className="border-t border-gray-100 p-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-blue-900 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs" style={{ fontWeight: 600 }}>
                    {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="flex-1 flex gap-2">
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    rows={2}
                    placeholder="Type your reply..."
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSendReply(); }}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!reply.trim() || sending}
                    className="self-end p-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl transition-colors"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1.5 pl-11">Press Ctrl+Enter to send</p>
            </div>
          ) : (
            <div className="border-t border-gray-100 p-4 flex items-center gap-2 bg-gray-50">
              <Lock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">This ticket is closed. </span>
              <button onClick={handleReopen} className="text-sm text-blue-600 hover:text-blue-800" style={{ fontWeight: 500 }}>Reopen ticket</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


