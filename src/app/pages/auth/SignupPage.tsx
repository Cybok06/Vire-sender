import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import ReCAPTCHA from 'react-google-recaptcha';
import {
  Eye, EyeOff, MessageSquare, User, Mail, Phone,
  Lock, CheckCircle, ArrowRight, Loader2, Shield, Github, Pause, Play
} from 'lucide-react';
import { toast } from 'sonner';
import { API_URL, registerUser } from '../../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext';

// ── Password strength ─────────────────────────────────────────────────────────
const rules = [
  { id: 'length',    label: 'Minimum 8 characters',        test: (p: string) => p.length >= 8         },
  { id: 'upper',     label: 'At least one uppercase letter',test: (p: string) => /[A-Z]/.test(p)       },
  { id: 'lower',     label: 'At least one lowercase letter',test: (p: string) => /[a-z]/.test(p)       },
  { id: 'number',    label: 'At least one number',          test: (p: string) => /[0-9]/.test(p)       },
  { id: 'special',   label: 'At least one special character',test:(p: string) => /[^A-Za-z0-9]/.test(p)},
];

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
const SIGNUP_SLIDE_INTERVAL = 4000;

const signupSlides = [
  {
    key: 'sms',
    icon: MessageSquare,
    headline: 'Send SMS to a Ready Audience',
    description: 'Reach thousands of targeted contacts instantly with powerful bulk SMS campaigns.',
    backgroundImage: '/images/sms_bg.png',
    accent: '#0EA5E9',
  },
  {
    key: 'otp',
    icon: Shield,
    headline: 'Buy OTP Numbers Instantly',
    description: 'Get virtual numbers for WhatsApp, Telegram, Facebook, Google, TikTok and more.',
    backgroundImage: '/images/otp_bg.png',
    accent: '#10B981',
  },
  {
    key: 'email',
    icon: Mail,
    headline: 'Send Email Campaigns Easily',
    description: 'Create, send, and track professional email campaigns from one dashboard.',
    backgroundImage: '/images/email_bg.png',
    accent: '#8B5CF6',
  },
];

function getStrength(pwd: string) {
  const score = rules.filter(r => r.test(pwd)).length;
  if (!pwd) return null;
  if (score <= 2) return { label: 'Weak',   color: 'bg-red-400',    text: 'text-red-500',   w: 'w-1/3'  };
  if (score <= 3) return { label: 'Medium', color: 'bg-amber-400',  text: 'text-amber-600', w: 'w-2/3'  };
  return           { label: 'Strong', color: 'bg-emerald-400', text: 'text-emerald-600',w: 'w-full' };
}

// ── Google SVG icon ───────────────────────────────────────────────────────────
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

