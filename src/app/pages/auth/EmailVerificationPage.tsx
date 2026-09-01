import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import {
  Mail, CheckCircle, RefreshCw, ArrowLeft,
  Edit2, Loader2, Shield, KeyRound
} from 'lucide-react';
import { toast } from 'sonner';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '../../components/ui/input-otp';
import { resendVerificationCode, verifyEmailCode } from '../../../lib/api.js';

const RESEND_COOLDOWN = 60;
const CODE_LENGTH = 6;

export default function EmailVerificationPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialEmail = (location.state as { email?: string } | null)?.email || sessionStorage.getItem('pendingVerificationEmail') || 'your@email.com';
  const [email, setEmail] = useState(initialEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const verifyCode = async (code = verificationCode) => {
    if (code.length !== CODE_LENGTH) {
      toast.error('Enter the 6-digit verification code.');
      return;
    }

    setVerifying(true);

    try {
      const response = await verifyEmailCode({ email, code });
      sessionStorage.removeItem('pendingVerificationEmail');
      toast.success(response.message || 'Email verified successfully.');
      await new Promise(r => setTimeout(r, 900));
      navigate('/login');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);

    try {
      const response = await resendVerificationCode({ email });
      setResendCount(c => c + 1);
      setVerificationCode('');
      setCooldown(RESEND_COOLDOWN);
      toast.success(response.message || 'New verification code sent.');
    } catch (error: any) {
      const retryAfter = error?.data?.retry_after;
      if (retryAfter) setCooldown(retryAfter);
      toast.error(error?.data?.message || error?.message || 'Could not resend verification code.');
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = () => {
    if (!newEmail.trim() || !/\S+@\S+\.\S+/.test(newEmail)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setEmail(newEmail);
    sessionStorage.setItem('pendingVerificationEmail', newEmail);
    setNewEmail('');
    setEditingEmail(false);
    setVerificationCode('');
    setCooldown(0);
    toast.success('Email updated. Request a new verification code for this address.');
  };

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8 gap-3">
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
            alt="VireSend icon"
            style={{ width: 72, height: 72, objectFit: 'contain', filter: 'drop-shadow(0 6px 20px rgba(37,99,235,0.4))' }}
          />
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
            alt="VireSend"
            style={{ height: 28, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-700" />

          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-50 rounded-full mb-5">
              <div className="relative">
                <KeyRound className="w-10 h-10 text-blue-600" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
                  <Mail className="w-3 h-3 text-white" />
                </span>
              </div>
            </div>

            <h2 className="text-2xl text-gray-800 mb-2" style={{ fontWeight: 700 }}>Enter verification code</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              We sent a 6-digit code to<br />
              <span className="text-gray-800" style={{ fontWeight: 600 }}>{email}</span>
            </p>

            <div className="bg-gray-50 rounded-2xl p-4 text-left mb-6 space-y-3">
              {[
                { step: '1', text: 'Open the email from VireSend' },
                { step: '2', text: 'Copy the 6-digit verification code' },
                { step: '3', text: 'Enter the code below to verify your email' },
              ].map(s => (
                <div key={s.step} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs" style={{ fontWeight: 700 }}>{s.step}</span>
                  </div>
                  <span className="text-sm text-gray-600">{s.text}</span>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <InputOTP
                maxLength={CODE_LENGTH}
                value={verificationCode}
                onChange={value => setVerificationCode(value.replace(/\D/g, ''))}
                inputMode="numeric"
                pattern="[0-9]*"
                containerClassName="justify-center gap-2"
              >
                <InputOTPGroup className="gap-2">
                  {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-11 rounded-xl border border-gray-200 bg-white text-lg text-gray-800 shadow-sm data-[active=true]:border-blue-500 data-[active=true]:ring-blue-100"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <button
              onClick={() => verifyCode()}
              disabled={verifying || verificationCode.length !== CODE_LENGTH}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white rounded-xl text-sm transition-all mb-3"
              style={{ fontWeight: 600 }}
            >
              {verifying ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Verifying...</>
              ) : (
                <><CheckCircle className="w-4 h-4" />Verify Code</>
              )}
            </button>

            <button
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 hover:border-gray-300 disabled:opacity-70 text-gray-700 rounded-xl text-sm transition-all mb-3"
              style={{ fontWeight: 600 }}
            >
              {resending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
              ) : cooldown > 0 ? (
                <><RefreshCw className="w-4 h-4" />Resend in {cooldown}s</>
              ) : (
                <><RefreshCw className="w-4 h-4" />{resendCount > 0 ? 'Resend code again' : 'Resend verification code'}</>
              )}
            </button>

            {!editingEmail ? (
              <button
                onClick={() => { setEditingEmail(true); setNewEmail(email); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl text-sm transition-colors mb-4"
                style={{ fontWeight: 500 }}
              >
                <Edit2 className="w-4 h-4" />Change email address
              </button>
            ) : (
              <div className="mb-4 space-y-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="Enter new email address"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={handleChangeEmail} className="flex-1 bg-blue-900 text-white py-2.5 rounded-xl text-sm transition-colors hover:bg-blue-800" style={{ fontWeight: 600 }}>
                    Update Email
                  </button>
                  <button onClick={() => setEditingEmail(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:border-gray-300 transition-colors" style={{ fontWeight: 500 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-left mb-4">
              <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-600">For your security, the verification code expires in <strong>10 minutes</strong>. Check your spam folder if you don't see it.</p>
            </div>

            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />Back to login
            </Link>
          </div>
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">© 2026 VireSend. All rights reserved.</p>
      </div>
    </div>
  );
}
