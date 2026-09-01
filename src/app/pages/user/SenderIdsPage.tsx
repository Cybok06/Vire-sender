import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getSmsSenderIds, refreshSmsSenderIdApplication, submitSmsSenderIdApplication } from '../../../lib/api.js';

type SenderRecord = {
  id: string;
  sender_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'submission_failed' | 'status_unknown' | string;
  provider_approval?: string;
  provider_message?: string;
  submitted_at?: string;
  approved_at?: string;
  rejected_at?: string;
  last_status_check_at?: string;
  can_send?: boolean;
};

const statusMeta: Record<string, { label: string; className: string; Icon: any; message: string }> = {
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle, message: 'This Sender ID has been approved and can now be used for SMS sending.' },
  pending: { label: 'Pending Approval', className: 'bg-amber-50 text-amber-700', Icon: Clock, message: 'Your Sender ID has been submitted and is waiting for approval.' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700', Icon: XCircle, message: 'This Sender ID was rejected and cannot be used.' },
  submission_failed: { label: 'Submission Failed', className: 'bg-red-50 text-red-700', Icon: XCircle, message: 'Submission failed. Check the Sender ID and try again.' },
  status_unknown: { label: 'Status Unknown', className: 'bg-gray-100 text-gray-600', Icon: Clock, message: 'The provider status could not be confirmed.' },
};

function fmt(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

const PAGE_SIZE = 5;

export default function SenderIdsPage() {
  const [records, setRecords] = useState<SenderRecord[]>([]);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [senderId, setSenderId] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState('');

  const approvedCount = useMemo(() => records.filter(item => item.status === 'approved').length, [records]);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const paginatedRecords = useMemo(
    () => records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, records],
  );

  useEffect(() => {
    setPage(current => Math.min(current, totalPages));
  }, [totalPages]);

  const load = async () => {
    try {
      setLoading(true);
      const response = await getSmsSenderIds();
      setRecords(response.applications || []);
      setActiveProvider(response.active_sms_provider || null);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load Sender IDs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!senderId.trim()) {
      toast.error('Sender ID is required.');
      return;
    }
    try {
      setSubmitting(true);
      const response = await submitSmsSenderIdApplication({ sender_id: senderId });
      toast.success(response.message || 'Sender ID submitted.');
      setSenderId('');
      setPage(1);
      await load();
    } catch (error: any) {
      const message = error?.data?.message || error?.message || 'Unable to submit Sender ID.';
      const isExistingSenderId = message === 'This Sender ID has already been submitted.';
      const isMoolreNotConfigured = message === 'Moolre SMS provider is not configured.';
      toast.error(
        isMoolreNotConfigured || (activeProvider && activeProvider !== 'moolre' && isExistingSenderId)
          ? "Can’t submit right now. You can still send a message with the Sender ID"
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = async (id: string) => {
    try {
      setRefreshingId(id);
      await refreshSmsSenderIdApplication(id);
      toast.success('Sender ID status refreshed.');
      await load();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to refresh Sender ID.');
    } finally {
      setRefreshingId('');
    }
  };

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontWeight: 800 }}>Sender IDs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Register and track Sender IDs for SMS sending.</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm" style={{ fontWeight: 700 }}>
          <Send className="w-4 h-4" /> {approvedCount} ready to use
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="grid lg:grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 600 }}>New Sender ID</label>
            <input
              value={senderId}
              onChange={event => setSenderId(event.target.value)}
              maxLength={11}
              placeholder="SmartBiz"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
            <p className="text-xs text-gray-400 mt-1">Maximum 11 characters. Letters, numbers, and spaces only.</p>
          </div>
          <button onClick={submit} disabled={submitting} className="self-end flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm" style={{ fontWeight: 700 }}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Submit
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Your Sender IDs</h2>
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading Sender IDs...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No Sender IDs submitted yet.</div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {paginatedRecords.map(record => {
                const meta = statusMeta[record.status] || statusMeta.status_unknown;
                const Icon = meta.Icon;
                return (
                  <div key={record.id} className="p-5 grid lg:grid-cols-[1fr_auto] gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg text-gray-900" style={{ fontWeight: 800 }}>{record.sender_id}</div>
                        <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${meta.className}`} style={{ fontWeight: 700 }}>
                          <Icon className="w-3.5 h-3.5" />{meta.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{meta.message}</p>
                      <div className="grid sm:grid-cols-3 gap-2 mt-3 text-xs text-gray-500">
                        <div>Submitted: <span className="text-gray-700">{fmt(record.submitted_at)}</span></div>
                        <div>Approved: <span className="text-gray-700">{fmt(record.approved_at)}</span></div>
                        <div>Last checked: <span className="text-gray-700">{fmt(record.last_status_check_at)}</span></div>
                      </div>
                    </div>
                    <button onClick={() => refresh(record.id)} disabled={refreshingId === record.id} className="self-center flex items-center justify-center gap-2 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ fontWeight: 600 }}>
                      {refreshingId === record.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Refresh
                    </button>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, records.length)} of {records.length}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-20 text-center text-xs font-semibold text-gray-600">Page {page} of {totalPages}</span>
                  <button type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
