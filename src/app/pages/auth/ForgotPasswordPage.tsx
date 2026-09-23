import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Mail, ArrowLeft, CheckCircle,
  Loader2, Lock, Eye, EyeOff, Shield, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { requestPasswordReset, resetPassword } from '../../../lib/api.js';

type Step = 'email' | 'sent' | 'reset' | 'success';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token') || '';
  const [step, setStep]           = useState<Step>(resetToken ? 'reset' : 'email');
  const [email, setEmail]         = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading]     = useState(false);

  // Reset step
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]               = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [pwErrors, setPwErrors]             = useState<Record<string, string>>({});

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setEmailError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Invalid email address'); return; }
    setEmailError('');
    setLoading(true);
    try {
      const response = await requestPasswordReset({ email: email.trim() });
      setStep('sent');
      toast.success(response.message || 'If an account exists, a reset link has been sent.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!newPassword)       e2.new = 'Password is required';
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
      e2.new = 'Use uppercase, lowercase, number, and special character';
    }
    if (!confirmPassword)   e2.confirm = 'Please confirm your password';
    else if (newPassword !== confirmPassword) e2.confirm = 'Passwords do not match';
    setPwErrors(e2);
    if (Object.keys(e2).length > 0) return;
    if (!resetToken) {
      toast.error('Reset link is missing or invalid.');
      return;
    }
    setLoading(true);
    try {
      const response = await resetPassword({
        token: resetToken,
        password: newPassword,
        confirm_password: confirmPassword,
      });
      setStep('success');
      toast.success(response.message || 'Password reset successfully.');
    } catch (error: any) {
      const data = error?.data || {};
      const apiErrors: Record<string, string> = {};
      if (data.errors?.password) apiErrors.new = data.errors.password;
      if (data.errors?.confirm_password) apiErrors.confirm = data.errors.confirm_password;
      setPwErrors(apiErrors);
      toast.error(data.message || error?.message || 'Unable to reset password. Please request a new link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl" />
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
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
          {/* Progress bar */}
          <div className="h-1 bg-gray-100">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: step === 'email' ? '25%' : step === 'sent' ? '50%' : step === 'reset' ? '75%' : '100%' }}
            />
          </div>

          <div className="p-8">
            {/* ── Step 1: Enter email ── */}
            {step === 'email' && (
              <>
                <div className="mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                    <Lock className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Reset password</h2>
                  <p className="text-gray-500 text-sm mt-1">Enter your email and we'll send you a secure reset link.</p>
                </div>

                <form onSubmit={handleSendLink} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                        placeholder="john@example.com"
                        className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm outline-none transition-all ${
                          emailError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                        }`}
                        autoFocus
                      />
                    </div>
                    {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-700">Reset links expire after <strong>30 minutes</strong> for your security.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    style={{ fontWeight: 600 }}
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : 'Send Reset Link'}
                  </button>
                </form>
              </>
            )}

            {/* ── Step 2: Sent ── */}
            {step === 'sent' && (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-50 rounded-full mb-5">
                  <Mail className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl text-gray-800 mb-2" style={{ fontWeight: 700 }}>Check your email</h2>
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                  We sent a password reset link to<br />
                  <span className="text-gray-800" style={{ fontWeight: 600 }}>{email}</span>
                </p>

                <div className="bg-gray-50 rounded-2xl p-4 text-left mb-6 space-y-3">
                  {[
                    { n: '1', t: 'Check your email inbox (and spam folder)' },
                    { n: '2', t: 'Click the "Reset Password" button in the email' },
                    { n: '3', t: 'Create a new secure password' },
                  ].map(s => (
                    <div key={s.n} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs" style={{ fontWeight: 700 }}>{s.n}</span>
                      </div>
                      <span className="text-sm text-gray-600">{s.t}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-left mb-4">
                  <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700">This link will expire in <strong>30 minutes</strong>.</p>
                </div>

                <button
                  onClick={() => { setStep('email'); }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  style={{ fontWeight: 500 }}
                >
                  Try a different email
                </button>
              </div>
            )}

            {/* ── Step 3: New password form ── */}
            {step === 'reset' && (
              <>
                <div className="mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                    <Lock className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Create new password</h2>
                  <p className="text-gray-500 text-sm mt-1">Choose a strong password for your account.</p>
                </div>

                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => { setNewPassword(e.target.value); setPwErrors(p => ({ ...p, new: '' })); }}
                        placeholder="Minimum 8 characters"
                        className={`w-full pl-10 pr-10 py-3 border rounded-xl text-sm outline-none transition-all ${pwErrors.new ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}`}
                      />
                      <button type="button" onClick={() => setShowNew(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {pwErrors.new && <p className="text-xs text-red-500 mt-1">{pwErrors.new}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setPwErrors(p => ({ ...p, confirm: '' })); }}
                        placeholder="Repeat new password"
                        className={`w-full pl-10 pr-10 py-3 border rounded-xl text-sm outline-none transition-all ${pwErrors.confirm ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}`}
                      />
                      <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {pwErrors.confirm && <p className="text-xs text-red-500 mt-1">{pwErrors.confirm}</p>}
                    {!pwErrors.confirm && confirmPassword && newPassword === confirmPassword && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Passwords match</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                    <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <p className="text-xs text-blue-600">Use at least 8 characters with uppercase, numbers, and symbols.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    style={{ fontWeight: 600 }}
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Resetting...</> : 'Reset Password'}
                  </button>
                </form>
              </>
            )}

            {/* ── Step 4: Success ── */}
            {step === 'success' && (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-50 rounded-full mb-5">
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl text-gray-800 mb-2" style={{ fontWeight: 700 }}>Password reset!</h2>
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                  Your password has been updated successfully.<br />
                  You can now sign in with your new password.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full bg-blue-900 hover:bg-blue-800 text-white py-3 rounded-xl transition-all"
                  style={{ fontWeight: 600 }}
                >
                  Back to Sign In
                </button>
              </div>
            )}

            {/* Back link — show on email step */}
            {(step === 'email' || step === 'sent') && (
              <div className="mt-5 text-center">
                <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  <ArrowLeft className="w-4 h-4" />Back to login
                </Link>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">© 2026 VireSend. All rights reserved.</p>
      </div>
    </div>
  );
}
