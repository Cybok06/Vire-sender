import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Search, Eye, CheckCircle, AlertCircle, Clock, MessageSquare,
  UserCheck, ChevronDown, Filter
} from 'lucide-react';
import {
  useComplaints, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_LABELS,
  TicketStatus, ComplaintType, TicketPriority
} from '../../contexts/ComplaintsContext';
import { toast } from 'sonner';

const ADMINS = ['Admin Alex', 'Admin Sam', 'Admin Maria'];

export default function AdminComplaints() {
  const { tickets, loading, changeStatus, assignAdmin } = useComplaints();
  const navigate = useNavigate();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const filtered = tickets.filter(t => {
    const matchSearch   = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.userName.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search);
    const matchStatus   = statusFilter   === 'all' || t.status   === statusFilter;
    const matchType     = typeFilter     === 'all' || t.type     === typeFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchType && matchPriority;
  });

  const stats = {
    total:       tickets.length,
    open:        tickets.filter(t => t.status === 'open').length,
    inReview:    tickets.filter(t => t.status === 'in_review').length,
    resolvedToday: tickets.filter(t => t.resolvedAt && new Date(t.resolvedAt).toDateString() === new Date().toDateString()).length,
    highPriority:tickets.filter(t => t.priority === 'high' && t.status !== 'resolved' && t.status !== 'closed').length,
  };

  const quickStatus = async (ticketId: string, status: TicketStatus) => {
    try {
      await changeStatus(ticketId, status);
      toast.success(`Ticket ${ticketId} marked as ${STATUS_CONFIG[status].label}.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to update ticket.');
    }
  };

  const quickAssign = async (ticketId: string, admin: string) => {
    try {
      await assignAdmin(ticketId, admin);
      toast.success(`Assigned to ${admin} and set to In Review.`);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to assign ticket.');
    }
  };

  const SelectCell = ({ ticketId, field, value, options, onChange }: {
    ticketId: string; field: string; value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }) => (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onClick={e => e.stopPropagation()}
        className="appearance-none text-xs border border-gray-200 bg-white rounded-xl px-2.5 py-1.5 pr-6 outline-none focus:border-blue-400 cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Complaint Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage, assign and resolve user support tickets.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',          value: stats.total,         icon: MessageSquare, color: 'text-blue-600',    bg: 'bg-blue-100'    },
          { label: 'Open',           value: stats.open,          icon: AlertCircle,   color: 'text-red-600',     bg: 'bg-red-100'     },
          { label: 'In Review',      value: stats.inReview,      icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-100'    },
          { label: 'Resolved Today', value: stats.resolvedToday, icon: CheckCircle,   color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'High Priority',  value: stats.highPriority,  icon: AlertCircle,   color: 'text-red-600',     bg: 'bg-red-100'     },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-2`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`text-2xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search ticket, user, or subject..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {/* Status */}
            <div className="relative">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="appearance-none text-sm border border-gray-200 rounded-xl px-3 py-2 pr-7 outline-none focus:border-blue-400">
                <option value="all">All Status</option>
                {(['open','in_review','waiting_user','resolved','closed'] as TicketStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {/* Type */}
            <div className="relative">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="appearance-none text-sm border border-gray-200 rounded-xl px-3 py-2 pr-7 outline-none focus:border-blue-400">
                <option value="all">All Types</option>
                {(Object.keys(TYPE_LABELS) as ComplaintType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {/* Priority */}
            <div className="relative">
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="appearance-none text-sm border border-gray-200 rounded-xl px-3 py-2 pr-7 outline-none focus:border-blue-400">
                <option value="all">All Priority</option>
                {(['high','medium','low'] as TicketPriority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Ticket ID','User','Type','Subject','Priority','Status','Assigned','Created','Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="py-16 text-center text-gray-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 animate-spin" />Loading tickets...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />No tickets found.
                </td></tr>
              ) : filtered.map(ticket => {
                const sc = STATUS_CONFIG[ticket.status];
                const pc = PRIORITY_CONFIG[ticket.priority];
                return (
                  <tr key={ticket.id} className={`hover:bg-gray-50/50 transition-colors ${ticket.priority === 'high' && (ticket.status === 'open' || ticket.status === 'in_review') ? 'border-l-2 border-l-red-400' : ''}`}>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-lg" style={{ fontWeight: 600 }}>{ticket.id}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{ticket.userName}</div>
                      <div className="text-xs text-gray-400">{ticket.userEmail}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">{TYPE_LABELS[ticket.type]}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-gray-700 max-w-[180px] truncate">{ticket.subject}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${pc.color}`} style={{ fontWeight: 500 }}>{pc.label}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <SelectCell
                        ticketId={ticket.id} field="status" value={ticket.status}
                        options={(['open','in_review','waiting_user','resolved','closed'] as TicketStatus[]).map(s => ({ value: s, label: STATUS_CONFIG[s].label }))}
                        onChange={v => quickStatus(ticket.id, v as TicketStatus)}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      {ticket.assignedAdmin ? (
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-emerald-500" />{ticket.assignedAdmin}
                        </span>
                      ) : (
                        <SelectCell
                          ticketId={ticket.id} field="admin" value=""
                          options={[{ value: '', label: 'Assign...' }, ...ADMINS.map(a => ({ value: a, label: a }))]}
                          onChange={v => v && quickAssign(ticket.id, v)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{ticket.createdAt}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => navigate(`/admin/complaints/${ticket.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          <Eye className="w-3.5 h-3.5" />View
                        </button>
                        {(ticket.status === 'open' || ticket.status === 'in_review') && (
                          <button
                            onClick={() => quickStatus(ticket.id, 'resolved')}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs transition-colors"
                            style={{ fontWeight: 500 }}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
          Showing {filtered.length} of {tickets.length} tickets
        </div>
      </div>
    </div>
  );
}


