import { useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { adjustAdminUserSms, getAdminUsersSms } from '../../../lib/api.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

type Metrics = { sms_balance: number; purchased_month: number; purchased_total: number; used_total: number };
type SmsUser = Metrics & { id: string; full_name?: string; email?: string; account_status?: string };
type Report = { summary: Metrics & { users: number }; users: SmsUser[]; total: number; page_size: number; month_start: string };
const metrics: { key: keyof Metrics; label: string }[] = [
  { key: 'sms_balance', label: 'Available SMS' },
  { key: 'purchased_month', label: 'Purchased this month' },
  { key: 'purchased_total', label: 'Purchased all time' },
  { key: 'used_total', label: 'Used / sent all time' },
];
const number = (value: number) => value.toLocaleString();

export default function AdminUsersSms() {
  const [data, setData] = useState<Report | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SmsUser | null>(null);
  const [action, setAction] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [retryOnly, setRetryOnly] = useState(false);
  const requestId = useRef('');
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      getAdminUsersSms(search, page).then((response: Report) => {
        if (active) {
          const lastPage = Math.max(1, Math.ceil(response.total / response.page_size));
          if (page > lastPage) setPage(lastPage);
          else setData(response);
        }
      }).catch((err: Error) => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, page, refresh]);

  function openAdjustment(user: SmsUser, type: 'credit' | 'debit') {
    setSelected(user); setAction(type); setAmount(''); setReason(''); setSubmitError(''); setRetryOnly(false);
    requestId.current = crypto.randomUUID();
  }

  const quantity = Number(amount);
  const valid = /^\d+$/.test(amount) && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 2147483647
    && !!reason.trim() && reason.trim().length <= 500 && (action === 'credit' || quantity <= (selected?.sms_balance || 0));
  const after = (selected?.sms_balance || 0) + (action === 'credit' ? quantity : -quantity);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !valid || submitting.current) return;
    submitting.current = true; setSaving(true); setSubmitError('');
    try {
      await adjustAdminUserSms(selected.id, { type: action, amount: quantity, reason: reason.trim(), request_id: requestId.current });
      toast.success('SMS balance updated successfully.');
      setSelected(null); setRefresh(value => value + 1);
    } catch (err: any) {
      setSubmitError(err.message || 'Could not update SMS balance.');
      // Keep the same payload and key after an uncertain response to prevent duplicate credits.
      setRetryOnly(err.data?.retry_same_request !== false && (!err.status || err.status >= 500));
      if (err.status && err.status < 500) requestId.current = crypto.randomUUID();
    } finally { submitting.current = false; setSaving(false); }
  }

  return <div className="p-4 sm:p-6 lg:p-8 space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-blue-950">Users SMS</h1>
        <p className="text-sm text-gray-500 mt-1">Customer SMS balances, purchases and usage.</p></div>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="flex items-center gap-2 bg-white border rounded-xl px-4 py-2 text-sm disabled:opacity-50">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
      </button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map(metric => <div key={metric.key} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <p className="text-sm text-gray-500">{metric.label}</p>
        <p className="text-3xl font-bold text-blue-950 mt-2">{data && !error ? number(data.summary[metric.key]) : '—'}</p>
        <p className="text-xs text-gray-400 mt-2">SMS credits · all customers</p>
      </div>)}
    </div>
    <p className="text-xs text-gray-500">Purchases include successful package purchases only. Used / sent counts finalized sending credits after refunds, including message parts; it does not indicate delivery. Admin additions and deductions are excluded from purchase and usage totals. This month follows Ghana time (UTC){data ? `: ${new Date(data.month_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : ''}.</p>
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">Customers {data ? `(${number(data.total)})` : ''}</h2>
        <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input aria-label="Search customers by name or email" placeholder="Search name or email…" value={search} maxLength={200}
            onChange={event => { setSearch(event.target.value); setPage(1); }} className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm" /></div>
      </div>
      {error ? <div role="alert" className="p-8 text-center text-red-600">{error} <button className="underline" onClick={() => setRefresh(value => value + 1)}>Retry</button></div>
        : loading ? <div role="status" className="p-12 flex justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading SMS balances…</div>
        : !data?.users.length ? <p className="p-12 text-center text-gray-500">{search ? 'No customers match your search.' : 'No customers yet.'}</p>
        : <div className="overflow-x-auto"><table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500"><tr><th className="p-4">Customer</th><th className="p-4">Status</th>
            {metrics.map(metric => <th key={metric.key} className="p-4 text-right whitespace-nowrap">{metric.label}</th>)}<th className="p-4">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{data.users.map(user => <tr key={user.id} className="hover:bg-gray-50/50">
            <td className="p-4"><div className="font-medium text-gray-900">{user.full_name || 'Unnamed user'}</div><div className="text-xs text-gray-500">{user.email || 'No email'}</div></td>
            <td className="p-4"><span className={`px-2 py-1 rounded-full text-xs ${user.account_status === 'suspended' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{user.account_status || 'active'}</span></td>
            {metrics.map(metric => <td key={metric.key} className={`p-4 text-right tabular-nums ${metric.key === 'sms_balance' ? 'font-bold text-blue-700' : ''}`}>{number(user[metric.key])}</td>)}
            <td className="p-4"><div className="flex gap-2 whitespace-nowrap">
              <button onClick={() => openAdjustment(user, 'credit')} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 text-blue-700"><Plus className="w-4 h-4" /> Add SMS</button>
              <button disabled={user.sms_balance === 0} onClick={() => openAdjustment(user, 'debit')} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-50 text-red-700 disabled:opacity-40"><Minus className="w-4 h-4" /> Deduct SMS</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
      <div className="p-4 border-t flex items-center justify-between text-sm text-gray-500">
        <span>Page {page} of {Math.max(1, Math.ceil((data?.total || 0) / (data?.page_size || 25)))}</span>
        <div className="flex gap-2"><button disabled={loading || page === 1} onClick={() => setPage(value => value - 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Previous</button>
          <button disabled={loading || !data || page * data.page_size >= data.total} onClick={() => setPage(value => value + 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Next</button></div>
      </div>
    </div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !saving && !retryOnly) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{action === 'credit' ? 'Add SMS' : 'Deduct SMS'}</DialogTitle>
        <DialogDescription>{selected?.full_name || 'Customer'} · {selected?.email}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm">Current balance: <strong>{number(selected?.sms_balance || 0)} SMS</strong></p>
          <label className="block text-sm font-medium">SMS amount<input required type="number" min="1" max={action === 'debit' ? selected?.sms_balance : 2147483647} step="1" value={amount} disabled={saving || retryOnly}
            onChange={event => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="block text-sm font-medium">Reason<textarea required maxLength={500} value={reason} disabled={saving || retryOnly}
            onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2" rows={3} /></label>
          <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">Estimated resulting balance: <strong>{Number.isFinite(after) && amount ? number(after) : number(selected?.sms_balance || 0)} SMS</strong>
            <p className="text-xs mt-1">{action === 'credit' ? 'Added credits have no expiry.' : 'Credits expiring soonest are deducted first.'} The balance is checked again when saved.</p></div>
          {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
          {retryOnly && <p className="text-sm text-gray-600">The result could not be confirmed. Retry this adjustment to check or complete it without applying it twice.</p>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving || retryOnly} onClick={() => setSelected(null)} className="px-4 py-2 border rounded-lg disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={!valid || saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50 inline-flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{retryOnly ? 'Retry adjustment' : `Confirm ${action === 'credit' ? 'addition' : 'deduction'}`}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
