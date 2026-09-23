import { useState } from 'react';
import {
  Lock, Unlock, Shield, CheckCircle, XCircle, Save,
  Activity, Clock, Filter, ToggleLeft, ToggleRight, AlertTriangle,
  Hash, Send, Megaphone, Mail, Code2, Globe, CreditCard, Layers
} from 'lucide-react';
import { useServiceAvailability, ServiceKey, ServiceSetting } from '../../contexts/ServiceAvailabilityContext';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

// ─── Brand ────────────────────────────────────────────────────────────────────
const PRIMARY  = '#2563EB';
const NAVY     = '#1e3a5f';
const SUCCESS  = '#10B981';
const DANGER   = '#EF4444';
const WARNING  = '#F59E0B';
const SLATE    = '#64748B';
const DARK     = '#0F172A';

// ─── Service icon map ─────────────────────────────────────────────────────────
const SERVICE_ICONS: Record<ServiceKey, React.ReactNode> = {
  otp_virtual_numbers: <Hash      size={20} />,
  otp_numbers:     <Hash      size={20} />,
  sms_sender:      <Send      size={20} />,
  sms_campaigns:   <Megaphone size={20} />,
  email_sender:    <Mail      size={20} />,
  email_campaigns: <Layers    size={20} />,
  developer_api:   <Code2     size={20} />,
  embed_widgets:   <Globe     size={20} />,
  buy_contacts:    <Layers size={20} />,
  wallet_topup:    <CreditCard size={20} />,
  wallet_deposits: <CreditCard size={20} />,
  templates:       <Layers size={20} />,
  complaints_support: <Shield size={20} />,
};

