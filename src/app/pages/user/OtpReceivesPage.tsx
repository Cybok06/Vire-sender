import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Copy, Loader2, Phone, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cancelOtpOrder, checkOtpSms, getOtpOrders } from '../../../lib/api.js';
import { formatCurrency } from '../../utils/currency';
import { playNotificationSound } from '../../utils/notificationSound';

type OtpOrder = {
  id: string;
  service_name: string;
  service_code: string;
  service_image_url: string;
  country_name: string;
  country_code: string;
  country_flag_image: string;
  phone_number: string;
  otp_code: string;
  price: number;
  currency: string;
  status: 'processing' | 'waiting' | 'received' | 'expired' | 'cancelled' | 'failed';
  expires_at: string | null;
  received_at: string | null;
  created_at: string | null;
};

function timeLeft(expiresAt: string | null) {
  if (!expiresAt) return '0:00';
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function statusStyles(status: string) {
  if (status === 'received') return 'bg-emerald-100 text-emerald-700';
  if (status === 'processing') return 'bg-indigo-100 text-indigo-700';
  if (status === 'waiting') return 'bg-amber-100 text-amber-700';
  if (status === 'cancelled') return 'bg-gray-100 text-gray-600';
  return 'bg-red-100 text-red-600';
}

function dateLabel(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OtpReceivesPage() {
  const [orders, setOrders] = useState<OtpOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState('');
  const [checkingId, setCheckingId] = useState('');
  const [, setTick] = useState(0);
  const announcedOtpRef = useRef<Set<string>>(new Set());

  const otpAnnouncementKey = useCallback((order: OtpOrder) => (
    order.otp_code ? `${order.id}:${order.otp_code}` : ''
  ), []);

  const shouldAnnounceOtp = useCallback((previous: OtpOrder | undefined, next: OtpOrder) => {
    if (!next.otp_code || next.status !== 'received') return false;
    const key = otpAnnouncementKey(next);
    if (!key || announcedOtpRef.current.has(key)) return false;
    const statusChanged = previous?.status && previous.status !== 'received';
    const codeFirstAppeared = !previous?.otp_code;
    return Boolean(statusChanged || codeFirstAppeared);
  }, [otpAnnouncementKey]);

  const announceOtpReceived = useCallback((order: OtpOrder) => {
    const key = otpAnnouncementKey(order);
    if (!key || announcedOtpRef.current.has(key)) return;
    announcedOtpRef.current.add(key);
    playNotificationSound();
    toast.success('OTP received successfully');
  }, [otpAnnouncementKey]);

  const mergeUpdatedOrder = useCallback((updatedOrder: OtpOrder) => {
    setOrders(prev => {
      const previous = prev.find(item => item.id === updatedOrder.id);
      if (shouldAnnounceOtp(previous, updatedOrder)) {
        announceOtpReceived(updatedOrder);
      }
      return prev.map(item => item.id === updatedOrder.id ? updatedOrder : item);
    });
  }, [announceOtpReceived, shouldAnnounceOtp]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await getOtpOrders();
      const nextOrders = response.orders || [];
      nextOrders.forEach((order: OtpOrder) => {
        const key = otpAnnouncementKey(order);
        if (key && order.status === 'received') announcedOtpRef.current.add(key);
      });
      setOrders(nextOrders);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load OTP numbers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const waiting = orders.filter(order => order.status === 'waiting' && order.expires_at && new Date(order.expires_at).getTime() > Date.now());
      for (const order of waiting.slice(0, 5)) {
        try {
          const response = await checkOtpSms(order.id);
          if (response.order) {
            mergeUpdatedOrder(response.order);
          }
        } catch {
          // Keep polling quiet; manual refresh still surfaces load errors.
        }
      }
    }, 7000);
    return () => window.clearInterval(timer);
  }, [orders]);

  const activeCount = useMemo(() => orders.filter(order => ['processing', 'waiting', 'received'].includes(order.status) && order.expires_at && new Date(order.expires_at).getTime() > Date.now()).length, [orders]);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const cancelOrder = async (orderId: string) => {
    try {
      setCancellingId(orderId);
      const response = await cancelOtpOrder(orderId);
      setOrders(prev => prev.map(order => order.id === orderId ? response.order : order));
      toast.success(response.message || 'OTP order cancelled.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to cancel OTP order.');
    } finally {
      setCancellingId('');
    }
  };

  const checkSms = async (orderId: string) => {
    try {
      setCheckingId(orderId);
      const response = await checkOtpSms(orderId);
      if (response.order) {
        mergeUpdatedOrder(response.order);
      }
      if (response.status !== 'received') {
        toast.success(response.message || 'Still waiting for SMS.');
      }
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to check SMS.');
    } finally {
      setCheckingId('');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>OTP Receives</h1>
          <p className="text-gray-500 text-sm mt-1">View your purchased OTP numbers and received SMS codes.</p>
        </div>
        <button onClick={loadOrders} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 disabled:opacity-60" style={{ fontWeight: 600 }}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <SummaryCard icon={Phone} label="Total numbers" value={String(orders.length)} />
        <SummaryCard icon={Clock} label="Active now" value={String(activeCount)} />
        <SummaryCard icon={ShieldCheck} label="Mode" value="Live" />
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" />
          Loading OTP numbers...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <Phone className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No OTP numbers purchased yet.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {orders.map(order => {
            const isActive = ['processing', 'waiting', 'received'].includes(order.status) && order.expires_at && new Date(order.expires_at).getTime() > Date.now();
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {order.service_image_url ? <img src={order.service_image_url} alt="" className="w-10 h-10 rounded-xl object-cover bg-gray-100" /> : <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-sm" style={{ fontWeight: 800 }}>{order.service_name.slice(0, 1)}</div>}
                    <div className="min-w-0">
                      <div className="text-gray-800 truncate" style={{ fontWeight: 700 }}>{order.service_name}</div>
                      <div className="text-xs text-gray-400">{order.service_code || 'service'} - {order.country_name}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs capitalize ${statusStyles(order.status)}`} style={{ fontWeight: 700 }}>{order.status}</span>
                </div>

                <div className="space-y-3">
                  <CopyRow label="Phone number" value={order.phone_number} onCopy={() => copyValue(order.phone_number, 'Phone number')} />
                  {order.status === 'processing' ? (
                    <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-3 flex items-center gap-2 text-sm text-indigo-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing purchase...
                    </div>
                  ) : order.status === 'waiting' ? (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3 flex items-center justify-between gap-2 text-sm text-amber-700">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Waiting for SMS...
                      </span>
                      <button onClick={() => checkSms(order.id)} disabled={checkingId === order.id} className="px-2.5 py-1 rounded-lg bg-white/70 text-amber-800 text-xs disabled:opacity-60" style={{ fontWeight: 700 }}>
                        {checkingId === order.id ? 'Checking...' : 'Check'}
                      </button>
                    </div>
                  ) : (
                    <CopyRow label="OTP code" value={order.otp_code || '-'} onCopy={() => order.otp_code && copyValue(order.otp_code, 'OTP code')} emphasized />
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <InfoBox label="Expires in" value={isActive ? timeLeft(order.expires_at) : 'Expired'} />
                    <InfoBox label="Price paid" value={formatCurrency(order.price)} />
                    <InfoBox label="Created" value={dateLabel(order.created_at)} />
                    <InfoBox label="Country" value={`${order.country_code} ${order.country_name}`} />
                  </div>
                </div>

                {order.status === 'waiting' && (
                  <button onClick={() => cancelOrder(order.id)} disabled={cancellingId === order.id} className="mt-4 w-full border border-red-100 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 rounded-xl py-2.5 text-sm flex items-center justify-center gap-2" style={{ fontWeight: 700 }}>
                    {cancellingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Cancel / Refund
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
      <div>
        <div className="text-lg text-gray-800" style={{ fontWeight: 800 }}>{value}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  );
}

function CopyRow({ label, value, onCopy, emphasized = false }: { label: string; value: string; onCopy: () => void; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-3 flex items-center justify-between gap-3 ${emphasized ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50'}`}>
      <div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className={`${emphasized ? 'text-2xl tracking-[0.2em] text-emerald-700' : 'text-sm text-gray-800'}`} style={{ fontWeight: 800 }}>{value}</div>
      </div>
      <button onClick={onCopy} className="p-2 rounded-lg hover:bg-white text-gray-500"><Copy className="w-4 h-4" /></button>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm text-gray-700 truncate" style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
