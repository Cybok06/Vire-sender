import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, Eye, X, Loader2, Upload, AlertCircle,
  CheckCircle, Clock, MessageSquare, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  useComplaints, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_LABELS,
  ComplaintType, TicketPriority
} from '../../contexts/ComplaintsContext';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';
import { toast } from 'sonner';

// ── Submit modal ──────────────────────────────────────────────────────────────
function SubmitModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { submitTicket } = useComplaints();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type:        'otp'    as ComplaintType,
    priority:    'medium' as TicketPriority,
    subject:     '',
    description: '',
    relatedId:   '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: string, v: string) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.subject.trim())     e.subject     = 'Subject is required';
    if (!form.description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const id = await submitTicket({
        userId: user?.id || 'user_current',
        userName: user?.name || user?.full_name || 'User',
        userEmail: user?.email || '',
        type: form.type,
        subject: form.subject,
        description: form.description,
        relatedId: form.relatedId || undefined,
        priority: form.priority,
      });
      toast.success(`Ticket ${id} submitted! Our team will respond soon.`);
      onClose();
      navigate(`/user/support/${id}`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to submit ticket.');
    } finally {
      setLoading(false);
    }
  };

  const types: { value: ComplaintType; label: string }[] = [
    { value: 'otp',     label: 'OTP Issue'         },
    { value: 'sms',     label: 'SMS Sending Issue'  },
    { value: 'email',   label: 'Email Sending Issue'},
    { value: 'wallet',  label: 'Wallet / Payment'   },
    { value: 'api',     label: 'API Issue'          },
    { value: 'account', label: 'Account Issue'      },
    { value: 'other',   label: 'Other'              },
  ];

  const input = (field: string) =>
    `w-full border rounded-xl px-4 py-2.5 text-sm outline-none transition-all ${
      errors[field] ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Submit a Support Ticket</h2>
            <p className="text-gray-400 text-xs mt-0.5">We typically respond within 2–4 hours.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Complaint Type</label>
            <div className="relative">
              <select value={form.type} onChange={e => update('type', e.target.value)} className={`${input('type')} appearance-none pr-8`}>
                {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as TicketPriority[]).map(p => {
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p} type="button"
                    onClick={() => update('priority', p)}
                    className={`py-2 rounded-xl text-xs capitalize border-2 transition-all ${
                      form.priority === p ? `${cfg.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                    style={{ fontWeight: form.priority === p ? 600 : 400 }}
                  >{cfg.label}</button>
                );
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Subject</label>
            <input type="text" value={form.subject} onChange={e => update('subject', e.target.value)} placeholder="Brief summary of your issue" className={input('subject')} />
            {errors.subject && <p className="text-xs text-red-500 mt-1">{errors.subject}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Description</label>
            <textarea
              value={form.description}
              onChange={e => update('description', e.target.value)}
              rows={4}
              placeholder="Please describe your issue in detail — what happened, what you expected, and any steps you've already tried..."
              className={`${input('description')} resize-none`}
            />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </div>

          {/* Related ID */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
              Related Order / Message ID <span className="text-gray-400" style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <input type="text" value={form.relatedId} onChange={e => update('relatedId', e.target.value)} placeholder="e.g. ORD-0124, CMP-001, REQ-2840" className={input('relatedId')} />
          </div>

          {/* Screenshot upload (UI mock) */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
              Screenshot <span className="text-gray-400" style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <div className="border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl p-4 text-center cursor-pointer transition-colors group">
              <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-400 mx-auto mb-1.5 transition-colors" />
              <p className="text-xs text-gray-500 group-hover:text-blue-500 transition-colors">Click to upload or drag & drop</p>
              <p className="text-xs text-gray-400 mt-0.5">PNG, JPG up to 5MB</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm hover:border-gray-300 transition-colors" style={{ fontWeight: 500 }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white rounded-xl text-sm flex items-center justify-center gap-2 transition-colors" style={{ fontWeight: 600 }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SupportPage() {
  const { tickets, loading } = useComplaints();
  const { isEnabled } = useServiceAvailability();
  const navigate = useNavigate();

  const [showModal, setShowModal]   = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const myTickets = tickets;

  const filtered = myTickets.filter(t => {
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search);
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total:    myTickets.length,
    open:     myTickets.filter(t => t.status === 'open').length,
    inReview: myTickets.filter(t => t.status === 'in_review').length,
    resolved: myTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
  };

  if (!isEnabled('complaints_support')) return <ServiceLockedOverlay serviceKey="complaints_support" />;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Support Center</h1>
          <p className="text-gray-500 text-sm mt-0.5">Submit and track your support tickets.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-sm transition-colors"
          style={{ fontWeight: 500 }}
        >
          <Plus className="w-4 h-4" />New Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Tickets', value: stats.total,    icon: MessageSquare, color: 'text-blue-600',   bg: 'bg-blue-100'    },
          { label: 'Open',          value: stats.open,     icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-100'     },
          { label: 'In Review',     value: stats.inReview, icon: Clock,         color: 'text-blue-600',   bg: 'bg-blue-100'    },
          { label: 'Resolved',      value: stats.resolved, icon: CheckCircle,   color: 'text-emerald-600',bg: 'bg-emerald-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
            </div>
            <div className={`text-2xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-sm mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by subject or ticket ID..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'open', 'in_review', 'waiting_user', 'resolved', 'closed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors whitespace-nowrap ${statusFilter === s ? 'bg-blue-900 text-white' : 'border border-gray-200 text-gray-600'}`}>
              {s === 'in_review' ? 'In Review' : s === 'waiting_user' ? 'Waiting' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-3 animate-spin" />
            <p className="text-gray-400 text-sm">Loading support tickets...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No tickets found.</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-blue-600 text-sm hover:text-blue-800" style={{ fontWeight: 500 }}>
              Submit your first ticket →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Ticket ID', 'Subject', 'Type', 'Priority', 'Status', 'Last Updated', 'Action'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(ticket => {
                  const sc = STATUS_CONFIG[ticket.status];
                  const pc = PRIORITY_CONFIG[ticket.priority];
                  return (
                    <tr key={ticket.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-lg" style={{ fontWeight: 600 }}>{ticket.id}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm text-gray-800 max-w-[200px] truncate" style={{ fontWeight: 500 }}>{ticket.subject}</div>
                        {ticket.relatedId && <div className="text-xs text-gray-400 font-mono mt-0.5">{ticket.relatedId}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">{TYPE_LABELS[ticket.type]}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${pc.color}`} style={{ fontWeight: 500 }}>{pc.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${sc.color}`} style={{ fontWeight: 500 }}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400 whitespace-nowrap">{ticket.updatedAt}</td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => navigate(`/user/support/${ticket.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          <Eye className="w-3.5 h-3.5" />View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <SubmitModal onClose={() => setShowModal(false)} />}
    </div>
  );
}


