import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { getAdminServiceControl, getServiceStatus, updateAdminServiceControl } from '../../lib/api.js';

export type ServiceKey =
  | 'otp_virtual_numbers'
  | 'otp_numbers'
  | 'sms_sender'
  | 'sms_campaigns'
  | 'email_sender'
  | 'email_campaigns'
  | 'developer_api'
  | 'embed_widgets'
  | 'buy_contacts'
  | 'wallet_topup'
  | 'wallet_deposits'
  | 'templates'
  | 'complaints_support';

export interface ServiceSetting {
  key: ServiceKey;
  service_key?: ServiceKey;
  name: string;
  service_name?: string;
  description: string;
  icon: string;
  isEnabled: boolean;
  status: 'available' | 'locked';
  unavailableMessage: string;
  unavailable_message?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ServiceActivityLog {
  id: string;
  adminId: string;
  adminName: string;
  action: 'service_locked' | 'service_unlocked' | 'service_message_updated' | 'lock_service' | 'unlock_service' | 'update_message';
  serviceKey: ServiceKey;
  serviceName: string;
  oldStatus?: string | boolean;
  newStatus?: string | boolean;
  message?: string;
  createdAt: string;
}

const KEY_ALIASES: Partial<Record<ServiceKey, ServiceKey>> = {
  otp_numbers: 'otp_virtual_numbers',
  wallet_deposits: 'wallet_topup',
};

const ICONS: Record<string, string> = {
  otp_virtual_numbers: 'phone',
  sms_sender: 'sms',
  sms_campaigns: 'campaign',
  email_sender: 'email',
  email_campaigns: 'email-campaign',
  developer_api: 'api',
  embed_widgets: 'widgets',
  buy_contacts: 'contacts',
  wallet_topup: 'wallet',
  templates: 'templates',
  complaints_support: 'support',
};

const FALLBACK_SERVICES: ServiceSetting[] = [
  ['otp_virtual_numbers', 'OTP / Virtual Numbers', 'Purchase virtual phone numbers and receive OTP codes for service verification.'],
  ['sms_sender', 'SMS Sender', 'Send individual SMS messages to any phone number worldwide.'],
  ['sms_campaigns', 'Bulk SMS Campaigns', 'Create and manage bulk SMS campaigns to large contact lists.'],
  ['email_sender', 'Email Sender', 'Send individual emails using Gmail or SMTP accounts.'],
  ['email_campaigns', 'Bulk Email Campaigns', 'Create and launch bulk email campaigns with custom templates.'],
  ['developer_api', 'Developer API', 'Programmatic SMS access via VireSend APIs.'],
  ['embed_widgets', 'Embed Widgets', 'Embeddable SMS and email widgets for third-party websites.'],
  ['buy_contacts', 'Buy Contacts / Contact Marketplace', 'Buy curated marketplace contact groups.'],
  ['wallet_topup', 'Wallet Top Up', 'Add funds to your VireSend wallet.'],
  ['templates', 'Templates', 'Create and reuse SMS and email message templates.'],
  ['complaints_support', 'Complaints / Support', 'Create and manage support tickets.'],
].map(([key, name, description]) => ({
  key: key as ServiceKey,
  service_key: key as ServiceKey,
  name,
  service_name: name,
  description,
  icon: ICONS[key] || 'service',
  isEnabled: true,
  status: 'available',
  unavailableMessage: 'This service is temporarily unavailable. Please try again later.',
  unavailable_message: 'This service is temporarily unavailable. Please try again later.',
  updatedBy: 'system',
  updatedAt: new Date().toISOString(),
}));

function normalizeKey(key: ServiceKey): ServiceKey {
  return KEY_ALIASES[key] || key;
}

function normalizeService(service: any): ServiceSetting {
  const key = normalizeKey((service.service_key || service.key) as ServiceKey);
  const status = service.status || (service.isEnabled === false ? 'locked' : 'available');
  return {
    key,
    service_key: key,
    name: service.service_name || service.name || key,
    service_name: service.service_name || service.name || key,
    description: service.description || '',
    icon: ICONS[key] || 'service',
    status,
    isEnabled: status !== 'locked' && service.isEnabled !== false,
    unavailableMessage: service.unavailable_message || service.unavailableMessage || 'This service is temporarily unavailable.',
    unavailable_message: service.unavailable_message || service.unavailableMessage || 'This service is temporarily unavailable.',
    updatedBy: service.updated_by_admin_name || service.updatedBy || 'system',
    updatedAt: service.updated_at || service.updatedAt || new Date().toISOString(),
  };
}

interface ServiceAvailabilityContextValue {
  services: ServiceSetting[];
  activityLogs: ServiceActivityLog[];
  isEnabled: (key: ServiceKey) => boolean;
  getService: (key: ServiceKey) => ServiceSetting | undefined;
  toggleService: (key: ServiceKey, adminName: string) => Promise<void>;
  updateMessage: (key: ServiceKey, message: string, adminName: string) => Promise<void>;
  saveService: (key: ServiceKey, patch: Partial<ServiceSetting>, adminName: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ServiceAvailabilityContext = createContext<ServiceAvailabilityContextValue | null>(null);

export function ServiceAvailabilityProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<ServiceSetting[]>(FALLBACK_SERVICES);
  const [activityLogs, setActivityLogs] = useState<ServiceActivityLog[]>([]);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('viresend_token');
    const user = JSON.parse(localStorage.getItem('viresend_user') || 'null');
    const response = token && user?.role === 'admin' ? await getAdminServiceControl() : await getServiceStatus();
    setServices((response.services || []).map(normalizeService));
    setActivityLogs(response.activity_logs || []);
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const isEnabled = (key: ServiceKey) => {
    const normalized = normalizeKey(key);
    return services.find((service) => service.key === normalized)?.isEnabled ?? true;
  };

  const getService = (key: ServiceKey) => {
    const normalized = normalizeKey(key);
    return services.find((service) => service.key === normalized);
  };

  const saveService = async (key: ServiceKey, patch: Partial<ServiceSetting>) => {
    const normalized = normalizeKey(key);
    const payload = {
      status: patch.status || (patch.isEnabled === false ? 'locked' : patch.isEnabled === true ? 'available' : undefined),
      unavailable_message: patch.unavailableMessage ?? patch.unavailable_message,
      isEnabled: patch.isEnabled,
    };
    const response = await updateAdminServiceControl(normalized, payload);
    const updated = normalizeService(response.service);
    setServices((current) => current.map((service) => (service.key === normalized ? updated : service)));
    await refresh().catch(() => undefined);
  };

  const toggleService = async (key: ServiceKey) => {
    const service = getService(key);
    if (!service) return;
    await saveService(key, { isEnabled: !service.isEnabled, unavailableMessage: service.unavailableMessage });
  };

  const updateMessage = async (key: ServiceKey, message: string) => {
    const service = getService(key);
    await saveService(key, { isEnabled: service?.isEnabled, unavailableMessage: message });
  };

  return (
    <ServiceAvailabilityContext.Provider value={{ services, activityLogs, isEnabled, getService, toggleService, updateMessage, saveService, refresh }}>
      {children}
    </ServiceAvailabilityContext.Provider>
  );
}

export function useServiceAvailability() {
  const ctx = useContext(ServiceAvailabilityContext);
  if (!ctx) throw new Error('useServiceAvailability must be used within ServiceAvailabilityProvider');
  return ctx;
}
