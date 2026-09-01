import { useEffect, useState } from 'react';
import { Check, Clock, CreditCard, Loader2, MessageSquare, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSmsPackages, initializeSmsPackagePayment, purchaseSmsPackageWithWallet, verifyPaystackDeposit } from '../../../lib/api.js';
import { formatCurrency } from '../../utils/currency';

type Package = { id:string; name:string; total_sms:number; amount:number; expiry_days:number|null; no_expiry:boolean };

export default function SmsPackagesPage() {
  const [data, setData] = useState<any>({ packages:[], purchases:[], sms_balance:0, wallet_balance:0, providers:{} });
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const load = async () => { try { setData(await getSmsPackages()); } catch (e:any) { toast.error(e?.data?.message || 'Unable to load SMS packages.'); } finally { setLoading(false); } };

  useEffect(() => {
    load();
    const reference = new URLSearchParams(location.search).get('reference');
    if (reference) verifyPaystackDeposit({ reference }).then(() => {
      toast.success('Payment verified and SMS credits added.');
      history.replaceState({}, '', location.pathname);
      load();
    }).catch((e:any) => toast.error(e?.data?.message || 'Payment verification failed.'));
  }, []);

  const purchase = async (pkg:Package, method:'wallet'|'direct') => {
    try {
      setBuying(`${pkg.id}-${method}`);
      if (method === 'wallet') {
        const result = await purchaseSmsPackageWithWallet(pkg.id);
        toast.success(result.message);
        setSelectedPackage(null);
        await load();
        return;
      }
      const provider = data.providers?.default_provider;
      if (!provider) throw new Error('No payment provider is currently available.');
      const result = await initializeSmsPackagePayment(pkg.id, provider);
      if (result.authorization_url) window.location.href = result.authorization_url;
    } catch (e:any) {
      toast.error(e?.data?.message || e?.message || 'Purchase could not be started.');
    } finally { setBuying(''); }
  };

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return <div className="max-w-6xl mx-auto p-4 md:p-7 space-y-7">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div><h1 className="text-2xl text-slate-900 font-bold">Recharge SMS</h1><p className="text-sm text-slate-500 mt-1">Buy prepaid SMS credits for dashboard, API, campaigns and widgets.</p></div>
      <div className="flex gap-3"><div className="bg-blue-950 text-white rounded-2xl px-5 py-3"><div className="text-[11px] text-blue-200">SMS Balance</div><div className="text-xl font-extrabold">{data.sms_balance.toLocaleString()}</div></div><div className="bg-white border rounded-2xl px-5 py-3"><div className="text-[11px] text-slate-400">Wallet</div><div className="text-lg font-bold">{formatCurrency(data.wallet_balance)}</div></div></div>
    </div>

    {!data.packages.length ? <div className="bg-white border rounded-2xl p-12 text-center text-slate-500">No SMS packages are available right now.</div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{data.packages.map((pkg:Package) => <div key={pkg.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col"><div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center"><MessageSquare /></div><h2 className="text-lg font-bold text-slate-900 mt-4">{pkg.name}</h2><div className="text-4xl font-black text-blue-700 mt-3">{pkg.total_sms.toLocaleString()} <span className="text-sm text-slate-400 font-semibold">SMS</span></div><div className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(pkg.amount)}</div><div className="flex items-center gap-2 text-sm text-slate-500 mt-3"><Clock size={15}/>{pkg.no_expiry ? 'No expiry' : `Valid for ${pkg.expiry_days} days`}</div><button disabled={!!buying} onClick={()=>setSelectedPackage(pkg)} className="w-full mt-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-50">Buy Package</button></div>)}</div>}

    <div className="bg-white border rounded-2xl overflow-hidden"><div className="px-5 py-4 border-b font-bold text-slate-800">Recent package purchases</div>{!data.purchases.length?<div className="p-8 text-center text-sm text-slate-400">No package purchases yet.</div>:<div className="divide-y">{data.purchases.map((p:any)=><div key={p.id} className="px-5 py-4 flex justify-between gap-3"><div><div className="font-semibold text-slate-800">{p.package_name}</div><div className="text-xs text-slate-400">{p.total_sms?.toLocaleString()} SMS · {p.provider || p.method} · {new Date(p.created_at).toLocaleString()}</div></div><div className="text-right"><div className="font-bold">{formatCurrency(p.amount)}</div><div className={`text-xs ${p.status==='success'?'text-emerald-600':'text-amber-600'}`}><Check size={12} className="inline"/> {p.status}</div></div></div>)}</div>}</div>

    {selectedPackage && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!buying)setSelectedPackage(null)}}><div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Choose payment method</div><h2 className="text-xl font-bold text-slate-900 mt-1">{selectedPackage.name}</h2><p className="text-sm text-slate-500 mt-1">{selectedPackage.total_sms.toLocaleString()} SMS credits for {formatCurrency(selectedPackage.amount)}</p></div><button disabled={!!buying} onClick={()=>setSelectedPackage(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={19}/></button></div><div className="mt-6 space-y-4"><div><button disabled={!!buying || data.wallet_balance < selectedPackage.amount} onClick={()=>purchase(selectedPackage,'wallet')} className="w-full py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{buying===`${selectedPackage.id}-wallet`?<Loader2 size={17} className="animate-spin"/>:<Wallet size={17}/>}Pay with Wallet</button><div className={`text-center text-xs mt-2 ${data.wallet_balance < selectedPackage.amount?'text-red-500':'text-slate-500'}`}>Your wallet balance: <span className="font-bold">{formatCurrency(data.wallet_balance)}</span>{data.wallet_balance < selectedPackage.amount?' — insufficient balance':''}</div></div><div className="flex items-center gap-3"><div className="h-px bg-slate-200 flex-1"/><span className="text-xs text-slate-400">OR</span><div className="h-px bg-slate-200 flex-1"/></div><button disabled={!!buying || !data.providers?.default_provider} onClick={()=>purchase(selectedPackage,'direct')} className="w-full py-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{buying===`${selectedPackage.id}-direct`?<Loader2 size={17} className="animate-spin"/>:<CreditCard size={17}/>}Pay directly{data.providers?.default_provider?` with ${String(data.providers.default_provider).replace(/^./,(c:string)=>c.toUpperCase())}`:''}</button></div></div></div>}
  </div>;
}
