import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  createEmbedWidget,
  deleteEmbedWidget,
  disableAdminEmbedWidget,
  disableEmbedWidget,
  enableAdminEmbedWidget,
  enableEmbedWidget,
  getAdminEmbedWidgetLogs,
  getAdminEmbedWidgetStats,
  getAdminEmbedWidgets,
  getEmbedWidgetLogs,
  getEmbedWidgetStats,
  getEmbedWidgets,
  updateEmbedWidget,
} from '../../lib/api';
import { useAuth } from './AuthContext';

export type WidgetType = 'sms' | 'email' | 'combined';
export type WidgetStatus = 'active' | 'disabled' | 'pending';

export interface EmbedWidget {
  id: string;
  token: string;
  name: string;
  type: WidgetType;
  status: WidgetStatus;
  allowedDomains: string;
  requireLogin: boolean;
  enableCaptcha: boolean;
  defaultSenderId: string;
  defaultEmailAccountId?: string;
  allowedContactGroups: string;
  successRedirectUrl: string;
  webhookUrl: string;
  totalSends: number;
  totalSmsSends?: number;
  totalEmailSends?: number;
  totalCost: number;
  createdAt: string;
  lastUsed: string;
  userId: string;
  userName: string;
  theme?: {
    primary_color?: string;
    background_color?: string;
    button_text?: string;
    show_branding?: boolean;
  };
}

export interface WidgetLog {
  id: string;
  widgetId: string;
  widgetName: string;
  type: 'sms' | 'email';
  action?: string;
  recipient: string;
  status: 'delivered' | 'sent' | 'failed' | 'pending' | 'blocked';
  cost: number;
  date: string;
  domain: string;
  failure_reason?: string;
}

interface EmbedWidgetsCtx {
  widgets: EmbedWidget[];
  logs: WidgetLog[];
  stats: any;
  loading: boolean;
  refresh: () => Promise<void>;
  createWidget: (data: Partial<EmbedWidget>) => Promise<EmbedWidget>;
  updateWidget: (id: string, data: Partial<EmbedWidget>) => Promise<EmbedWidget>;
  deleteWidget: (id: string) => Promise<void>;
  toggleWidgetStatus: (id: string) => Promise<EmbedWidget>;
  getWidget: (id: string) => EmbedWidget | undefined;
}

const EmbedWidgetsContext = createContext<EmbedWidgetsCtx | null>(null);

function normalizeWidget(widget: any): EmbedWidget {
  return {
    id: widget.id || widget.widget_id,
    token: widget.token || '',
    name: widget.name || 'Untitled Widget',
    type: widget.type || 'sms',
    status: widget.status || 'disabled',
    allowedDomains: widget.allowedDomains ?? (widget.allowed_domains || []).join(', '),
    requireLogin: Boolean(widget.requireLogin ?? widget.require_visitor_login),
    enableCaptcha: Boolean(widget.enableCaptcha ?? widget.captcha_enabled),
    defaultSenderId: widget.defaultSenderId ?? widget.default_sender_id ?? 'VireSend',
    defaultEmailAccountId: widget.defaultEmailAccountId ?? widget.default_email_account_id ?? '',
    allowedContactGroups: widget.allowedContactGroups ?? (widget.allowed_contact_groups || []).join(', '),
    successRedirectUrl: widget.successRedirectUrl ?? widget.success_redirect_url ?? '',
    webhookUrl: widget.webhookUrl ?? widget.webhook_callback_url ?? '',
    totalSends: Number(widget.totalSends ?? widget.total_sends ?? 0),
    totalSmsSends: Number(widget.totalSmsSends ?? widget.total_sms_sends ?? 0),
    totalEmailSends: Number(widget.totalEmailSends ?? widget.total_email_sends ?? 0),
    totalCost: Number(widget.totalCost ?? widget.total_cost ?? 0),
    createdAt: widget.createdAt || widget.created_at || '',
    lastUsed: widget.lastUsed || widget.last_used_at || 'Never',
    userId: widget.userId || widget.user_id || '',
    userName: widget.userName || widget.user || widget.user_email || 'User',
    theme: widget.theme || {},
  };
}

function normalizeLog(log: any): WidgetLog {
  return {
    id: log.id || log.log_id,
    widgetId: log.widgetId || log.widget_id,
    widgetName: log.widgetName || log.widget_name || '',
    type: log.type || (String(log.action || '').includes('email') ? 'email' : 'sms'),
    action: log.action || '',
    recipient: log.recipient || '',
    status: log.status || 'pending',
    cost: Number(log.cost || 0),
    date: log.date || log.created_at || '',
    domain: log.domain || log.origin_domain || 'Unknown',
    failure_reason: log.failure_reason || '',
  };
}

export function EmbedWidgetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<EmbedWidget[]>([]);
  const [logs, setLogs] = useState<WidgetLog[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const isAdminRoute = useMemo(() => window.location.pathname.startsWith('/admin'), []);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [widgetsData, logsData, statsData] = await Promise.all([
        isAdminRoute ? getAdminEmbedWidgets() : getEmbedWidgets(),
        isAdminRoute ? getAdminEmbedWidgetLogs() : getEmbedWidgetLogs(),
        isAdminRoute ? getAdminEmbedWidgetStats() : getEmbedWidgetStats(),
      ]);
      setWidgets((widgetsData.widgets || []).map(normalizeWidget));
      setLogs((logsData.logs || []).map(normalizeLog));
      setStats(statsData.stats || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [user?.id]);

  const createWidget = async (data: Partial<EmbedWidget>) => {
    const response = await createEmbedWidget(data);
    const widget = normalizeWidget(response.widget);
    setWidgets(prev => [widget, ...prev.filter(item => item.id !== widget.id)]);
    return widget;
  };

  const updateWidget = async (id: string, data: Partial<EmbedWidget>) => {
    const response = await updateEmbedWidget(id, data);
    const widget = normalizeWidget(response.widget);
    setWidgets(prev => prev.map(item => item.id === id ? widget : item));
    return widget;
  };

  const deleteWidget = async (id: string) => {
    await deleteEmbedWidget(id);
    setWidgets(prev => prev.filter(item => item.id !== id));
  };

  const toggleWidgetStatus = async (id: string) => {
    const current = widgets.find(item => item.id === id);
    const response = current?.status === 'active'
      ? await (isAdminRoute ? disableAdminEmbedWidget(id) : disableEmbedWidget(id))
      : await (isAdminRoute ? enableAdminEmbedWidget(id) : enableEmbedWidget(id));
    const widget = normalizeWidget(response.widget);
    setWidgets(prev => prev.map(item => item.id === id ? widget : item));
    return widget;
  };

  const getWidget = (id: string) => widgets.find(w => w.id === id);

  return (
    <EmbedWidgetsContext.Provider value={{ widgets, logs, stats, loading, refresh, createWidget, updateWidget, deleteWidget, toggleWidgetStatus, getWidget }}>
      {children}
    </EmbedWidgetsContext.Provider>
  );
}

export function useEmbedWidgets() {
  const ctx = useContext(EmbedWidgetsContext);
  if (!ctx) throw new Error('useEmbedWidgets must be used within EmbedWidgetsProvider');
  return ctx;
}