const SERVICE_COLORS: Record<ServiceKey, string> = {
  otp_virtual_numbers: '#8B5CF6',
  otp_numbers:     '#8B5CF6',
  sms_sender:      PRIMARY,
  sms_campaigns:   '#0EA5E9',
  email_sender:    '#F59E0B',
  email_campaigns: '#EC4899',
  developer_api:   '#10B981',
  embed_widgets:   '#6366F1',
  buy_contacts:    '#14B8A6',
  wallet_topup:    '#F97316',
  wallet_deposits: '#F97316',
  templates:       '#7C3AED',
  complaints_support: '#64748B',
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: number; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-5 flex items-center gap-4"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div className="text-2xl" style={{ color: DARK, fontWeight: 800 }}>{value}</div>
        <div className="text-sm" style={{ color: DARK, fontWeight: 600 }}>{label}</div>
        <div className="text-xs" style={{ color: SLATE }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────
function ServiceCard({ service, onSave }: {
  service: ServiceSetting;
  onSave: (key: ServiceKey, patch: Partial<ServiceSetting>) => Promise<void>;
}) {
  const [localEnabled, setLocalEnabled] = useState(service.isEnabled);
  const [localMessage, setLocalMessage] = useState(service.unavailableMessage);
  const [dirty, setDirty] = useState(false);

  const color = SERVICE_COLORS[service.key];
  const hasChanges = localEnabled !== service.isEnabled || localMessage !== service.unavailableMessage;

  const handleToggle = () => {
    setLocalEnabled(p => !p);
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await onSave(service.key, { isEnabled: localEnabled, unavailableMessage: localMessage });
      setDirty(false);
      toast.success(`${service.name} ${localEnabled ? 'unlocked' : 'locked'} successfully`);
    } catch (error: any) {
      toast.error(error?.message || 'Unable to update service.');
    }
  };

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all"
      style={{
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        border: `1px solid ${!localEnabled ? `${DANGER}30` : 'rgba(0,0,0,0.05)'}`,
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center gap-4"
        style={{
          background: !localEnabled
            ? `linear-gradient(135deg, ${DANGER}08, ${DANGER}04)`
            : `linear-gradient(135deg, ${color}08, ${color}04)`,
          borderBottom: `1px solid ${!localEnabled ? `${DANGER}15` : 'rgba(0,0,0,0.04)'}`,
        }}
      >
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: !localEnabled ? `${DANGER}15` : `${color}15` }}
        >
          <span style={{ color: !localEnabled ? DANGER : color }}>
            {SERVICE_ICONS[service.key]}
          </span>
        </div>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>{service.name}</span>
            {/* Status badge */}
            <span
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
              style={{
                background: localEnabled ? `${SUCCESS}15` : `${DANGER}15`,
                color: localEnabled ? SUCCESS : DANGER,
                fontWeight: 700,
              }}
            >
              {localEnabled
                ? <><CheckCircle size={10} /> Available</>
                : <><XCircle size={10} /> Locked</>}
            </span>
            {dirty && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${WARNING}20`, color: WARNING, fontWeight: 600 }}>
                Unsaved
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: SLATE }}>{service.description}</p>
        </div>

        {/* Toggle */}
        <button
          onClick={handleToggle}
          className="flex-shrink-0 transition-all hover:scale-110 active:scale-95"
          title={localEnabled ? 'Click to lock service' : 'Click to unlock service'}
        >
          {localEnabled
            ? <ToggleRight size={36} style={{ color: SUCCESS }} />
            : <ToggleLeft  size={36} style={{ color: '#CBD5E1' }} />}
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Unavailable message textarea */}
        <div>
          <label className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: DARK, fontWeight: 700 }}>
            <AlertTriangle size={12} style={{ color: WARNING }} />
            Custom Unavailable Message
          </label>
          <textarea
            rows={2}
            value={localMessage}
            onChange={e => { setLocalMessage(e.target.value); setDirty(true); }}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
            style={{
              border: '1.5px solid #e2e8f0',
              fontFamily: 'inherit',
              color: DARK,
              lineHeight: '1.5',
            }}
            placeholder="Enter the message users will see when this service is locked..."
            onFocus={e => (e.currentTarget.style.borderColor = PRIMARY)}
            onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
          />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs" style={{ color: SLATE }}>
            <Clock size={11} className="inline mr-1" />
            Updated by <span style={{ color: DARK, fontWeight: 600 }}>{service.updatedBy}</span>
            {' · '}
            {new Date(service.updatedAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all"
            style={{
              background: hasChanges ? (localEnabled ? SUCCESS : DANGER) : '#f1f5f9',
              color: hasChanges ? 'white' : '#94a3b8',
              fontWeight: 700,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
              boxShadow: hasChanges ? `0 4px 12px ${localEnabled ? SUCCESS : DANGER}30` : 'none',
            }}
          >
            {localEnabled ? <Unlock size={13} /> : <Lock size={13} />}
            {localEnabled ? 'Save & Unlock' : 'Save & Lock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log Row ─────────────────────────────────────────────────────────
function LogRow({ log }: { log: any }) {
  const isLock   = log.action === 'lock_service' || log.action === 'service_locked';
  const isUnlock = log.action === 'unlock_service' || log.action === 'service_unlocked';
  const isMsg    = log.action === 'update_message' || log.action === 'service_message_updated';

  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      <div
        className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: isLock ? `${DANGER}15` : isUnlock ? `${SUCCESS}15` : `${PRIMARY}15`,
        }}
      >
        {isLock   && <Lock    size={13} style={{ color: DANGER   }} />}
        {isUnlock && <Unlock  size={13} style={{ color: SUCCESS  }} />}
        {isMsg    && <Save    size={13} style={{ color: PRIMARY  }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: DARK, fontWeight: 600 }}>
          {isLock   && `${log.adminName} locked ${log.serviceName}`}
          {isUnlock && `${log.adminName} unlocked ${log.serviceName}`}
          {isMsg    && `${log.adminName} updated unavailable message for ${log.serviceName}`}
        </div>
        {log.message && (
          <div className="text-xs mt-0.5 truncate" style={{ color: SLATE }}>
            Message: "{log.message}"
          </div>
        )}
      </div>
      <div className="text-xs flex-shrink-0" style={{ color: SLATE }}>
        {new Date(log.createdAt).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type Filter = 'all' | 'available' | 'locked';

export default function AdminServiceControl() {
  const { services, activityLogs, saveService } = useServiceAvailability();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [showLogs, setShowLogs] = useState(false);

  const adminName = user?.name || 'admin';

  const totalServices     = services.length;
  const availableServices = services.filter(s => s.isEnabled).length;
  const lockedServices    = services.filter(s => !s.isEnabled).length;

  const filtered = services.filter(s => {
    if (filter === 'available') return s.isEnabled;
    if (filter === 'locked')    return !s.isEnabled;
    return true;
  });

  const handleSave = async (key: ServiceKey, patch: Partial<ServiceSetting>) => {
    await saveService(key, patch, adminName);
  };

  return (
    <div className="p-5 lg:p-7" style={{ fontFamily: "'Poppins','Inter',sans-serif", background: '#F8FAFF', minHeight: '100%' }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${DANGER}15` }}>
              <Shield size={18} style={{ color: DANGER }} />
            </div>
            <h1 className="text-2xl" style={{ color: DARK, fontWeight: 800 }}>Service Availability Control</h1>
          </div>
          <p className="text-sm ml-11" style={{ color: SLATE }}>
            Lock or unlock platform services. Locked services show a custom unavailable message to users.
          </p>
        </div>

        <button
          onClick={() => setShowLogs(p => !p)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all hover:opacity-90 flex-shrink-0"
          style={{
            background: showLogs ? `${PRIMARY}10` : 'white',
            border: `1.5px solid ${showLogs ? PRIMARY : '#e2e8f0'}`,
            color: showLogs ? PRIMARY : SLATE,
            fontWeight: 600,
          }}
        >
          <Activity size={15} />
          Activity Log
          {activityLogs.length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: PRIMARY, color: 'white', fontWeight: 700 }}
            >
              {activityLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Services"
          value={totalServices}
          sub="Managed by this panel"
          color={PRIMARY}
          icon={<Shield size={22} />}
        />
        <StatCard
          label="Available Services"
          value={availableServices}
          sub="Currently active"
          color={SUCCESS}
          icon={<CheckCircle size={22} />}
        />
        <StatCard
          label="Locked Services"
          value={lockedServices}
          sub={lockedServices > 0 ? 'Users are blocked' : 'All services running'}
          color={lockedServices > 0 ? DANGER : SLATE}
          icon={<Lock size={22} />}
        />
      </div>

      {/* Warning banner if any locked */}
      {lockedServices > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-5"
          style={{ background: `${DANGER}08`, border: `1.5px solid ${DANGER}25` }}
        >
          <AlertTriangle size={16} style={{ color: DANGER, flexShrink: 0 }} />
          <p className="text-sm" style={{ color: '#7f1d1d', fontWeight: 500 }}>
            <span style={{ fontWeight: 700 }}>{lockedServices} service{lockedServices > 1 ? 's are' : ' is'} currently locked.</span>
            {' '}Users attempting to access locked services will see the custom unavailable message.
          </p>
        </div>
      )}

      <div className={`grid gap-6 ${showLogs ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
        {/* Left: service cards */}
        <div className={showLogs ? 'lg:col-span-2' : ''}>
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4">
            <Filter size={14} style={{ color: SLATE }} />
            <span className="text-sm mr-1" style={{ color: SLATE, fontWeight: 600 }}>Filter:</span>
            {(['all', 'available', 'locked'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3.5 py-1.5 rounded-xl text-sm capitalize transition-all"
                style={{
                  background: filter === f ? PRIMARY : 'white',
                  color: filter === f ? 'white' : SLATE,
                  border: `1.5px solid ${filter === f ? PRIMARY : '#e2e8f0'}`,
                  fontWeight: filter === f ? 700 : 500,
                  boxShadow: filter === f ? `0 2px 8px ${PRIMARY}30` : 'none',
                }}
              >
                {f === 'all' ? `All (${totalServices})` : f === 'available' ? `Available (${availableServices})` : `Locked (${lockedServices})`}
              </button>
            ))}
          </div>

          {/* Cards grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map(service => (
              <ServiceCard key={service.key} service={service} onSave={handleSave} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: SLATE }}>
              <Shield size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No services match this filter.</p>
            </div>
          )}
        </div>

        {/* Right: activity log */}
        {showLogs && (
          <div
            className="bg-white rounded-2xl p-5"
            style={{
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              border: '1px solid rgba(0,0,0,0.05)',
              height: 'fit-content',
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} style={{ color: PRIMARY }} />
              <span className="text-sm" style={{ color: DARK, fontWeight: 700 }}>Activity Log</span>
              <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 700 }}>
                {activityLogs.length} events
              </span>
            </div>

            {activityLogs.length === 0 ? (
              <div className="text-center py-8">
                <Clock size={28} className="mx-auto mb-2 opacity-20" style={{ color: SLATE }} />
                <p className="text-sm" style={{ color: SLATE }}>No activity yet.</p>
                <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>Lock or unlock a service to see logs here.</p>
              </div>
            ) : (
              <div className="space-y-0 max-h-[520px] overflow-y-auto">
                {activityLogs.map(log => <LogRow key={log.id} log={log} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


