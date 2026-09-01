import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  addAdminComplaintMessage,
  addAdminComplaintNote,
  addSupportMessage,
  assignAdminComplaint,
  createSupportTicket,
  getAdminComplaintStats,
  getAdminComplaints,
  getSupportTickets,
  updateAdminComplaintStatus,
  updateSupportTicketStatus,
} from '../../lib/api.js';

export type TicketStatus = 'open' | 'in_review' | 'waiting_user' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';
export type ComplaintType = 'otp' | 'sms' | 'email' | 'wallet' | 'api' | 'account' | 'other';

export interface TicketMessage {
  id: string;
  senderType: 'user' | 'admin';
  senderName: string;
  message: string;
  createdAt: string;
}

export interface InternalNote {
  id: string;
  adminName: string;
  note: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: ComplaintType;
  subject: string;
  description: string;
  relatedId?: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedAdmin?: string;
  messages: TicketMessage[];
  internalNotes: InternalNote[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  unreadForAdmin?: boolean;
  unreadForUser?: boolean;
}

interface ComplaintsContextValue {
  tickets: Ticket[];
  loading: boolean;
  adminUnreadCount: number;
  refreshTickets: () => Promise<void>;
  submitTicket: (data: Omit<Ticket, 'id' | 'messages' | 'internalNotes' | 'createdAt' | 'updatedAt' | 'status'>) => Promise<string>;
  addMessage: (ticketId: string, senderType: 'user' | 'admin', senderName: string, message: string) => Promise<void>;
  changeStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  assignAdmin: (ticketId: string, adminName: string) => Promise<void>;
  addInternalNote: (ticketId: string, adminName: string, note: string) => Promise<void>;
}

const ComplaintsContext = createContext<ComplaintsContextValue | null>(null);

function normalizeTickets(items: Ticket[] = []) {
  return items.map(item => ({
    ...item,
    assignedAdmin: item.assignedAdmin || undefined,
    relatedId: item.relatedId || undefined,
    messages: item.messages || [],
    internalNotes: item.internalNotes || [],
  }));
}

export function ComplaintsProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);

  const refreshTickets = async () => {
    if (!token || !user) {
      setTickets([]);
      setAdminUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      if (user.role === 'admin') {
        const [ticketsData, statsData] = await Promise.all([getAdminComplaints(), getAdminComplaintStats()]);
        setTickets(normalizeTickets(ticketsData.tickets || []));
        setAdminUnreadCount(statsData.stats?.unread || 0);
      } else {
        const data = await getSupportTickets();
        const nextTickets = normalizeTickets(data.tickets || []);
        setTickets(nextTickets);
        setAdminUnreadCount(0);
      }
    } catch {
      setTickets([]);
      setAdminUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTickets();
  }, [token, user?.role]);

  useEffect(() => {
    if (!token || !user) return undefined;
    const timer = window.setInterval(() => {
      refreshTickets();
    }, user.role === 'admin' ? 30000 : 60000);
    return () => window.clearInterval(timer);
  }, [token, user?.role]);

  const submitTicket = async (data: Omit<Ticket, 'id' | 'messages' | 'internalNotes' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string> => {
    const response = await createSupportTicket({
      type: data.type,
      priority: data.priority,
      subject: data.subject,
      description: data.description,
      related_id: data.relatedId,
    });
    setTickets(prev => [response.ticket, ...prev]);
    return response.ticket.id;
  };

  const addMessage = async (ticketId: string, senderType: 'user' | 'admin', senderName: string, message: string) => {
    const response = senderType === 'admin'
      ? await addAdminComplaintMessage(ticketId, { message, sender_name: senderName })
      : await addSupportMessage(ticketId, { message });
    setTickets(prev => prev.map(ticket => ticket.id === ticketId ? response.ticket : ticket));
    if (user?.role === 'admin') {
      const stats = await getAdminComplaintStats().catch(() => null);
      if (stats?.stats) setAdminUnreadCount(stats.stats.unread || 0);
    }
  };

  const changeStatus = async (ticketId: string, status: TicketStatus) => {
    const response = user?.role === 'admin'
      ? await updateAdminComplaintStatus(ticketId, { status })
      : await updateSupportTicketStatus(ticketId, { status });
    setTickets(prev => prev.map(ticket => ticket.id === ticketId ? response.ticket : ticket));
    if (user?.role === 'admin') {
      const stats = await getAdminComplaintStats().catch(() => null);
      if (stats?.stats) setAdminUnreadCount(stats.stats.unread || 0);
    }
  };

  const assignAdmin = async (ticketId: string, adminName: string) => {
    const response = await assignAdminComplaint(ticketId, { admin_name: adminName });
    setTickets(prev => prev.map(ticket => ticket.id === ticketId ? response.ticket : ticket));
    const stats = await getAdminComplaintStats().catch(() => null);
    if (stats?.stats) setAdminUnreadCount(stats.stats.unread || 0);
  };

  const addInternalNote = async (ticketId: string, adminName: string, note: string) => {
    const response = await addAdminComplaintNote(ticketId, { admin_name: adminName, note });
    setTickets(prev => prev.map(ticket => ticket.id === ticketId ? response.ticket : ticket));
  };

  const value = useMemo(() => ({
    tickets,
    loading,
    adminUnreadCount,
    refreshTickets,
    submitTicket,
    addMessage,
    changeStatus,
    assignAdmin,
    addInternalNote,
  }), [tickets, loading, adminUnreadCount, user?.role]);

  return <ComplaintsContext.Provider value={value}>{children}</ComplaintsContext.Provider>;
}

export function useComplaints() {
  const ctx = useContext(ComplaintsContext);
  if (!ctx) throw new Error('useComplaints must be used inside ComplaintsProvider');
  return ctx;
}

export const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; dot: string }> = {
  open: { label: 'Open', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  in_review: { label: 'In Review', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  waiting_user: { label: 'Waiting for User', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
};

export const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-600' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', color: 'bg-red-100 text-red-700' },
};

export const TYPE_LABELS: Record<ComplaintType, string> = {
  otp: 'OTP Issue',
  sms: 'SMS Issue',
  email: 'Email Issue',
  wallet: 'Wallet / Payment',
  api: 'API Issue',
  account: 'Account Issue',
  other: 'Other',
};
