import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  deleteNotificationById,
  getNotificationStats,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../lib/api.js';
import { useAuth } from './AuthContext';

export type NotificationType =
  | 'sms'
  | 'email'
  | 'wallet'
  | 'api'
  | 'contacts'
  | 'templates'
  | 'otp'
  | 'system'
  | 'support';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  status?: 'read' | 'unread';
  severity?: 'info' | 'success' | 'warning' | 'error';
  related_module?: string;
  related_id?: string;
  action_url?: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  created_at: Date;
}

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  refreshStats: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  addNotification: (notif: Omit<AppNotification, 'id' | 'created_at' | 'is_read'>) => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

function toNotification(item: any): AppNotification {
  return {
    id: item.id || item.notification_id,
    user_id: item.user_id || '',
    type: item.type || 'system',
    title: item.title || '',
    message: item.message || '',
    status: item.status || (item.is_read ? 'read' : 'unread'),
    severity: item.severity || 'info',
    related_module: item.related_module || '',
    related_id: item.related_id || '',
    action_url: item.action_url || '',
    metadata: item.metadata || {},
    is_read: item.is_read ?? item.status === 'read',
    created_at: item.created_at ? new Date(item.created_at) : new Date(),
  };
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const hasToken = () => Boolean(localStorage.getItem('viresend_token'));

  const refreshStats = useCallback(async () => {
    if (!hasToken()) return;
    try {
      const response = await getNotificationStats();
      setUnreadCount(response.stats?.unread || 0);
    } catch {
      // Keep the last known badge value if the request fails.
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!hasToken()) return;
    try {
      setLoading(true);
      const response = await getNotifications({ limit: 100 });
      const items = (response.notifications || []).map(toNotification);
      setNotifications(items);
      setUnreadCount(items.filter(item => !item.is_read).length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !localStorage.getItem('viresend_token')) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    refreshNotifications().catch(() => null);
    const timer = window.setInterval(() => {
      refreshStats().catch(() => null);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, user?.id, refreshNotifications, refreshStats]);

  const markAsRead = useCallback(async (id: string) => {
    const current = notifications.find(item => item.id === id);
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, is_read: true, status: 'read' } : item));
    if (current && !current.is_read) setUnreadCount(value => Math.max(0, value - 1));
    try {
      await markNotificationRead(id);
      await refreshStats();
    } catch {
      await refreshNotifications();
    }
  }, [notifications, refreshNotifications, refreshStats]);

  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(item => ({ ...item, is_read: true, status: 'read' })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
      await refreshStats();
    } catch {
      await refreshNotifications();
    }
  }, [refreshNotifications, refreshStats]);

  const deleteNotification = useCallback(async (id: string) => {
    const current = notifications.find(item => item.id === id);
    setNotifications(prev => prev.filter(item => item.id !== id));
    if (current && !current.is_read) setUnreadCount(value => Math.max(0, value - 1));
    try {
      await deleteNotificationById(id);
      await refreshStats();
    } catch {
      await refreshNotifications();
    }
  }, [notifications, refreshNotifications, refreshStats]);

  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'created_at' | 'is_read'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: `local_${Date.now()}`,
      is_read: false,
      status: 'unread',
      created_at: new Date(),
    };
    setNotifications(prev => [newNotif, ...prev]);
    setUnreadCount(value => value + 1);
  }, []);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    refreshNotifications,
    refreshStats,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    addNotification,
  }), [notifications, unreadCount, loading, refreshNotifications, refreshStats, markAsRead, markAllAsRead, deleteNotification, addNotification]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