// ── Mock reCAPTCHA ────────────────────────────────────────────────────────────
// NOTE: Replace this with real Google reCAPTCHA v2 (site key required)
// or Cloudflare Turnstile for production use.
function MockCaptcha({ verified, onVerify }: { verified: boolean; onVerify: () => void }) {
  const [checking, setChecking] = useState(false);

  const handleClick = async () => {
    if (verified || checking) return;
    setChecking(true);
    await new Promise(r => setTimeout(r, 1400));
    setChecking(false);
    onVerify();
  };

  return (
    <div className="border border-gray-300 rounded-xl p-3.5 bg-gray-50 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all flex-shrink-0 ${
            verified ? 'bg-emerald-500' : 'border-2 border-gray-400 bg-white hover:border-blue-500'
          }`}
        >
          {checking ? (
            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
          ) : verified ? (
            <CheckCircle className="w-4 h-4 text-white" />
          ) : null}
        </button>
        <span className="text-sm text-gray-700">I am not a robot</span>
      </div>
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
        {/* reCAPTCHA-style logo */}
        <div className="w-10 h-10 flex items-center justify-center">
          <svg viewBox="0 0 64 64" className="w-9 h-9">
            <circle cx="32" cy="32" r="30" fill="#4A90D9" opacity="0.15"/>
            <path d="M32 8 C19 8 8 19 8 32 C8 45 19 56 32 56" stroke="#4A90D9" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <path d="M32 8 C45 8 56 19 56 32 C56 45 45 56 32 56" stroke="#E8453C" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <circle cx="32" cy="32" r="8" fill="#4A90D9"/>
          </svg>
        </div>
        <span className="text-[9px] text-gray-400 leading-none">reCAPTCHA</span>
        <span className="text-[8px] text-gray-300 leading-none">Privacy · Terms</span>
      </div>
    </div>
  );
}

function SignupSideSlider({ compact = false }: { compact?: boolean }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slide = signupSlides[activeSlide];
  const Icon = slide.icon;

  useEffect(() => {
    if (isPaused) return;

    const timer = window.setInterval(() => {
      setActiveSlide(current => (current + 1) % signupSlides.length);
    }, SIGNUP_SLIDE_INTERVAL);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  return (
    <div
      className={`relative overflow-hidden ${compact ? 'rounded-3xl p-5 min-h-[190px]' : 'flex-1 flex flex-col justify-between p-12'}`}
      style={{
        backgroundImage: `linear-gradient(rgba(7, 18, 45, 0.82), rgba(7, 18, 45, 0.9)), url(${slide.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <style>{`
        @keyframes signupSlideFade {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 blur-3xl" style={{ background: slide.accent }} />
        <div className="absolute bottom-10 -left-20 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: '#3B82F6' }} />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.28) 1px, transparent 1px)', backgroundSize: '42px 42px' }}
        />
      </div>

      {!compact && (
        <div className="relative z-10">
          <Link to="/login" className="inline-flex items-center gap-3">
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
              alt="VireSend icon"
              style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }}
            />
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
              alt="VireSend"
              style={{ height: 26, width: 'auto', objectFit: 'contain' }}
            />
          </Link>
        </div>
      )}

      <div className={`relative z-10 ${compact ? '' : 'max-w-md'}`} key={slide.key} style={{ animation: 'signupSlideFade 520ms ease-out' }}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-xs text-white/90" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 700 }}>
          <Icon size={14} style={{ color: slide.accent }} />
          VireSend
        </div>
        <h2 className={`${compact ? 'text-2xl' : 'text-4xl'} text-white mb-3 leading-tight`} style={{ fontWeight: 800, letterSpacing: 0 }}>
          {slide.headline}
        </h2>
        <p className={`${compact ? 'text-sm' : 'text-base'} text-blue-100 leading-relaxed max-w-md`}>
          {slide.description}
        </p>
      </div>

      <div className="relative z-10 flex items-center gap-2 mt-8">
        {signupSlides.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveSlide(index)}
            aria-label={`Show ${item.headline}`}
            className="h-2.5 rounded-full transition-all"
            style={{
              width: activeSlide === index ? 30 : 10,
              background: activeSlide === index ? item.accent : 'rgba(255,255,255,0.34)',
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => setIsPaused(current => !current)}
          aria-label={isPaused ? 'Play signup slider' : 'Pause signup slider'}
          className="ml-2 h-8 px-2.5 rounded-full inline-flex items-center gap-1.5 text-white text-xs transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.14)', fontWeight: 700 }}
        >
          {isPaused ? <Play size={13} /> : <Pause size={13} />}
          <span>{isPaused ? 'Play' : 'Pause'}</span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SignupPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [loading, setLoading]             = useState(false);
  const [captchaToken, setCaptchaToken] = useState(RECAPTCHA_SITE_KEY ? '' : 'captcha-not-configured');
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null);

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    password: '', confirmPassword: '', agreeTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const strength = getStrength(form.password);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())        e.name    = 'Full name is required';
    if (!form.email.trim())       e.email   = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address';
    if (!form.phone.trim())       e.phone   = 'Phone number is required';
    if (!form.password)           e.password = 'Password is required';
    else {
      const failedRules = rules.filter(r => !r.test(form.password));
      if (failedRules.length > 0) e.password = `Password must include: ${failedRules.map(r => r.label.toLowerCase()).join(', ')}`;
    }
    if (!form.confirmPassword)    e.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!form.agreeTerms)         e.agreeTerms = 'You must agree to the Terms of Service and Privacy Policy';
    if (RECAPTCHA_SITE_KEY && !captchaToken) e.captcha = 'Please verify that you are not a robot.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      const response = await registerUser({
        full_name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        confirm_password: form.confirmPassword,
        captcha_token: captchaToken,
      });

      if (response.requires_verification === false && response.token && response.user) {
        logout();
        const signupUser = {
          ...response.user,
          role: 'user',
          name: response.user.full_name || response.user.name || '',
          balance: response.user.balance ?? response.user.wallet_balance ?? 0,
        };
        localStorage.setItem('viresend_token', response.token);
        localStorage.setItem('viresend_user', JSON.stringify(signupUser));
        sessionStorage.removeItem('pendingVerificationEmail');
        toast.success(response.message || 'Account created. Welcome to VireSend.');
        navigate('/user/dashboard', { replace: true });
        return;
      }

      logout();
      sessionStorage.setItem('pendingVerificationEmail', response.email);
      toast.success(response.message || 'Account created. Verification code sent.');
      navigate('/verify-email', { state: { email: response.email } });
    } catch (error: any) {
      const apiErrors = error?.data?.errors || {};
      const mappedErrors: Record<string, string> = {};

      if (apiErrors.full_name) mappedErrors.name = apiErrors.full_name;
      if (apiErrors.email) mappedErrors.email = apiErrors.email;
      if (apiErrors.phone) mappedErrors.phone = apiErrors.phone;
      if (apiErrors.password) mappedErrors.password = apiErrors.password;
      if (apiErrors.confirm_password) mappedErrors.confirmPassword = apiErrors.confirm_password;

      setErrors(prev => ({ ...prev, ...mappedErrors }));
      toast.error(error?.data?.message || error?.message || 'Registration failed. Please try again.');
      recaptchaRef.current?.reset();
      setCaptchaToken('');
    } finally {
      setLoading(false);
    }
  };

  const requireTermsAgreement = () => {
    if (form.agreeTerms) return true;

    setErrors(prev => ({ ...prev, agreeTerms: 'You must agree to the Terms of Service and Privacy Policy' }));
    toast.error('Please agree to the Terms of Service and Privacy Policy first.');
    return false;
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

    if (!requireTermsAgreement()) return;

    setSocialLoading(provider);
    await new Promise(r => setTimeout(r, 1800));
    setSocialLoading(null);
    toast.success(`Signed up with ${provider === 'google' ? 'Google' : 'GitHub'}!`);
    navigate('/user/dashboard');
  };

  const features = [
    'OTP numbers from 100+ countries',
    'Bulk SMS & email campaigns',
    'Developer API with full documentation',
    'Real-time delivery in under 30 seconds',
  ];

  const inputClass = (field: string) =>
    `w-full pl-10 pr-4 py-3 border rounded-xl text-sm outline-none transition-all ${
      errors[field]
        ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
        : 'border-gray-200 focus:border-blue-600 focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]'
    }`;

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden flex">
      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[42%] relative overflow-hidden">
        <SignupSideSlider />
        <div className="hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute bottom-20 -left-20 w-64 h-64 bg-blue-300 rounded-full opacity-10 blur-3xl" />

        <div className="relative z-10">
          <Link to="/login" className="inline-flex items-center gap-3">
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
              alt="VireSend icon"
              style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }}
            />
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
              alt="VireSend"
              style={{ height: 26, width: 'auto', objectFit: 'contain' }}
            />
          </Link>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl text-white mb-4 leading-tight" style={{ fontWeight: 700 }}>
            One platform.<br />
            <span className="text-blue-300">Every channel.</span>
          </h2>
          <p className="text-blue-200 text-base mb-10 leading-relaxed">
            OTP numbers, SMS campaigns, email sending, and a full developer API — all under one roof.
          </p>
          <div className="space-y-4">
            {features.map((feat, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-blue-100 text-sm">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[{ value: '100+', label: 'Countries' }, { value: '50K+', label: 'Users' }, { value: '99.9%', label: 'Uptime' }].map(s => (
            <div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
              <div className="text-white text-xl" style={{ fontWeight: 700 }}>{s.value}</div>
              <div className="text-blue-300 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-start justify-center p-6 bg-gray-50 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <img
              src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
              alt="VireSend icon"
              style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
            />
            <span style={{ color: '#06142B', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>
              Vire<span style={{ color: '#2563EB' }}>Send</span>
            </span>
          </div>

          <div className="lg:hidden mb-6">
            <SignupSideSlider compact />
          </div>

          <div
            className="bg-white p-8 transition-all duration-300 hover:shadow-[0_0_0_1px_rgba(37,99,235,0.18),0_24px_70px_rgba(15,23,42,0.16),0_0_55px_rgba(37,99,235,0.28)]"
            style={{
              borderRadius: 24,
              border: '1px solid rgba(37, 99, 235, 0.22)',
              boxShadow: '0 0 0 1px rgba(37, 99, 235, 0.08), 0 20px 60px rgba(15, 23, 42, 0.12), 0 0 40px rgba(37, 99, 235, 0.18)',
            }}
          >
            <div className="mb-6">
              <h2 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Create your account</h2>
              <p className="text-gray-500 text-sm mt-1">Join thousands using VireSend for communication</p>
            </div>

            {/* Social auth */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => handleSocialAuth('google')}
                disabled={!!socialLoading}
                className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60"
                style={{ fontWeight: 500 }}
              >
                {socialLoading === 'google' ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <GoogleIcon />}
                Continue with Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialAuth('github')}
                disabled={!!socialLoading}
                className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60"
                style={{ fontWeight: 500 }}
              >
                {socialLoading === 'github' ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Github className="w-4 h-4 text-gray-800" />}
                Continue with GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs text-gray-400 bg-white px-3">or sign up with email</div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={form.name} onChange={e => update('name', e.target.value)} placeholder="John Mensah" className={inputClass('name')} />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="john@example.com" className={inputClass('email')} />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+233 50 123 4567" className={inputClass('phone')} />
                </div>
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => update('password', e.target.value)}
                    placeholder="Create a strong password"
                    className={inputClass('password')}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}

                {/* Strength bar */}
                {form.password && strength && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden mr-3">
                        <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.w}`} />
                      </div>
                      <span className={`text-xs ${strength.text}`} style={{ fontWeight: 600 }}>{strength.label}</span>
                    </div>
                  </div>
                )}

                {/* Rules checklist */}
                {form.password && (
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    {rules.map(rule => {
                      const met = rule.test(form.password);
                      return (
                        <div key={rule.id} className="flex items-center gap-1.5">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 ${met ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                            {met && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className={`text-xs ${met ? 'text-emerald-600' : 'text-gray-400'}`}>{rule.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={e => update('confirmPassword', e.target.value)}
                    placeholder="Repeat your password"
                    className={inputClass('confirmPassword')}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
                {!errors.confirmPassword && form.confirmPassword && form.password === form.confirmPassword && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Passwords match</p>
                )}
              </div>

              {/* Terms */}
              <div>
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={form.agreeTerms}
                    onChange={e => update('agreeTerms', e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-blue-900 rounded flex-shrink-0"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600">
                    I agree to the{' '}
                    <Link to="/terms-of-service" className="text-blue-600 hover:underline">Terms of Service</Link>{' '}
                    and{' '}
                    <Link to="/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</Link>
                  </label>
                </div>
                {errors.agreeTerms && <p className="text-xs text-red-500 mt-1">{errors.agreeTerms}</p>}
              </div>

              {/* reCAPTCHA */}
              <div>
                <div className="overflow-hidden rounded-xl">
                  {RECAPTCHA_SITE_KEY ? (
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={RECAPTCHA_SITE_KEY}
                      onChange={token => {
                        setCaptchaToken(token || '');
                        setErrors(prev => ({ ...prev, captcha: '' }));
                      }}
                      onExpired={() => setCaptchaToken('')}
                      onErrored={() => {
                        setCaptchaToken('');
                        setErrors(prev => ({ ...prev, captcha: 'Captcha could not load. Please try again.' }));
                      }}
                    />
                  ) : (
                    <MockCaptcha
                      verified={!!captchaToken}
                      onVerify={() => {
                        setCaptchaToken('captcha-not-configured');
                        setErrors(prev => ({ ...prev, captcha: '' }));
                      }}
                    />
                  )}
                </div>
                {errors.captcha && <p className="text-xs text-red-500 mt-1">{errors.captcha}</p>}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || (RECAPTCHA_SITE_KEY && !captchaToken)}
                className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-70 text-white py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account...</> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
              </button>

            </form>

            <p className="text-center text-sm text-gray-500 mt-5">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-800" style={{ fontWeight: 500 }}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
