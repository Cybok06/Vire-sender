import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Copy, RefreshCw, XCircle, CheckCircle, Clock, Timer,
  PhoneCall, ArrowLeft, AlertTriangle
} from 'lucide-react';
import { MOCK_ORDERS } from '../../data/mockData';
import { toast } from 'sonner';
import { useOtpSession } from '../../contexts/OtpSessionContext';
import { safeClipboardCopy } from '../../utils/clipboard';

type SessionStatus = 'waiting' | 'received' | 'expired' | 'cancelled';

const TOTAL_SECONDS = 20 * 60; // 20 minutes

function generateNumber(country: string): string {
  const prefixes: Record<string, string> = {
    US: '+1 (555)', GB: '+44 79', RU: '+7 916', DE: '+49 151',
    FR: '+33 6', IN: '+91 98', NG: '+234 80', GH: '+233 24',
    KE: '+254 72', CA: '+1 (416)', AU: '+61 4', BR: '+55 11',
  };
  const prefix = prefixes[country] || '+1 (555)';
  const num = Math.floor(Math.random() * 9000000 + 1000000);
  return `${prefix} ${num.toString().slice(0, 3)}-${num.toString().slice(3)}`;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function OtpSessionPage() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { setOtpStatus } = useOtpSession();

  const state = location.state as {
    service?: { name: string; emoji: string };
    country?: { name: string; flag: string; code: string };
    price?: number;
    orderId?: string;
  } | null;

  // Use mock data if no state (direct navigation)
  const activeOrder = MOCK_ORDERS.find(o => o.status === 'active');
  const sessionService = state?.service ?? { name: activeOrder?.service || 'WhatsApp', emoji: activeOrder?.serviceEmoji || '💬' };
  const sessionCountry = state?.country ?? { name: activeOrder?.country || 'Russia', flag: activeOrder?.countryFlag || '🇷🇺', code: activeOrder?.country || 'RU' };
  const orderId = state?.orderId ?? activeOrder?.id ?? 'ORD-002';

  const [phoneNumber] = useState(() => generateNumber(sessionCountry.code));
  const [status, setStatus] = useState<SessionStatus>('waiting');
  const [otp, setOtp] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [refreshCount, setRefreshCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Keep sidebar badge in sync with local session status
  useEffect(() => {
    if (status === 'waiting') {
      setOtpStatus('waiting');
    } else if (status === 'received') {
      setOtpStatus('received');
    } else {
      // expired / cancelled — clear the badge
      setOtpStatus('idle');
    }
  }, [status, setOtpStatus]);

  // Clear badge when leaving the page
  useEffect(() => {
    return () => {
      // Only clear if OTP was already received (user has seen it)
      // Keep badge if still waiting so user knows to come back
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (status !== 'waiting') return;
    if (timeLeft <= 0) {
      setStatus('expired');
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { setStatus('expired'); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, timeLeft]);

  // Simulate OTP reception after 6 seconds
  useEffect(() => {
    if (status !== 'waiting') return;
    const timeout = setTimeout(() => {
      const generatedOtp = generateOTP();
      setOtp(generatedOtp);
      setStatus('received');
      toast.success(`OTP received: ${generatedOtp}`, { duration: 5000 });
    }, 6000);
    return () => clearTimeout(timeout);
  }, [status, refreshCount]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const progressPercent = (timeLeft / TOTAL_SECONDS) * 100;

  const copyToClipboard = useCallback((text: string, label: string) => {
    safeClipboardCopy(text);
    toast.success(`${label} copied!`);
  }, []);

  const handleRefresh = async () => {
    if (status === 'received' || status === 'expired') return;
    setRefreshing(true);
    setOtp(null);
    setStatus('waiting');
    setRefreshCount(c => c + 1);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
    toast.info('Refreshed — waiting for new OTP...');
  };

  const handleCancel = async () => {
    setCancelling(true);
    await new Promise(r => setTimeout(r, 800));
    setStatus('cancelled');
    toast.info('Session cancelled. Refund processed.');
    setTimeout(() => navigate('/user/orders'), 2000);
  };

  const statusConfig = {
    waiting: {
      label: 'Waiting for OTP',
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-200',
      icon: <Timer className="w-4 h-4 text-amber-500 animate-pulse" />,
      dot: 'bg-amber-400 animate-pulse',
    },
    received: {
      label: 'OTP Received!',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 border-emerald-200',
      icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
      dot: 'bg-emerald-500',
    },
    expired: {
      label: 'Session Expired',
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      dot: 'bg-red-500',
    },
    cancelled: {
      label: 'Session Cancelled',
      color: 'text-gray-500',
      bg: 'bg-gray-50 border-gray-200',
      icon: <XCircle className="w-4 h-4 text-gray-400" />,
      dot: 'bg-gray-400',
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl text-gray-800 flex items-center gap-2" style={{ fontWeight: 700 }}>
              OTP Session
              <span className="text-lg">{sessionService.emoji}</span>
              <span className="text-base text-gray-500" style={{ fontWeight: 400 }}>{sessionService.name}</span>
            </h1>
            <p className="text-gray-400 text-sm">{orderId} • {sessionCountry.flag} {sessionCountry.name}</p>
          </div>
        </div>

        {/* Main session card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Status header */}
          <div className={`px-6 py-4 border-b flex items-center justify-between ${cfg.bg}`}>
            <div className="flex items-center gap-2.5">
              {cfg.icon}
              <span className={`text-sm ${cfg.color}`} style={{ fontWeight: 600 }}>{cfg.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className="text-xs text-gray-500">Session: {orderId}</span>
            </div>
          </div>

          <div className="p-6">
            {/* Phone number */}
            <div className="text-center mb-8">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3" style={{ fontWeight: 600 }}>
                Your Virtual Number
              </div>
              <div className="flex items-center justify-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <PhoneCall className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="font-mono text-3xl text-gray-800" style={{ fontWeight: 700 }}>
                    {phoneNumber}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Use this number for verification</div>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(phoneNumber, 'Number')}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-gray-600 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Number
              </button>
            </div>

            {/* Timer */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  Time remaining
                </div>
                <span className={`font-mono text-lg ${
                  timeLeft < 120 ? 'text-red-500' : timeLeft < 300 ? 'text-amber-500' : 'text-gray-700'
                }`} style={{ fontWeight: 700 }}>
                  {status === 'expired' || status === 'cancelled' ? '00:00' : formatTime(timeLeft)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    timeLeft < 120 ? 'bg-red-500' : timeLeft < 300 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${status === 'expired' ? 0 : progressPercent}%`, transition: 'width 1s linear' }}
                />
              </div>
              {timeLeft < 300 && status === 'waiting' && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Session expiring soon
                </p>
              )}
            </div>

            {/* OTP Display */}
            <div className={`rounded-2xl border-2 p-8 text-center transition-all ${
              status === 'received'
                ? 'border-emerald-300 bg-emerald-50'
                : status === 'waiting'
                ? 'border-dashed border-gray-200 bg-gray-50'
                : 'border-gray-200 bg-gray-50'
            }`}>
              {status === 'waiting' && !refreshing && (
                <>
                  <div className="flex justify-center gap-2 mb-3">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="w-10 h-14 bg-white border-2 border-gray-200 rounded-xl flex items-center justify-center">
                        <div className="w-2 h-2 bg-gray-200 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 text-sm">Waiting for OTP code...</p>
                  <p className="text-gray-300 text-xs mt-1">This usually takes a few seconds</p>
                </>
              )}
              {refreshing && (
                <div className="py-4">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Refreshing session...</p>
                </div>
              )}
              {status === 'received' && otp && (
                <>
                  <div className="text-xs text-emerald-600 mb-3 uppercase tracking-wider" style={{ fontWeight: 600 }}>
                    ✅ OTP Code Received
                  </div>
                  <div className="flex justify-center gap-2 mb-4">
                    {otp.split('').map((digit, i) => (
                      <div key={i} className="w-12 h-16 bg-white border-2 border-emerald-300 rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>{digit}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => copyToClipboard(otp, 'OTP code')}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy OTP Code
                  </button>
                </>
              )}
              {(status === 'expired' || status === 'cancelled') && (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    {status === 'expired' ? <AlertTriangle className="w-8 h-8 text-red-400" /> : <XCircle className="w-8 h-8 text-gray-400" />}
                  </div>
                  <p className="text-gray-600" style={{ fontWeight: 500 }}>
                    {status === 'expired' ? 'Session has expired' : 'Session was cancelled'}
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    {status === 'expired' ? 'No OTP received in time.' : 'Refund has been processed.'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {(status === 'waiting' || status === 'received') && (
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing || status === 'received'}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-blue-700 py-3 rounded-xl text-sm transition-all"
                style={{ fontWeight: 500 }}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 flex items-center justify-center gap-2 border border-red-200 hover:border-red-300 hover:bg-red-50 disabled:opacity-40 text-red-500 hover:text-red-700 py-3 rounded-xl text-sm transition-all"
                style={{ fontWeight: 500 }}
              >
                <XCircle className="w-4 h-4" />
                {cancelling ? 'Cancelling...' : 'Cancel Session'}
              </button>
            </div>
          )}
          {(status === 'expired' || status === 'cancelled') && (
            <div className="px-6 pb-6">
              <button
                onClick={() => navigate('/user/buy-number')}
                className="w-full bg-blue-900 hover:bg-blue-800 text-white py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                Buy Another Number
              </button>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h3 className="text-blue-800 text-sm mb-2" style={{ fontWeight: 600 }}>How it works</h3>
          <ol className="space-y-1.5 text-blue-700 text-xs list-decimal list-inside">
            <li>Copy the virtual number above</li>
            <li>Use it for verification in {sessionService.name}</li>
            <li>The OTP will appear here automatically</li>
            <li>Copy and enter the OTP in {sessionService.name}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

