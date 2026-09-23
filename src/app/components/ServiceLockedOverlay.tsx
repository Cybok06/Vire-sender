import { useNavigate } from 'react-router';
import { Lock, ArrowLeft, LifeBuoy, AlertTriangle } from 'lucide-react';
import type { ServiceKey } from '../contexts/ServiceAvailabilityContext';
import { useServiceAvailability } from '../contexts/ServiceAvailabilityContext';

const PRIMARY   = '#2563EB';
const DEEP_NAVY = '#06142B';
const DARK_NAVY = '#0B1F3F';
const CYAN      = '#0EA5E9';
const DANGER    = '#EF4444';

interface ServiceLockedOverlayProps {
  serviceKey: ServiceKey;
}

export function ServiceLockedOverlay({ serviceKey }: ServiceLockedOverlayProps) {
  const navigate = useNavigate();
  const { getService } = useServiceAvailability();
  const service = getService(serviceKey);

  return (
    <div
      className="flex-1 flex items-center justify-center p-6 min-h-[calc(100vh-64px)]"
      style={{ background: '#F1F5F9', fontFamily: "'Poppins','Inter',sans-serif" }}
    >
      <div className="w-full max-w-lg">
        {/* Card */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'white',
            boxShadow: '0 20px 60px rgba(0,0,0,0.10)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {/* Top banner */}
          <div
            className="relative px-8 pt-10 pb-8 flex flex-col items-center text-center overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 100%)` }}
          >
            {/* Decorative blobs */}
            <div
              className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10"
              style={{ background: DANGER, filter: 'blur(32px)' }}
            />
            <div
              className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full opacity-10"
              style={{ background: CYAN, filter: 'blur(32px)' }}
            />

            {/* Lock icon */}
            <div
              className="relative w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: `${DANGER}20`, border: `2px solid ${DANGER}40` }}
            >
              <Lock size={36} style={{ color: DANGER }} />
              {/* Pulse ring */}
              <span
                className="absolute inset-0 rounded-2xl animate-ping opacity-20"
                style={{ background: DANGER }}
              />
            </div>

            <h1 className="text-2xl text-white mb-2" style={{ fontWeight: 800 }}>
              Service Temporarily Unavailable
            </h1>
            {service && (
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm mb-3"
                style={{ background: `${DANGER}25`, color: '#fca5a5' }}
              >
                <span style={{ fontSize: 16 }}>{service.icon}</span>
                <span style={{ fontWeight: 600 }}>{service.name}</span>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="px-8 py-7">
            {/* Warning message */}
            <div
              className="flex items-start gap-3 p-4 rounded-2xl mb-6"
              style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA' }}
            >
              <AlertTriangle size={18} style={{ color: '#F97316', flexShrink: 0, marginTop: 1 }} />
              <p className="text-sm leading-relaxed" style={{ color: '#7C2D12' }}>
                {service?.unavailableMessage ||
                  'This service is currently unavailable. Please try again later or contact support.'}
              </p>
            </div>

            {/* Info line */}
            <p className="text-sm text-center mb-6" style={{ color: '#94a3b8' }}>
              This restriction has been applied by the platform administrator.
              If you believe this is an error, please contact support.
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/user/dashboard')}
                className="flex-1 flex items-center justify-center gap-2 text-white py-3 rounded-xl text-sm transition-all hover:opacity-90 hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${PRIMARY}, #1D4ED8)`,
                  fontWeight: 700,
                  boxShadow: `0 4px 14px rgba(37,99,235,0.35)`,
                }}
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
              <button
                onClick={() => navigate('/user/support')}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-all hover:bg-slate-50"
                style={{
                  border: '1.5px solid #e2e8f0',
                  color: '#64748b',
                  fontWeight: 600,
                }}
              >
                <LifeBuoy size={16} />
                Contact Support
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs mt-4" style={{ color: '#94a3b8' }}>
          Service status is managed by VireSend administrators.
          Restrictions are typically temporary.
        </p>
      </div>
    </div>
  );
}


