import { useState } from 'react';
import { useParams, Link } from 'react-router';
import {
  ArrowLeft, Send, CheckCircle, AlertCircle, Clock, Tag,
  Hash, User, Loader2, Lock, X, NotepadText, UserCheck,
  ChevronDown, Eye
} from 'lucide-react';
import {
  useComplaints, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_LABELS,
  TicketStatus
} from '../../contexts/ComplaintsContext';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

const ADMINS = ['Admin Alex', 'Admin Sam', 'Admin Maria'];

export default function AdminTicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { tickets, addMessage, changeStatus, assignAdmin, addInternalNote } = useComplaints();
  const { user } = useAuth();

  const [reply, setReply]         = useState('');
  const [note, setNote]           = useState('');
  const [sending, setSending]     = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const adminName = user?.name || user?.full_name || 'Support Admin';

  const ticket = tickets.find(t => t.id === ticketId);

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
        <h2 className="text-gray-500 text-lg" style={{ fontWeight: 600 }}>Ticket not found</h2>
        <Link to="/admin/complaints" className="mt-4 text-blue-600 text-sm hover:text-blue-800">← Back to Complaints</Link>
      </div>
    );
  }

  const sc = STATUS_CONFIG[ticket.status];
  const pc = PRIORITY_CONFIG[ticket.priority];
  const canReply = ticket.status !== 'closed';

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await addMessage(ticket.id, 'admin', adminName, reply.trim());
      setReply('');
      toast.success('Reply sent to user.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setAddingNote(true);
    try {
      await addInternalNote(ticket.id, adminName, note.trim());
      setNote('');
      toast.success('Internal note added.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleStatusChange = async (status: TicketStatus) => {
    try {
      await changeStatus(ticket.id, status);
      toast.success(`Status updated to ${STATUS_CONFIG[status].label}.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to update status.');
    }
  };

  const handleAssign = async (admin: string) => {
    if (!admin) return;
    try {
      await assignAdmin(ticket.id, admin);
      toast.success(`Assigned to ${admin}.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to assign ticket.');
    }
  };

  const ALL_STATUSES: TicketStatus[] = ['open', 'in_review', 'waiting_user', 'resolved', 'closed'];
  const currentIdx = ALL_STATUSES.indexOf(ticket.status);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      {/* Back + Header */}
      <Link to="/admin/complaints" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to Complaints
      </Link>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-lg" style={{ fontWeight: 600 }}>{ticket.id}</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${sc.color}`} style={{ fontWeight: 500 }}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs ${pc.color}`} style={{ fontWeight: 500 }}>{pc.label} Priority</span>
              {ticket.priority === 'high' && (ticket.status === 'open' || ticket.status === 'in_review') && (
                <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-xs flex items-center gap-1" style={{ fontWeight: 600 }}>
                  <AlertCircle className="w-3 h-3" />Needs Attention
                </span>
              )}
            </div>
            <h1 className="text-xl text-gray-800 mt-1" style={{ fontWeight: 700 }}>{ticket.subject}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{ticket.userName} · {ticket.userEmail}</span>
              <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{TYPE_LABELS[ticket.type]}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{ticket.createdAt}</span>
              {ticket.relatedId && <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{ticket.relatedId}</span>}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            {(ticket.status === 'open' || ticket.status === 'in_review') && (
              <button onClick={() => handleStatusChange('resolved')} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                <CheckCircle className="w-4 h-4" />Resolve
              </button>
            )}
            {ticket.status !== 'closed' && (
              <button onClick={() => handleStatusChange('closed')} className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                <X className="w-4 h-4" />Close
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left panel */}
        <div className="space-y-5">
          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Ticket Controls</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Change Status</label>
              <div className="relative">
                <select value={ticket.status} onChange={e => handleStatusChange(e.target.value as TicketStatus)} className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 pr-8">
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Assign Agent</label>
              <div className="relative">
                <select value={ticket.assignedAdmin || ''} onChange={e => handleAssign(e.target.value)} className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 pr-8">
                  <option value="">Unassigned</option>
                  {ADMINS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            {ticket.assignedAdmin && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-xl">
                <UserCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-xs text-emerald-700" style={{ fontWeight: 500 }}>{ticket.assignedAdmin}</span>
              </div>
            )}
          </div>

          {/* Ticket info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm text-gray-700 mb-3" style={{ fontWeight: 600 }}>Details</h3>
            <div className="space-y-2.5">
              {[
                { label: 'User',      value: ticket.userName  },
                { label: 'Email',     value: ticket.userEmail },
                { label: 'Type',      value: TYPE_LABELS[ticket.type] },
                { label: 'Priority',  value: pc.label },
                { label: 'Status',    value: sc.label },
                { label: 'Created',   value: ticket.createdAt },
                { label: 'Updated',   value: ticket.updatedAt },
                ...(ticket.relatedId   ? [{ label: 'Reference', value: ticket.relatedId }]   : []),
                ...(ticket.resolvedAt  ? [{ label: 'Resolved',  value: ticket.resolvedAt }]  : []),
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{row.label}</span>
                  <span className="text-gray-700 text-right max-w-[55%] truncate" style={{ fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm text-gray-700 mb-4" style={{ fontWeight: 600 }}>Timeline</h3>
            <div className="space-y-2">
              {ALL_STATUSES.map((s, i) => {
                const cfg = STATUS_CONFIG[s];
                const isPast    = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={s} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCurrent ? cfg.dot : isPast ? 'bg-emerald-400' : 'bg-gray-200'
                      }`}>
                        {isPast ? <CheckCircle className="w-3 h-3 text-white" /> : isCurrent ? <span className="w-2 h-2 rounded-full bg-white" /> : null}
                      </div>
                      {i < ALL_STATUSES.length - 1 && <div className={`w-0.5 h-5 mt-0.5 ${isPast ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
                    </div>
                    <p className={`text-xs pb-3 ${isCurrent ? 'text-gray-800' : isPast ? 'text-emerald-600' : 'text-gray-400'}`} style={{ fontWeight: isCurrent ? 600 : 400 }}>
                      {cfg.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Internal notes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setShowNotes(p => !p)} className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-700 hover:bg-gray-50 transition-colors" style={{ fontWeight: 600 }}>
              <div className="flex items-center gap-2">
                <NotepadText className="w-4 h-4 text-amber-500" />
                Internal Notes
                {ticket.internalNotes.length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">{ticket.internalNotes.length}</span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showNotes ? 'rotate-180' : ''}`} />
            </button>
            {showNotes && (
              <div className="px-5 pb-5 space-y-3">
                {ticket.internalNotes.length > 0 ? (
                  ticket.internalNotes.map(n => (
                    <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-amber-700" style={{ fontWeight: 600 }}>{n.adminName}</span>
                        <span className="text-[10px] text-amber-500">{n.createdAt}</span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">{n.note}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">No internal notes yet.</p>
                )}
                <div className="flex gap-2 mt-3">
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={2}
                    placeholder="Add a private note (only admins can see this)..."
                    className="flex-1 border border-amber-200 bg-amber-50/50 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-400 resize-none"
                  />
                  <button onClick={handleAddNote} disabled={!note.trim() || addingNote} className="self-end p-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl transition-colors disabled:opacity-40">
                    {addingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <NotepadText className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Conversation */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col" style={{ minHeight: '600px' }}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Conversation</h3>
              <p className="text-xs text-gray-400 mt-0.5">{ticket.messages.length} message{ticket.messages.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Messages thread */}
          <div className="flex-1 p-5 space-y-4 overflow-y-auto">
            {ticket.messages.map(msg => {
              const isAdmin = msg.senderType === 'admin';
              return (
                <div key={msg.id} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isAdmin ? 'bg-amber-500' : 'bg-blue-900'}`}>
                    <span className="text-white text-xs" style={{ fontWeight: 600 }}>
                      {msg.senderName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className={`max-w-[75%] flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      isAdmin ? 'bg-amber-500 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.message}
                    </div>
                    <div className="flex items-center gap-2 mt-1 px-1">
                      {isAdmin && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Admin</span>}
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
                <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs" style={{ fontWeight: 600 }}>{adminName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 space-y-2">
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    rows={3}
                    placeholder="Write a reply to the user... (Ctrl+Enter to send)"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSendReply(); }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Replying as <strong>{adminName}</strong></span>
                    <button
                      onClick={handleSendReply}
                      disabled={!reply.trim() || sending}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-sm transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</> : <><Send className="w-3.5 h-3.5" />Send Reply</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-100 p-4 bg-gray-50 flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">This ticket is closed. </span>
              <button onClick={() => handleStatusChange('open')} className="text-sm text-blue-600 hover:text-blue-800" style={{ fontWeight: 500 }}>Reopen ticket</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

