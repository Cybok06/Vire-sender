import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getWallet, verifyWalletDeposit } from '../../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext';

type ReturnState = 'checking' | 'success' | 'pending' | 'failed' | 'error';

export default function MoolreReturnPage() {
  const [searchParams] = useSearchParams();
  const { updateBalance } = useAuth();
  const [state, setState] = useState<ReturnState>('checking');
  const [message, setMessage] = useState('Confirming your payment...');
  const [checking, setChecking] = useState(false);
  const depositId = searchParams.get('deposit_id') || '';
  const isSmsPackage = searchParams.get('purpose') === 'sms_package';

  const verify = async () => {
    if (!depositId) {
      setState('error');
      setMessage('We could not confirm this payment. Your wallet has not been charged by VireSender.');
      return;
    }
    try {
      setChecking(true);
      setState('checking');
      setMessage('Confirming your payment...');
      const response = await verifyWalletDeposit(depositId);
      if (response.balance !== undefined) {
        updateBalance(response.balance || 0);
      } else {
        const wallet = await getWallet();
        updateBalance(wallet.balance || 0);
      }
      if (response.status === 'success' || response.transaction?.wallet_credited) {
        setState('success');
        setMessage(isSmsPackage ? 'Payment successful. Your SMS credits have been added.' : 'Deposit successful. Your wallet has been credited.');
      } else if (response.status === 'pending' || response.transaction?.status === 'pending') {
        setState('pending');
        setMessage('Your payment is still being confirmed. Check again shortly.');
      } else if (response.transaction?.status === 'failed' || response.transaction?.status === 'verification_failed') {
        setState('failed');
        setMessage('The payment was not completed.');
      } else {
        setState('pending');
        setMessage(response.message || 'Your payment is still being confirmed. Check again shortly.');
      }
    } catch (error: any) {
      setState('error');
      setMessage(error?.data?.message || 'We could not confirm this payment. Your wallet has not been charged by VireSender.');
      toast.error(error?.data?.message || error?.message || 'Payment verification failed.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    verify();
  }, [depositId]);

  const isSuccess = state === 'success';
  const isPending = state === 'pending' || state === 'checking';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-xl shadow-sm p-6 text-center space-y-5">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${isSuccess ? 'bg-emerald-100' : state === 'failed' || state === 'error' ? 'bg-red-100' : 'bg-blue-100'}`}>
          {state === 'checking' ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : isSuccess ? <CheckCircle className="w-6 h-6 text-emerald-600" /> : state === 'pending' ? <RefreshCw className="w-6 h-6 text-blue-600" /> : <XCircle className="w-6 h-6 text-red-600" />}
        </div>
        <div>
          <h1 className="text-xl text-gray-900" style={{ fontWeight: 800 }}>{state === 'checking' ? 'Confirming your payment...' : isSuccess ? 'Deposit successful' : state === 'pending' ? 'Payment pending' : 'Payment not confirmed'}</h1>
          <p className="text-sm text-gray-500 mt-2">{message}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link to={isSmsPackage ? '/user/sms-packages' : '/user/wallet'} className="flex-1 rounded-xl bg-blue-900 text-white px-4 py-3 text-sm" style={{ fontWeight: 700 }}>{isSmsPackage ? 'View SMS Balance' : 'Return to Wallet'}</Link>
          {isPending && (
            <button onClick={verify} disabled={checking} className="flex-1 rounded-xl border border-gray-200 text-gray-700 px-4 py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-70" style={{ fontWeight: 700 }}>
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Check Status Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
