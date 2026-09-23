import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  Eye, EyeOff, Lock, Loader2, Github, Mail, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { API_URL } from '../../../lib/api.js';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const validate = () => {
    const e: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) e.identifier = 'Email address is required';
    if (!password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const result = await login(identifier, password);
    setLoading(false);

    if (result.success) {
      toast.success('Login successful. Welcome back.');
      navigate(result.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
      return;
    }

    if (result.requiresVerification) {
      const email = result.email || identifier;
      setVerificationEmail(email);
      sessionStorage.setItem('pendingVerificationEmail', email);
      toast.error(result.error || 'Please verify your email before logging in.');
      return;
    }

    setErrors({ password: result.error || 'Invalid email/username or password.' });
    toast.error(result.error || 'Invalid email/username or password.');
  };

  const handleVerifyEmail = () => {
    if (verificationEmail) {
      sessionStorage.setItem('pendingVerificationEmail', verificationEmail);
    }
    navigate('/verify-email', { state: { email: verificationEmail || identifier } });
  };

  const handleSocialAuth = async (provider: 'google' | 'github') => {
    if (provider === 'google') {
      window.location.href = `${API_URL}/api/auth/google`;
      return;
    }
    if (provider === 'github') {
      window.location.href = `${API_URL}/api/auth/github`;
      return;
    }

    setSocialLoading(provider);
    await new Promise(r => setTimeout(r, 700));
    setSocialLoading(null);
    toast.info(`${provider === 'google' ? 'Google' : 'GitHub'} login is not connected yet.`);
  };

  return (
    <div className="min-h-dvh w-full max-w-full flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #06142B 0%, #0d2563 55%, #06142B 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-60 -right-60 w-[500px] h-[500px] rounded-full opacity-[0.07] blur-3xl" style={{ background: '#2563EB' }} />
        <div className="absolute -bottom-60 -left-60 w-[500px] h-[500px] rounded-full opacity-[0.07] blur-3xl" style={{ background: '#0EA5E9' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.04] blur-3xl" style={{ background: '#3B82F6' }} />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8 gap-3">
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
            alt="VireSend icon"
            style={{ width: 80, height: 80, objectFit: 'contain', filter: 'drop-shadow(0 8px 24px rgba(37,99,235,0.45))' }}
          />
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
            alt="VireSend"
            style={{ height: 32, width: 'auto', objectFit: 'contain' }}
          />
          <p className="text-blue-300 text-sm tracking-wide" style={{ fontWeight: 400 }}>Complete Communication Platform</p>
        </div>

        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.98)',
            boxShadow: '0 32px 80px rgba(6,20,43,0.45), 0 4px 24px rgba(37,99,235,0.12)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}
        >
          <div className="p-9">
            <div className="mb-6">
              <h2 className="text-gray-900 text-lg" style={{ fontWeight: 700 }}>Welcome back</h2>
              <p className="text-gray-400 text-sm mt-1">Sign in to your VireSend account</p>
            </div>

            {verificationEmail && (
              <div className="mb-5 p-4 rounded-2xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800" style={{ fontWeight: 600 }}>Email verification required</p>
                </div>
                <p className="text-xs text-amber-700 mb-3">Please verify your email before logging in.</p>
                <button
                  onClick={handleVerifyEmail}
                  className="text-xs text-amber-800 hover:text-amber-950 transition-colors"
                  style={{ fontWeight: 700 }}
                >
                  Verify Email
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => handleSocialAuth('google')}
                disabled={!!socialLoading}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                style={{ fontWeight: 500, border: '1.5px solid #e5e7eb' }}
              >
                {socialLoading === 'google' ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <GoogleIcon />}
                Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialAuth('github')}
                disabled={!!socialLoading}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                style={{ fontWeight: 500, border: '1.5px solid #e5e7eb' }}
              >
                {socialLoading === 'github' ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Github className="w-4 h-4 text-gray-800" />}
                GitHub
              </button>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-150" /></div>
              <div className="relative flex justify-center"><span className="text-xs text-gray-400 bg-white px-3">or continue with email</span></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => { setIdentifier(e.target.value); setErrors(p => ({ ...p, identifier: undefined })); setVerificationEmail(null); }}
                    placeholder="Enter your email address"
                    className={`w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm outline-none transition-all ${
                      errors.identifier ? 'bg-red-50' : 'bg-gray-50 focus:bg-white'
                    }`}
                    style={{ border: errors.identifier ? '1.5px solid #fca5a5' : '1.5px solid #e5e7eb' }}
                  />
                </div>
                {errors.identifier && <p className="text-xs text-red-500 mt-1.5">{errors.identifier}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Password</label>
                  <Link to="/forgot-password" className="text-xs text-blue-600 hover:text-blue-800">Forgot password?</Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: undefined })); }}
                    placeholder="Enter your password"
                    className={`w-full pl-11 pr-12 py-3.5 rounded-2xl text-sm outline-none transition-all ${
                      errors.password ? 'bg-red-50' : 'bg-gray-50 focus:bg-white'
                    }`}
                    style={{ border: errors.password ? '1.5px solid #fca5a5' : '1.5px solid #e5e7eb' }}
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1.5">{errors.password}</p>}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#06142B' }}
                />
                <label htmlFor="remember" className="text-sm text-gray-500">Remember me</label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 mt-2 hover:opacity-90 disabled:opacity-60"
                style={{ fontWeight: 700, background: 'linear-gradient(135deg, #06142B 0%, #1e40af 100%)', boxShadow: '0 8px 24px rgba(6,20,43,0.35)' }}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in...</> : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-400 mt-6">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-600 hover:text-blue-800" style={{ fontWeight: 600 }}>Create account</Link>
            </p>
          </div>
        </div>

        <p className="text-center text-blue-400/60 text-xs mt-6">© 2026 VireSend. All rights reserved.</p>
      </div>
    </div>
  );
}
