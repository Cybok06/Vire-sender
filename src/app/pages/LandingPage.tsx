import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu, X, Send, Mail, MessageSquare, Zap, Globe, Shield,
  CheckCircle, ArrowRight, ChevronDown, ChevronRight,
  BarChart2, Users, Upload, FileText, Smartphone, Settings,
  Hash, Code, Key, Webhook, Activity, Clock, Wallet,
  LayoutDashboard, Bell, Database, Megaphone, AtSign,
  Server, BookOpen, LifeBuoy, Twitter, Linkedin, Github,
  Phone, RefreshCw, Star, TrendingUp
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import CookieBanner from '../components/public/CookieBanner';
import HeroSlider from '../components/hero/HeroSlider';
import { useAuth } from '../contexts/AuthContext';
import { getScrollDepth, hasAnalyticsConsent, trackEvent, trackPageView, trackSessionEnd } from '../../lib/analytics';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const DEEP_NAVY   = '#06142B';
const DARK_NAVY   = '#0B1F3F';
const PRIMARY     = '#2563EB';
const ELEC_BLUE   = '#1D4ED8';
const CYAN        = '#0EA5E9';
const SUCCESS     = '#10B981';
const LIGHT_BG    = '#F1F5F9';
const SLATE       = '#64748B';
const DARK_TEXT   = '#0F172A';
const WHITE       = '#FFFFFF';

// ─── NAVBAR ────────────────────────────────────────────��──────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, user } = useAuth();

  const aiDestination = isAuthenticated
    ? (user?.role === 'admin' ? '/admin/dashboard' : '/user/dashboard')
    : '/login';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: 'Home',     href: '#' },
    { label: 'Services', href: '#services' },
    { label: 'VireSend AI', href: aiDestination },
    { label: 'Pricing',  href: '#pricing' },
    { label: 'API',      href: '#api' },
    { label: 'FAQ',      href: '#faq' },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(6,20,43,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
            alt="VireSend icon"
            style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }}
          />
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
            alt="VireSend"
            style={{ height: 26, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-7">
          {navLinks.map(({ label, href }) => label === 'VireSend AI' ? (
            <Link
              key={label}
              to={href}
              className="text-blue-200 text-sm transition-colors hover:text-white"
              style={{ fontWeight: 500 }}
            >
              {label}
            </Link>
          ) : (
            <a
              key={label}
              href={href}
              className="text-blue-200 text-sm transition-colors hover:text-white"
              style={{ fontWeight: 500 }}
            >
              {label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-blue-200 text-sm hover:text-white transition-colors" style={{ fontWeight: 500 }}>
            Login
          </Link>
          <Link
            to="/signup"
            className="px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700, boxShadow: `0 4px 14px rgba(37,99,235,0.4)` }}
          >
            Get Started
          </Link>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2.5 rounded-xl text-white"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden"
            style={{ background: 'rgba(6,20,43,0.98)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="px-5 py-6 flex flex-col gap-4">
              {navLinks.map(({ label, href }) => label === 'VireSend AI' ? (
                <Link
                  key={label}
                  to={href}
                  onClick={() => setOpen(false)}
                  className="text-blue-200 py-2 text-base border-b border-white/5"
                  style={{ fontWeight: 500 }}
                >
                  {label}
                </Link>
              ) : (
                <a
                  key={label}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="text-blue-200 py-2 text-base border-b border-white/5"
                  style={{ fontWeight: 500 }}
                >
                  {label}
                </a>
              ))}
              <div className="flex gap-3 pt-3">
                <Link to="/login" onClick={() => setOpen(false)} className="flex-1 text-center py-3.5 rounded-xl text-white border border-white/20 text-sm" style={{ fontWeight: 600 }}>Login</Link>
                <Link to="/signup" onClick={() => setOpen(false)} className="flex-1 text-center py-3.5 rounded-xl text-white text-sm" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700 }}>Get Started</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ─── HERO SECTION ─────────────────────────────────────────────────────────────
const heroSlides = [
  {
    key: 'sms-marketing',
    eyebrow: 'Bulk SMS marketing',
    headline: 'Send SMS to a Ready Audience',
    subtext: 'Reach targeted contacts instantly with bulk SMS campaigns, delivery tracking, and ready audience access.',
    seoLine: 'Bulk SMS and ready-audience SMS marketing for Ghana and beyond.',
    cta: 'Start Sending SMS',
    href: '/send-sms',
    color: PRIMARY,
    accent: CYAN,
    icon: MessageSquare,
    stats: [
      { label: 'Audience contacts', value: '48,920' },
      { label: 'Delivered', value: '98.6%' },
      { label: 'Live campaigns', value: '12' },
    ],
  },
  {
    key: 'otp-numbers',
    eyebrow: 'OTP virtual numbers',
    headline: 'Buy OTP Numbers for Online Services',
    subtext: 'Get virtual numbers for OTP verification across supported platforms with fast code delivery.',
    seoLine: 'OTP virtual numbers for online service verification across Ghana and beyond.',
    cta: 'Buy OTP Number',
    href: '/otp-numbers',
    color: SUCCESS,
    accent: CYAN,
    icon: Shield,
    stats: [
      { label: 'Supported services', value: '1,000+' },
      { label: 'Code delivery', value: 'Fast' },
      { label: 'Countries', value: '120+' },
    ],
  },
  {
    key: 'email-campaigns',
    eyebrow: 'Email campaign sending',
    headline: 'Send Email Campaigns That Convert',
    subtext: 'Create and send email campaigns, manage recipients, and track delivery performance from one dashboard.',
    seoLine: 'Email campaign sending with recipient management and delivery analytics.',
    cta: 'Send Emails',
    href: '/email-sender',
    color: '#8b5cf6',
    accent: PRIMARY,
    icon: Mail,
    stats: [
      { label: 'Recipients', value: '24,500' },
      { label: 'Open tracking', value: 'Live' },
      { label: 'Delivery', value: '96.5%' },
    ],
  },
];

function HeroSlideVisual({ slide }: { slide: typeof heroSlides[number] }) {
  const Icon = slide.icon;
  const isSms = slide.key === 'sms-marketing';
  const isOtp = slide.key === 'otp-numbers';

  return (
    <motion.div
      initial={{ opacity: 0, x: 28, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: -24, y: 8 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="relative w-full max-w-[460px] mx-auto"
      style={{ minHeight: 430 }}
    >
      <div
        className="absolute inset-0 rounded-[32px]"
        style={{
          background: `radial-gradient(ellipse at center, ${slide.color}55 0%, transparent 68%)`,
          filter: 'blur(44px)',
        }}
      />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(11,31,63,0.9)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.42)',
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex gap-1.5">
            {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
          </div>
          <div className="flex-1 text-center">
            <span className="text-[10px] sm:text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>app.viresender.com/{isOtp ? 'otp' : isSms ? 'sms' : 'email'}</span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs" style={{ color: '#94a3b8' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: SUCCESS }} />
            Live
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${slide.color}22` }}>
                <Icon size={20} style={{ color: slide.color }} />
              </div>
              <div>
                <div className="text-white text-sm" style={{ fontWeight: 800 }}>{slide.eyebrow}</div>
                <div className="text-[10px]" style={{ color: '#94a3b8' }}>Ghana and global reach</div>
              </div>
            </div>
            <div className="px-3 py-1 rounded-full text-[10px]" style={{ color: slide.accent, background: `${slide.accent}16`, fontWeight: 700 }}>Active</div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            {slide.stats.map(item => (
              <div key={item.label} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-white text-sm" style={{ fontWeight: 800 }}>{item.value}</div>
                <div className="text-[9px] leading-tight mt-1" style={{ color: '#94a3b8' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {isSms && (
            <div className="space-y-3">
              {['Accra retail audience', 'Kumasi active buyers', 'Tema delivery contacts'].map((name, i) => (
                <div key={name} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.045)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${PRIMARY}20` }}><Users size={16} style={{ color: PRIMARY }} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs truncate" style={{ fontWeight: 700 }}>{name}</div>
                    <div className="text-[10px]" style={{ color: '#94a3b8' }}>{[12400, 8300, 6100][i].toLocaleString()} contacts ready</div>
                  </div>
                  <div className="text-[10px]" style={{ color: SUCCESS, fontWeight: 700 }}>Delivered</div>
                </div>
              ))}
              <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between text-[10px] mb-2" style={{ color: '#94a3b8' }}><span>Campaign delivery</span><span>86%</span></div>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full rounded-full" style={{ width: '86%', background: `linear-gradient(90deg, ${PRIMARY}, ${CYAN})` }} /></div>
              </div>
            </div>
          )}

          {isOtp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {['WhatsApp', 'Telegram', 'Google', 'OpenAI'].map(service => (
                  <div key={service} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${SUCCESS}18` }}><Smartphone size={14} style={{ color: SUCCESS }} /></div>
                      <div className="text-white text-xs" style={{ fontWeight: 700 }}>{service}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-xs" style={{ fontWeight: 800 }}>OTP code received</span>
                  <Shield size={16} className="text-cyan-200" />
                </div>
                <div className="flex gap-1.5 justify-center">
                  {['4','8','2','7','1','9'].map(digit => (
                    <div key={digit} className="w-9 h-11 rounded-xl bg-white/20 flex items-center justify-center text-white" style={{ fontWeight: 900 }}>{digit}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isSms && !isOtp && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.045)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-white text-xs" style={{ fontWeight: 800 }}>June promo campaign</div>
                    <div className="text-[10px]" style={{ color: '#94a3b8' }}>24,500 recipients</div>
                  </div>
                  <Mail size={18} style={{ color: slide.color }} />
                </div>
                <div className="space-y-2">
                  {[72, 54, 91].map((width, i) => (
                    <div key={i} className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${width}%`, background: i === 2 ? SUCCESS : slide.color }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Sent', '18.2K'],
                  ['Opened', '42%'],
                  ['Clicked', '9.8%'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.055)' }}>
                    <div className="text-white text-sm" style={{ fontWeight: 800 }}>{value}</div>
                    <div className="text-[9px]" style={{ color: '#94a3b8' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: [0, -6, 0] }}
        transition={{ delay: 0.25, duration: 0.6, y: { repeat: Infinity, duration: 3.8, ease: 'easeInOut' } }}
        className="absolute -bottom-2 left-4 sm:-left-6 rounded-2xl p-3 shadow-2xl"
        style={{ background: WHITE, width: 170, boxShadow: `0 18px 44px ${slide.color}30` }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: `${slide.color}14` }}>
            <Icon size={13} style={{ color: slide.color }} />
          </div>
          <div className="text-[10px]" style={{ color: DARK_TEXT, fontWeight: 800 }}>{slide.cta}</div>
        </div>
        <div className="text-[9px]" style={{ color: SLATE }}>Ready from one dashboard</div>
      </motion.div>
    </motion.div>
  );
}

function HeroSection() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = heroSlides[activeSlide];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide(current => (current + 1) % heroSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="relative min-h-screen flex items-center pt-20 overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 60%, #0d2563 100%)` }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-20" style={{ background: CYAN, filter: 'blur(120px)' }} />
        <div className="absolute top-1/2 -left-40 w-96 h-96 rounded-full opacity-10" style={{ background: PRIMARY, filter: 'blur(100px)' }} />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 rounded-full opacity-10" style={{ background: ELEC_BLUE, filter: 'blur(90px)' }} />
        {/* Grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="vsgrid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#vsgrid)" />
        </svg>
        {/* Dots */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="vsdots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#vsdots)" />
        </svg>
      </div>

      <div className="relative max-w-6xl mx-auto px-5 py-16 md:py-24 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8">

          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="flex-1 text-center lg:text-left"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.key}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              >
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5 text-xs sm:text-sm"
                  style={{ background: `${slide.color}18`, color: '#dbeafe', border: `1px solid ${slide.color}35`, fontWeight: 700 }}
                >
                  <slide.icon size={15} style={{ color: slide.accent }} />
                  {slide.eyebrow}
                </div>

                <h1
                  className="text-white mb-5"
                  style={{
                    fontSize: 'clamp(2.15rem, 6vw, 4rem)',
                    fontWeight: 900,
                    lineHeight: 1.08,
                    letterSpacing: 0,
                  }}
                >
                  {slide.headline.split(' ').slice(0, -2).join(' ')}{' '}
                  <span
                    style={{
                      background: `linear-gradient(90deg, ${slide.accent}, ${slide.color})`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {slide.headline.split(' ').slice(-2).join(' ')}
                  </span>
                </h1>

                <p className="text-base sm:text-lg max-w-xl mx-auto lg:mx-0 mb-3 leading-relaxed" style={{ color: '#bfdbfe' }}>
                  {slide.subtext}
                </p>
                <p className="text-sm max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed" style={{ color: '#93c5fd' }}>
                  {slide.seoLine}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-6">
              <Link to={slide.href}>
                <motion.button
                  key={slide.cta}
                  whileHover={{ scale: 1.04, boxShadow: `0 12px 32px ${slide.color}55` }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-white w-full sm:w-auto"
                  style={{ background: `linear-gradient(135deg, ${slide.color}, ${ELEC_BLUE})`, fontWeight: 700, boxShadow: `0 8px 24px ${slide.color}40`, minWidth: 190 }}
                >
                  <Send size={17} />
                  {slide.cta}
                </motion.button>
              </Link>
              <Link to="/signup">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-white w-full sm:w-auto"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', fontWeight: 700, minWidth: 160 }}
                >
                  Get Started
                  <ArrowRight size={17} />
                </motion.button>
              </Link>

            </div>

            <div className="flex justify-center lg:justify-start gap-2 mb-9">
              {heroSlides.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                  aria-label={`Show ${item.eyebrow}`}
                  className="h-2.5 rounded-full transition-all"
                  style={{
                    width: activeSlide === index ? 30 : 10,
                    background: activeSlide === index ? item.color : 'rgba(255,255,255,0.28)',
                  }}
                />
              ))}
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-7 justify-center lg:justify-start">
              {[
                { n: '5M+',   l: 'Messages Sent' },
                { n: '120+',  l: 'Countries' },
                { n: '99.9%', l: 'Uptime' },
                { n: 'Ghana+', l: 'Local Reach' },
              ].map(s => (
                <div key={s.l} className="text-center lg:text-left">
                  <div className="text-white text-xl" style={{ fontWeight: 800 }}>{s.n}</div>
                  <div className="text-sm" style={{ color: SLATE, fontWeight: 500 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="relative flex-shrink-0 w-full lg:w-[460px]">
            <AnimatePresence mode="wait">
              <HeroSlideVisual key={slide.key} slide={slide} />
            </AnimatePresence>
          </div>

          {/* Right: Dashboard mockup cluster */}
          <motion.div
            initial={{ opacity: 0, x: 50, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            className="relative flex-shrink-0 hidden"
            style={{ width: 440, height: 520 }}
          >
            {/* Glow */}
            <div className="absolute inset-0 rounded-3xl" style={{ background: `radial-gradient(ellipse at center, rgba(37,99,235,0.35) 0%, transparent 70%)`, filter: 'blur(40px)' }} />

            {/* Main dashboard card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute rounded-3xl overflow-hidden"
              style={{
                top: 30, left: 20, right: 20,
                background: 'rgba(11,31,63,0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
              }}
            >
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-1.5">
                  {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs px-4 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b' }}>app.viresender.com/dashboard</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: SUCCESS }} />
                  <span className="text-xs" style={{ color: '#64748b' }}>Live</span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 p-4">
                {[
                  { label: 'Wallet', val: 'GHS 142.50', color: CYAN, icon: Wallet },
                  { label: 'SMS Sent', val: '12,847', color: PRIMARY, icon: MessageSquare },
                  { label: 'Emails', val: '3,284', color: '#8b5cf6', icon: Mail },
                  { label: 'OTP Orders', val: '247', color: SUCCESS, icon: Hash },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <s.icon size={12} style={{ color: s.color, margin: '0 auto 4px' }} />
                    <div className="text-white text-xs" style={{ fontWeight: 700 }}>{s.val}</div>
                    <div className="text-[9px]" style={{ color: SLATE }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Mini chart */}
              <div className="px-4 pb-2">
                <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white" style={{ fontWeight: 600 }}>Usage Analytics</span>
                    <span className="text-[9px]" style={{ color: SLATE }}>Last 7 days</span>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {[40,65,52,80,58,92,76].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i % 2 === 0 ? PRIMARY : CYAN, opacity: 0.7 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="px-4 pb-4">
                <div className="text-[10px] mb-2" style={{ color: SLATE, fontWeight: 600 }}>Quick Actions</div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Send SMS', icon: MessageSquare, c: PRIMARY },
                    { label: 'Send Email', icon: Mail, c: '#8b5cf6' },
                    { label: 'Buy Number', icon: Hash, c: SUCCESS },
                    { label: 'Campaign', icon: Megaphone, c: '#f59e0b' },
                  ].map((a, i) => (
                    <div key={i} className="rounded-xl p-2.5 text-center cursor-pointer" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <a.icon size={14} style={{ color: a.c, margin: '0 auto 4px' }} />
                      <div className="text-[8px] text-white" style={{ fontWeight: 500 }}>{a.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Floating: SMS card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0, y: [0, -5, 0] }}
              transition={{ delay: 0.8, duration: 0.6, y: { repeat: Infinity, duration: 3.2, ease: 'easeInOut' } }}
              className="absolute rounded-2xl p-3 shadow-2xl"
              style={{ background: WHITE, border: '1px solid rgba(37,99,235,0.12)', boxShadow: '0 16px 40px rgba(37,99,235,0.18)', width: 170, top: 'auto', bottom: -10, left: -20 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${PRIMARY}15` }}>
                  <MessageSquare size={11} style={{ color: PRIMARY }} />
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: DARK_TEXT, fontWeight: 700 }}>SMS Delivered</div>
                  <div className="text-[9px]" style={{ color: SLATE }}>+44 7911 123456</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: SUCCESS }} />
                <span className="text-[9px]" style={{ color: SUCCESS, fontWeight: 600 }}>Delivered · 2s ago</span>
              </div>
            </motion.div>

            {/* Floating: OTP card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
              transition={{ delay: 1, duration: 0.6, y: { repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 0.5 } }}
              className="absolute rounded-2xl p-3 shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, width: 160, top: 40, right: -20, boxShadow: `0 16px 40px rgba(37,99,235,0.4)` }}
            >
              <div className="text-white text-[10px] mb-2 flex items-center gap-1.5" style={{ fontWeight: 700 }}>
                <CheckCircle size={10} className="text-cyan-300" /> OTP Received
              </div>
              <div className="flex gap-1 justify-center mb-1.5">
                {['5','8','2','3','9','4'].map((d, i) => (
                  <div key={i} className="w-5 h-7 bg-white/20 rounded flex items-center justify-center">
                    <span className="text-white text-[10px]" style={{ fontWeight: 800 }}>{d}</span>
                  </div>
                ))}
              </div>
              <div className="text-center text-[8px] text-blue-200">WhatsApp · Tap to copy</div>
            </motion.div>

            {/* Floating: Email card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: [0, -7, 0] }}
              transition={{ delay: 1.2, duration: 0.6, y: { repeat: Infinity, duration: 3.8, ease: 'easeInOut', delay: 1 } }}
              className="absolute rounded-2xl p-3 shadow-2xl"
              style={{ background: WHITE, border: '1px solid rgba(139,92,246,0.15)', boxShadow: '0 16px 40px rgba(139,92,246,0.15)', width: 165, top: 360, right: -15 }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#8b5cf615' }}>
                  <Mail size={11} style={{ color: '#8b5cf6' }} />
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: DARK_TEXT, fontWeight: 700 }}>Email Campaign</div>
                  <div className="text-[9px]" style={{ color: SLATE }}>3,284 sent</div>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full" style={{ background: '#f1f5f9' }}>
                <div className="h-full rounded-full" style={{ width: '96%', background: '#8b5cf6' }} />
              </div>
              <div className="text-[9px] mt-1" style={{ color: '#8b5cf6', fontWeight: 600 }}>96.5% delivered</div>
            </motion.div>

            {/* API request card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0, y: [0, -4, 0] }}
              transition={{ delay: 1.4, duration: 0.6, y: { repeat: Infinity, duration: 3.5, ease: 'easeInOut', delay: 0.8 } }}
              className="absolute rounded-2xl px-3 py-2.5 shadow-xl"
              style={{ background: DARK_NAVY, border: '1px solid rgba(14,165,233,0.2)', width: 160, top: 260, left: -15 }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Code size={9} style={{ color: CYAN }} />
                <span className="text-[9px]" style={{ color: CYAN, fontWeight: 600 }}>API Request</span>
              </div>
              <div className="text-[8px]" style={{ color: '#64748b', fontFamily: 'monospace' }}>POST /v1/sms/send</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: SUCCESS }} />
                <span className="text-[9px]" style={{ color: SUCCESS, fontWeight: 600 }}>200 OK · 142ms</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <path d="M0 40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0V40Z" fill={LIGHT_BG} />
        </svg>
      </div>
    </section>
  );
}

// ─── SERVICES SECTION ─────────────────────────────────────────────────────────
function ServicesSection() {
  const cards = [
    {
      icon: Hash,          color: SUCCESS,    bg: `${SUCCESS}12`,
      title: 'OTP & Virtual Numbers',
      desc:  'Buy virtual numbers and receive verification codes from 1,000+ services across 120+ countries.',
    },
    {
      icon: MessageSquare, color: PRIMARY,    bg: `${PRIMARY}12`,
      title: 'SMS Sender',
      desc:  'Send single or bulk SMS using reliable delivery with custom Sender ID and real-time tracking.',
    },
    {
      icon: Mail,          color: '#8b5cf6',  bg: '#8b5cf612',
      title: 'Email Sender',
      desc:  'Connect Gmail or SMTP and send plain text or HTML emails to individuals or thousands at once.',
    },
    {
      icon: Megaphone,     color: '#f59e0b',  bg: '#f59e0b12',
      title: 'Campaigns',
      desc:  'Run SMS and email campaigns with scheduling, audience targeting, and detailed delivery analytics.',
    },
    {
      icon: Code,          color: CYAN,       bg: `${CYAN}12`,
      title: 'Developer API',
      desc:  'Generate API keys and connect SMS sending to third-party systems, CRMs, or your own app.',
    },
    {
      icon: Users,         color: '#ec4899',  bg: '#ec489912',
      title: 'Contacts & Templates',
      desc:  'Manage contacts, groups, SMS templates, and HTML email templates for reuse across campaigns.',
    },
  ];

  const doubled = [...cards, ...cards];

  return (
    <section id="services" className="py-16 md:py-24 overflow-hidden" style={{ background: WHITE }}>
      <div className="max-w-6xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-block px-4 py-1.5 rounded-full mb-4 text-sm" style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 600 }}>
            Platform Services
          </div>
          <h2 className="mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, color: DARK_TEXT, letterSpacing: '-1.5px' }}>
            Everything you need to communicate faster
          </h2>
          <p className="max-w-xl mx-auto" style={{ color: SLATE }}>
            One unified platform covering all your communication needs — from OTP verification to full campaign management.
          </p>
        </motion.div>
      </div>

      {/* Infinite marquee track */}
      <div
        className="relative"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        }}
      >
        <style>{`
          @keyframes marquee-scroll {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .marquee-track {
            display: flex;
            width: max-content;
            animation: marquee-scroll 32s linear infinite;
          }
          .marquee-track:hover {
            animation-play-state: paused;
          }
        `}</style>

        <div className="marquee-track">
          {doubled.map((card, i) => (
            <div
              key={i}
              className="rounded-2xl p-7 mx-3 cursor-pointer flex-shrink-0 flex flex-col"
              style={{
                width: 300,
                background: LIGHT_BG,
                border: `1.5px solid ${card.color}22`,
                boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
                transition: 'box-shadow 0.3s, transform 0.3s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-6px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 24px 48px ${card.color}22`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.05)';
              }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: card.bg }}>
                <card.icon size={22} style={{ color: card.color }} />
              </div>
              <h3 className="mb-3" style={{ color: DARK_TEXT, fontWeight: 700, fontSize: '1rem' }}>{card.title}</h3>
              <p className="text-sm leading-relaxed flex-1" style={{ color: SLATE }}>{card.desc}</p>
              <div className="mt-5 flex items-center gap-1.5 text-sm" style={{ color: card.color, fontWeight: 600 }}>
                Learn more <ArrowRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── DASHBOARD PREVIEW SECTION ────────────────────────────────────────────────
function DashboardPreviewSection() {
  const bars = [42, 68, 51, 83, 60, 91, 74, 87, 63, 95, 78, 88];

  return (
    <section className="py-16 md:py-24 overflow-hidden" style={{ background: `linear-gradient(160deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 100%)` }}>
      <div className="max-w-6xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-block px-4 py-1.5 rounded-full mb-4 text-sm" style={{ background: `${CYAN}14`, color: CYAN, fontWeight: 600 }}>
            Live Platform Preview
          </div>
          <h2 className="text-white mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-1.5px' }}>
            Your communication command center
          </h2>
          <p className="max-w-lg mx-auto" style={{ color: '#94a3b8' }}>
            One clean dashboard to send SMS, manage emails, buy OTP numbers, and track every message in real time.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="rounded-3xl overflow-hidden"
          style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex gap-1.5">
              {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />)}
            </div>
            <div className="flex-1 flex justify-center">
              <div className="rounded-lg px-5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', maxWidth: 300, textAlign: 'center' }}>
                app.viresender.com/user/dashboard
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: SUCCESS }} />
              <span className="text-xs" style={{ color: '#64748b' }}>Live</span>
            </div>
          </div>

          {/* Dashboard body */}
          <div className="flex" style={{ background: LIGHT_BG, minHeight: 480 }}>
            {/* Sidebar */}
            <div className="hidden sm:flex w-48 flex-shrink-0 flex-col" style={{ background: DARK_NAVY }}>
              <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2">
                  <img
                    src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
                    alt="VireSend"
                    style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }}
                  />
                  <img
                    src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
                    alt="VireSend"
                    style={{ height: 16, width: 'auto', objectFit: 'contain' }}
                  />
                </div>
              </div>
              <div className="mx-3 mt-3 mb-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="text-blue-300 text-[9px] mb-0.5">Wallet Balance</div>
                <div className="text-white text-sm" style={{ fontWeight: 700 }}>GHS 142.50</div>
              </div>
              <div className="text-blue-400 text-[9px] px-4 py-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Menu</div>
              {[
                { icon: LayoutDashboard, label: 'Dashboard', active: true },
                { icon: Hash,            label: 'Buy Number' },
                { icon: MessageSquare,   label: 'Send SMS' },
                { icon: Mail,            label: 'Email Sender' },
              ].map((item, i) => (
                <div key={i} className="mx-2 mb-0.5 flex items-center gap-2 px-3 py-2 rounded-xl text-[10px]"
                  style={{ background: item.active ? PRIMARY : 'transparent', color: item.active ? 'white' : '#93c5fd', fontWeight: item.active ? 600 : 400 }}>
                  <item.icon size={11} />{item.label}
                </div>
              ))}
              <div className="text-blue-400 text-[9px] px-4 py-2 mt-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Campaigns</div>
              {[
                { icon: Megaphone,  label: 'SMS Campaigns' },
                { icon: Mail,       label: 'Email Campaigns' },
                { icon: BarChart2,  label: 'Reports' },
              ].map((item, i) => (
                <div key={i} className="mx-2 mb-0.5 flex items-center gap-2 px-3 py-2 rounded-xl text-[10px]" style={{ color: '#93c5fd' }}>
                  <item.icon size={11} />{item.label}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 p-5 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm" style={{ color: DARK_TEXT, fontWeight: 700 }}>Hello, Alex</div>
                  <div className="text-[10px]" style={{ color: SLATE }}>Manage your SMS, Email and OTP activities</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative p-1.5 bg-white rounded-xl border border-gray-100">
                    <Bell size={13} className="text-gray-400" />
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: PRIMARY }} />
                  </div>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px]" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700 }}>AX</div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Wallet Balance', val: 'GHS 142.50', bg: `linear-gradient(135deg, ${DARK_NAVY}, ${ELEC_BLUE})`, white: true, icon: Wallet },
                  { label: 'SMS Sent',       val: '12,847',  bg: 'white', icon: MessageSquare, c: PRIMARY },
                  { label: 'Emails Sent',    val: '3,284',   bg: 'white', icon: Mail,          c: '#8b5cf6' },
                  { label: 'OTP Orders',     val: '247',     bg: 'white', icon: Hash,           c: SUCCESS },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-4" style={{ background: s.bg, boxShadow: s.white ? 'none' : '0 2px 8px rgba(0,0,0,0.05)', border: s.white ? 'none' : '1px solid rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {s.white ? (
                        <s.icon size={11} style={{ color: '#93c5fd' }} />
                      ) : (
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${(s as any).c}15` }}>
                          <s.icon size={11} style={{ color: (s as any).c }} />
                        </div>
                      )}
                      <span className={`text-[9px] ${s.white ? 'text-blue-200' : 'text-gray-400'}`}>{s.label}</span>
                    </div>
                    <div className={`text-lg ${s.white ? 'text-white' : 'text-gray-800'}`} style={{ fontWeight: 800 }}>{s.val}</div>
                    {i === 0 && (
                      <div className="flex gap-1.5 mt-2">
                        <div className="text-white text-[9px] px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>Deposit</div>
                        <div className="text-white text-[9px] px-2 py-1 rounded-lg" style={{ background: PRIMARY, fontWeight: 600 }}>Buy Number</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* API + Quick actions row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Mini chart */}
                <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs" style={{ color: DARK_TEXT, fontWeight: 600 }}>Message Analytics</span>
                    <span className="text-[9px]" style={{ color: SLATE }}>Last 12 days</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-14">
                    {bars.map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: i % 3 === 0 ? PRIMARY : i % 3 === 1 ? '#8b5cf6' : SUCCESS, opacity: 0.75 }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {[['SMS', PRIMARY], ['Email', '#8b5cf6'], ['OTP', SUCCESS]].map(([l, c]) => (
                      <div key={l} className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-sm" style={{ background: c }} />
                        <span className="text-[8px]" style={{ color: SLATE }}>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent activity */}
                <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }}>
                  <div className="text-xs mb-3" style={{ color: DARK_TEXT, fontWeight: 600 }}>Recent Activity</div>
                  {[
                    { type: 'OTP',   to: '+1 555 234',  status: 'received',  c: SUCCESS },
                    { type: 'SMS',   to: 'Campaign A',  status: 'delivered', c: PRIMARY },
                    { type: 'Email', to: 'user@ex.com', status: 'sent',      c: '#8b5cf6' },
                    { type: 'API',   to: '/v1/sms',     status: '200 OK',    c: CYAN },
                  ].map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: i < 3 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg flex items-center justify-center text-white text-[8px]" style={{ background: m.c, fontWeight: 700 }}>{m.type[0]}</div>
                        <span className="text-[9px]" style={{ color: SLATE }}>{m.to}</span>
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full text-white" style={{ background: m.c }}>{m.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    { n: '01', icon: Settings,  title: 'Create your account',              color: PRIMARY,   desc: 'Sign up in seconds. No credit card required to get started.' },
    { n: '02', icon: Wallet,    title: 'Add funds or connect email',       color: CYAN,      desc: 'Top up your wallet or connect Gmail/SMTP to start sending.' },
    { n: '03', icon: Send,      title: 'Send SMS, Email, OTP or use API', color: '#8b5cf6', desc: 'Pick your channel and start communicating instantly.' },
    { n: '04', icon: BarChart2, title: 'Track delivery and analytics',     color: SUCCESS,   desc: 'Monitor real-time stats, delivery rates, and campaign performance.' },
  ];

  return (
    <section className="py-16 md:py-24 relative overflow-hidden" style={{ background: LIGHT_BG }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5" style={{ background: PRIMARY, filter: 'blur(90px)' }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-5" style={{ background: CYAN, filter: 'blur(80px)' }} />
      </div>
      <div className="max-w-6xl mx-auto px-5 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-block px-4 py-1.5 rounded-full mb-4 text-sm" style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 600 }}>Simple Process</div>
          <h2 className="mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, color: DARK_TEXT, letterSpacing: '-1.5px' }}>
            Start sending in minutes
          </h2>
          <p className="max-w-md mx-auto" style={{ color: SLATE }}>From sign-up to sending your first message in under 3 minutes.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 relative">
          {/* Connector line */}
          <div className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-0.5" style={{ background: `linear-gradient(to right, ${steps[0].color}, ${steps[3].color})`, opacity: 0.2 }} />
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.12 }}
              className="relative text-center p-7 rounded-2xl"
              style={{ background: WHITE, border: `1px solid ${step.color}15`, boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs text-white" style={{ background: step.color, fontWeight: 800 }}>
                Step {step.n}
              </div>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 mt-2" style={{ background: `${step.color}12` }}>
                <step.icon size={24} style={{ color: step.color }} />
              </div>
              <h3 className="mb-3 text-sm" style={{ color: DARK_TEXT, fontWeight: 700 }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: SLATE }}>{step.desc}</p>
              {i < steps.length - 1 && (
                <div className="lg:hidden mt-5 flex justify-center">
                  <ArrowRight size={18} style={{ color: step.color }} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── API SECTION ──────────────────────────────────────────────────────────────
function APISection() {
  const [tab, setTab] = useState<'curl' | 'js' | 'python' | 'php'>('curl');

  const snippets = {
    curl: `curl -X POST https://www.viresender.com/v1/sms/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "message": "Your OTP is 482719",
    "sender_id": "VireSend"
  }'`,
    js: `const VireSend = require('viresend-node');
const client = new VireSend('YOUR_API_KEY');

const response = await client.sms.send({
  to: '+1234567890',
  message: 'Your OTP is 482719',
  senderId: 'VireSend'
});

console.log(response.messageId);`,
    python: `import viresend

client = viresend.Client('YOUR_API_KEY')

response = client.sms.send(
    to='+1234567890',
    message='Your OTP is 482719',
    sender_id='VireSend'
)

print(response['message_id'])`,
    php: `<?php
use VireSend\Client;

$client = new Client('YOUR_API_KEY');

$response = $client->sms->send([
    'to'        => '+1234567890',
    'message'   => 'Your OTP is 482719',
    'sender_id' => 'VireSend',
]);

echo $response['message_id'];`,
  };

  const tabLabels: { key: typeof tab; label: string }[] = [
    { key: 'curl',   label: 'cURL' },
    { key: 'js',     label: 'JavaScript' },
    { key: 'python', label: 'Python' },
    { key: 'php',    label: 'PHP' },
  ];

  return (
    <section id="api" className="py-16 md:py-24" style={{ background: WHITE }}>
      <div className="max-w-6xl mx-auto px-5">
        <div className="flex flex-col lg:flex-row items-center gap-14">
          {/* Code block */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 w-full"
          >
            <div className="rounded-2xl overflow-hidden" style={{ background: DEEP_NAVY, boxShadow: `0 24px 60px rgba(6,20,43,0.25)`, border: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Top bar */}
              <div className="flex items-center gap-2 px-5 py-3.5" style={{ background: DARK_NAVY, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-1.5">
                  {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
                </div>
                <div className="flex-1 flex gap-1 justify-center">
                  {tabLabels.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className="px-3 py-1 rounded-lg text-xs transition-all"
                      style={{
                        background: tab === key ? PRIMARY : 'rgba(255,255,255,0.06)',
                        color: tab === key ? WHITE : '#64748b',
                        fontWeight: tab === key ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: SUCCESS }} />
                  <span className="text-xs" style={{ color: '#64748b' }}>Live</span>
                </div>
              </div>
              {/* Response status bar */}
              <div className="px-5 py-2 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${SUCCESS}20`, color: SUCCESS, fontWeight: 600 }}>POST</span>
                <span className="text-xs" style={{ color: '#64748b', fontFamily: 'monospace' }}>/v1/sms/send</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded" style={{ background: `${SUCCESS}20`, color: SUCCESS, fontWeight: 600 }}>200 OK</span>
              </div>
              {/* Code */}
              <AnimatePresence mode="wait">
                <motion.pre
                  key={tab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-5 text-xs overflow-x-auto"
                  style={{ color: '#e2e8f0', fontFamily: 'monospace', lineHeight: 1.7, margin: 0, minHeight: 200 }}
                >
                  {snippets[tab]}
                </motion.pre>
              </AnimatePresence>
              {/* Response preview */}
              <div className="px-5 py-4" style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="text-xs mb-2" style={{ color: '#64748b', fontWeight: 600 }}>Response</div>
                <pre className="text-xs" style={{ color: SUCCESS, fontFamily: 'monospace', margin: 0 }}>{`{
  "success": true,
  "message_id": "msg_xK9d2pL7",
  "status": "queued",
  "credits_used": 1
}`}</pre>
              </div>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-block px-4 py-1.5 rounded-full mb-5 text-sm" style={{ background: `${CYAN}12`, color: CYAN, fontWeight: 600 }}>Developer API</div>
            <h2 className="mb-5" style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.6rem)', fontWeight: 800, color: DARK_TEXT, lineHeight: 1.15, letterSpacing: '-1.5px' }}>
              Built for<br /><span style={{ color: PRIMARY }}>developers too</span>
            </h2>
            <p className="mb-8 leading-relaxed" style={{ color: SLATE }}>
              Send SMS from your own app, website, CRM or third-party system using secure API keys. Simple REST endpoints, fast response times.
            </p>

            <div className="flex flex-col gap-4 mb-8">
              {[
                { icon: Key,      label: 'API key generation & management',     color: '#f59e0b' },
                { icon: Webhook,  label: 'Webhooks for delivery notifications', color: CYAN },
                { icon: Database, label: 'Usage logs & request history',        color: '#8b5cf6' },
                { icon: Shield,   label: 'Secure HTTPS endpoints',              color: SUCCESS },
              ].map(({ icon: Icon, label, color }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: LIGHT_BG }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}14` }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <span className="text-sm" style={{ color: DARK_TEXT, fontWeight: 500 }}>{label}</span>
                </motion.div>
              ))}
            </div>

            <Link to="/user/api-access">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm text-white"
                style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700, boxShadow: `0 8px 24px rgba(37,99,235,0.35)` }}
              >
                <BookOpen size={16} /> Explore API <ArrowRight size={16} />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── EMAIL FEATURES ───────────────────────────────────────────────────────────
function EmailFeaturesSection() {
  const features = [
    { icon: AtSign,     label: 'Connect Gmail — No password stored',    color: '#ea4335' },
    { icon: Server,     label: 'Custom SMTP — Any email provider',      color: PRIMARY },
    { icon: FileText,   label: 'HTML email builder with code editor',   color: '#8b5cf6' },
    { icon: Smartphone, label: 'Desktop & mobile preview toggle',       color: CYAN },
    { icon: Megaphone,  label: 'Bulk email campaigns with scheduling',  color: '#f59e0b' },
    { icon: BarChart2,  label: 'Open rate & click tracking analytics',  color: SUCCESS },
  ];

  return (
    <section className="py-16 md:py-24 relative overflow-hidden" style={{ background: LIGHT_BG }}>
      <div className="max-w-6xl mx-auto px-5">
        <div className="flex flex-col lg:flex-row items-center gap-14 lg:gap-16">
          {/* Email mockup */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 flex justify-center"
          >
            <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ boxShadow: '0 24px 60px rgba(139,92,246,0.2)', border: '1.5px solid rgba(139,92,246,0.15)' }}>
              <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}>
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><Mail size={15} className="text-white" /></div>
                <div>
                  <div className="text-white text-sm" style={{ fontWeight: 700 }}>Compose Email</div>
                  <div className="text-purple-200 text-[10px]">VireSend Email Sender</div>
                </div>
              </div>
              <div className="p-5" style={{ background: WHITE }}>
                {[
                  { label: 'From:', value: 'you@gmail.com' },
                  { label: 'To:', value: '{recipient}' },
                  { label: 'Subject:', value: 'Welcome to VireSend!' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: i < 2 ? '1px solid rgba(139,92,246,0.08)' : 'none' }}>
                    <span className="text-xs w-14" style={{ color: SLATE, fontWeight: 500 }}>{row.label}</span>
                    <div className="flex-1 rounded-xl px-3 py-2 text-xs border border-gray-100" style={{ background: LIGHT_BG, color: DARK_TEXT }}>{row.value}</div>
                  </div>
                ))}
                <div className="flex gap-2 mb-3">
                  {['Plain Text', 'HTML'].map((t, i) => (
                    <div key={t} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: i === 1 ? '#8b5cf6' : LIGHT_BG, color: i === 1 ? WHITE : SLATE, fontWeight: i === 1 ? 600 : 400 }}>{t}</div>
                  ))}
                </div>
                <div className="rounded-xl p-3 mb-4" style={{ background: '#1e1e2e', minHeight: 80 }}>
                  <div className="text-[10px] leading-loose" style={{ fontFamily: 'monospace' }}>
                    <span style={{ color: '#f7768e' }}>&lt;h1&gt;</span>
                    <span style={{ color: '#e0af68' }}>Hello, {'{{name}}'}</span>
                    <span style={{ color: '#f7768e' }}>&lt;/h1&gt;</span>
                    <br />
                    <span style={{ color: '#f7768e' }}>&lt;p&gt;</span>
                    <span style={{ color: '#9ece6a' }}>Welcome to VireSend!</span>
                    <span style={{ color: '#f7768e' }}>&lt;/p&gt;</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-2.5 rounded-xl text-xs border text-purple-600" style={{ borderColor: 'rgba(139,92,246,0.3)', fontWeight: 600 }}>Preview</button>
                  <button className="flex-1 py-2.5 rounded-xl text-xs text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', fontWeight: 600 }}>Send</button>
                </div>
              </div>
              <div className="px-5 py-3 grid grid-cols-3 gap-3" style={{ background: LIGHT_BG, borderTop: '1px solid rgba(139,92,246,0.08)' }}>
                {[{ n: '3,284', l: 'Sent' }, { n: '96.5%', l: 'Delivered' }, { n: '42%', l: 'Opened' }].map(s => (
                  <div key={s.l} className="text-center">
                    <div className="text-sm" style={{ fontWeight: 700, color: '#7c3aed' }}>{s.n}</div>
                    <div className="text-[9px]" style={{ color: SLATE }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-block px-4 py-1.5 rounded-full mb-5 text-sm" style={{ background: '#8b5cf612', color: '#8b5cf6', fontWeight: 600 }}>Email Sender</div>
            <h2 className="mb-5" style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.6rem)', fontWeight: 800, color: DARK_TEXT, lineHeight: 1.15, letterSpacing: '-1.5px' }}>
              Send beautiful emails<br /><span style={{ color: '#8b5cf6' }}>from your own account</span>
            </h2>
            <p className="mb-8 leading-relaxed" style={{ color: SLATE }}>
              Connect your Gmail via OAuth or any email provider with custom SMTP. Build HTML campaigns, preview them across devices, and track every open and click.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${f.color}12` }}>
                    <f.icon size={14} style={{ color: f.color }} />
                  </div>
                  <span className="text-sm" style={{ color: DARK_TEXT, fontWeight: 500 }}>{f.label}</span>
                </motion.div>
              ))}
            </div>
            <Link to="/signup">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', fontWeight: 700, boxShadow: '0 8px 24px rgba(139,92,246,0.35)' }}
              >
                <Mail size={16} /> Start Sending Emails <ArrowRight size={16} />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── SMS FEATURES ─────────────────────────────────────────────────────────────
function SMSFeaturesSection() {
  const features = [
    { icon: Send,          label: 'Single SMS to any number',            color: PRIMARY },
    { icon: Users,         label: 'Bulk SMS to thousands instantly',     color: CYAN },
    { icon: Upload,        label: 'CSV contact upload & management',     color: SUCCESS },
    { icon: Shield,        label: 'Custom Sender ID branding',           color: '#f59e0b' },
    { icon: Activity,      label: 'Real-time delivery tracking',         color: '#8b5cf6' },
    { icon: FileText,      label: 'Message templates with variables',    color: '#ef4444' },
  ];

  const campaigns = [
    { name: 'Campaign A', count: '12,847', rate: 98, c: PRIMARY },
    { name: 'Campaign B', count: '8,420',  rate: 96, c: SUCCESS },
    { name: 'Campaign C', count: '31,040', rate: 99, c: '#f59e0b' },
  ];

  return (
    <section className="py-16 md:py-24" style={{ background: WHITE }}>
      <div className="max-w-6xl mx-auto px-5">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-14 lg:gap-16">
          {/* SMS campaign mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 flex justify-center"
          >
            <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ boxShadow: `0 24px 60px rgba(37,99,235,0.15)`, border: `1.5px solid ${PRIMARY}18` }}>
              <div className="px-5 py-4 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})` }}>
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><MessageSquare size={15} className="text-white" /></div>
                <div>
                  <div className="text-white text-sm" style={{ fontWeight: 700 }}>SMS Campaign Manager</div>
                  <div className="text-blue-200 text-[10px]">3 active campaigns</div>
                </div>
                <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="p-5" style={{ background: WHITE }}>
                <div className="mb-4 p-4 rounded-2xl text-center cursor-pointer" style={{ background: LIGHT_BG, border: `2px dashed ${PRIMARY}30` }}>
                  <Upload size={18} className="mx-auto mb-2" style={{ color: PRIMARY }} />
                  <div className="text-xs" style={{ color: DARK_TEXT, fontWeight: 600 }}>Upload CSV or add contacts</div>
                  <div className="text-[10px] mt-0.5" style={{ color: SLATE }}>12,847 contacts loaded</div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs w-20" style={{ color: SLATE, fontWeight: 500 }}>Sender ID:</span>
                  <div className="flex-1 rounded-xl px-3 py-2 text-xs border border-gray-200" style={{ background: LIGHT_BG, color: DARK_TEXT, fontWeight: 600 }}>VireSend</div>
                </div>
                <div className="mb-4">
                  <div className="text-xs mb-1.5" style={{ color: SLATE, fontWeight: 500 }}>Message:</div>
                  <div className="rounded-xl p-3 text-[10px] leading-relaxed border border-gray-200" style={{ background: LIGHT_BG, color: DARK_TEXT }}>
                    Hi {'{{name}}'}, your order from VireSend is ready. Track it here: send.vs/track
                  </div>
                </div>
                {campaigns.map((r, i) => (
                  <div key={i} className="p-3 rounded-xl mb-2" style={{ background: LIGHT_BG }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs" style={{ color: DARK_TEXT, fontWeight: 600 }}>{r.name}</span>
                      <span className="text-[10px]" style={{ color: SLATE }}>{r.count} sent</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${r.rate}%`, background: r.c }} />
                    </div>
                    <div className="text-[9px] mt-1" style={{ color: r.c, fontWeight: 600 }}>{r.rate}% delivered</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-block px-4 py-1.5 rounded-full mb-5 text-sm" style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 600 }}>SMS Sender</div>
            <h2 className="mb-5" style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.6rem)', fontWeight: 800, color: DARK_TEXT, lineHeight: 1.15, letterSpacing: '-1.5px' }}>
              Single and bulk SMS<br /><span style={{ color: PRIMARY }}>made simple</span>
            </h2>
            <p className="mb-8 leading-relaxed" style={{ color: SLATE }}>
              Send personalized SMS messages to individuals or upload a CSV of thousands. Set your Sender ID, add variables, and track every delivery in real time.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: LIGHT_BG }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${f.color}14` }}>
                    <f.icon size={14} style={{ color: f.color }} />
                  </div>
                  <span className="text-sm" style={{ color: DARK_TEXT, fontWeight: 500 }}>{f.label}</span>
                </motion.div>
              ))}
            </div>
            <Link to="/signup">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm text-white"
                style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700, boxShadow: `0 8px 24px rgba(37,99,235,0.35)` }}
              >
                <Send size={16} /> Start Sending SMS <ArrowRight size={16} />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── OTP FEATURE SECTION ──────────────────────────────────────────────────────
function OTPSection() {
  const countries = [
    { flag: '🇺🇸', country: 'United States', service: 'WhatsApp',  price: 'GHS 0.15' },
    { flag: '🇬🇧', country: 'United Kingdom', service: 'Telegram',  price: 'GHS 0.20' },
    { flag: '🇩🇪', country: 'Germany',        service: 'Google',    price: 'GHS 0.18' },
    { flag: '🇫🇷', country: 'France',         service: 'Facebook',  price: 'GHS 0.22' },
    { flag: '🇨🇦', country: 'Canada',         service: 'Instagram', price: 'GHS 0.16' },
    { flag: '🇦🇺', country: 'Australia',       service: 'TikTok',   price: 'GHS 0.19' },
  ];

  return (
    <section className="py-16 md:py-24" style={{ background: LIGHT_BG }}>
      <div className="max-w-6xl mx-auto px-5">
        <div className="flex flex-col lg:flex-row items-center gap-14">
          {/* OTP interface mockup */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 flex justify-center"
          >
            <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ boxShadow: `0 24px 60px rgba(16,185,129,0.15)`, border: `1.5px solid ${SUCCESS}20` }}>
              <div className="px-5 py-4 flex items-center gap-3" style={{ background: `linear-gradient(135deg, #059669, ${SUCCESS})` }}>
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><Phone size={14} className="text-white" /></div>
                <div>
                  <div className="text-white text-sm" style={{ fontWeight: 700 }}>OTP Number Picker</div>
                  <div className="text-emerald-100 text-[10px]">1,000+ services · 120+ countries</div>
                </div>
              </div>
              <div className="p-5" style={{ background: WHITE }}>
                {/* Selector row */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-xl p-2.5 border border-gray-200" style={{ background: LIGHT_BG }}>
                    <div className="text-[9px] mb-1" style={{ color: SLATE }}>Country</div>
                    <div className="flex items-center gap-1">
                      <span>🇺🇸</span>
                      <span className="text-xs" style={{ color: DARK_TEXT, fontWeight: 600 }}>United States</span>
                    </div>
                  </div>
                  <div className="rounded-xl p-2.5 border border-gray-200" style={{ background: LIGHT_BG }}>
                    <div className="text-[9px] mb-1" style={{ color: SLATE }}>Service</div>
                    <span className="text-xs" style={{ color: DARK_TEXT, fontWeight: 600 }}>WhatsApp</span>
                  </div>
                </div>

                {/* Virtual number */}
                <div className="p-4 rounded-2xl mb-4" style={{ background: `${SUCCESS}08`, border: `1.5px solid ${SUCCESS}25` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: SUCCESS, fontWeight: 600 }}>Virtual Number Assigned</span>
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: SUCCESS }} />
                  </div>
                  <div className="text-base" style={{ color: DARK_TEXT, fontWeight: 800, letterSpacing: '1px' }}>+1 (555) 234-8912</div>
                  <div className="text-[10px] mt-1" style={{ color: SLATE }}>Waiting for OTP... 14:32 remaining</div>
                  <div className="w-full h-1.5 rounded-full mt-2" style={{ background: 'rgba(0,0,0,0.06)' }}>
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: '60%' }}
                      transition={{ duration: 10, ease: 'linear' }}
                      className="h-full rounded-full"
                      style={{ background: SUCCESS }}
                    />
                  </div>
                </div>

                {/* OTP received */}
                <div className="p-4 rounded-2xl mb-4" style={{ background: `linear-gradient(135deg, #059669, ${SUCCESS})` }}>
                  <div className="flex items-center gap-1.5 mb-3">
                    <CheckCircle size={12} className="text-emerald-200" />
                    <span className="text-[10px] text-emerald-100" style={{ fontWeight: 700 }}>OTP Received!</span>
                    <span className="ml-auto text-[9px] text-emerald-200">WhatsApp</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {['5','8','2','3','9','4'].map((d, i) => (
                      <div key={i} className="w-8 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <span className="text-white" style={{ fontWeight: 800, fontSize: 14 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-emerald-200 text-[9px] text-center mt-2.5">Copied to clipboard</div>
                </div>

                {/* Country list */}
                <div className="flex flex-col gap-2">
                  {countries.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: LIGHT_BG }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 16 }}>{c.flag}</span>
                        <div>
                          <div className="text-[10px]" style={{ color: DARK_TEXT, fontWeight: 600 }}>{c.country}</div>
                          <div className="text-[9px]" style={{ color: SLATE }}>{c.service}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: SUCCESS, fontWeight: 700 }}>{c.price}</span>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: SUCCESS }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-block px-4 py-1.5 rounded-full mb-5 text-sm" style={{ background: `${SUCCESS}12`, color: '#059669', fontWeight: 600 }}>OTP & Virtual Numbers</div>
            <h2 className="mb-5" style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.6rem)', fontWeight: 800, color: DARK_TEXT, lineHeight: 1.15, letterSpacing: '-1.5px' }}>
              Receive OTP codes<br /><span style={{ color: SUCCESS }}>when you need them</span>
            </h2>
            <p className="mb-8 leading-relaxed" style={{ color: SLATE }}>
              Get a real virtual phone number in seconds. Use it to receive verification codes from 1,000+ services across 120+ countries — no SIM card required.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {[
                { label: 'Instant number assignment',  color: SUCCESS },
                { label: '120+ countries supported',    color: PRIMARY },
                { label: '1,000+ supported services',  color: CYAN },
                { label: 'Codes arrive in seconds',    color: '#f59e0b' },
                { label: 'No SIM card required',       color: '#8b5cf6' },
                { label: 'Pay per use — no commitment',color: '#ef4444' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: WHITE, border: `1px solid ${f.color}14` }}>
                  <CheckCircle size={14} style={{ color: f.color, flexShrink: 0 }} />
                  <span className="text-sm" style={{ color: DARK_TEXT, fontWeight: 500 }}>{f.label}</span>
                </div>
              ))}
            </div>
            <Link to="/signup">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm text-white"
                style={{ background: `linear-gradient(135deg, #059669, ${SUCCESS})`, fontWeight: 700, boxShadow: `0 8px 24px rgba(16,185,129,0.35)` }}
              >
                <Hash size={16} /> Get a Number <ArrowRight size={16} />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── PRICING PREVIEW ──────────────────────────────────────────────────────────
function PricingSection() {
  const plans = [
    {
      name: 'Starter',
      badge: 'Pay as you go',
      color: PRIMARY,
      features: [
        'OTP virtual numbers',
        'Single SMS sending',
        'Basic email sending',
        'Gmail OAuth connect',
        'Dashboard access',
        'Usage history',
      ],
    },
    {
      name: 'Business',
      badge: 'Flexible wallet billing',
      color: CYAN,
      popular: true,
      features: [
        'Everything in Starter',
        'Bulk SMS campaigns',
        'Email campaigns',
        'Contacts & groups',
        'Message templates',
        'Delivery analytics',
      ],
    },
    {
      name: 'Developer',
      badge: 'Custom API volume',
      color: '#8b5cf6',
      features: [
        'Everything in Business',
        'Full API access',
        'API key management',
        'Webhooks',
        'Usage logs & reports',
        'Priority support',
      ],
    },
  ];

  return (
    <section id="pricing" className="py-16 md:py-24" style={{ background: `linear-gradient(160deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 100%)` }}>
      <div className="max-w-6xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-block px-4 py-1.5 rounded-full mb-4 text-sm" style={{ background: `${CYAN}14`, color: CYAN, fontWeight: 600 }}>Pricing</div>
          <h2 className="text-white mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-1.5px' }}>
            Simple, wallet-based billing
          </h2>
          <p className="max-w-md mx-auto" style={{ color: '#94a3b8' }}>
            No monthly subscriptions. Top up your wallet and pay only for what you use.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: plan.popular ? `linear-gradient(160deg, rgba(14,165,233,0.12), rgba(37,99,235,0.08))` : 'rgba(255,255,255,0.04)',
                border: plan.popular ? `1.5px solid ${CYAN}40` : '1px solid rgba(255,255,255,0.08)',
                boxShadow: plan.popular ? `0 0 0 1px ${CYAN}20, 0 24px 60px rgba(14,165,233,0.15)` : 'none',
              }}
            >
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${PRIMARY}, ${CYAN})` }} />
              )}
              <div className="p-8">
                {plan.popular && (
                  <div className="inline-block px-3 py-1 rounded-full text-xs mb-4" style={{ background: `${CYAN}20`, color: CYAN, fontWeight: 600 }}>
                    Most Popular
                  </div>
                )}
                <div className="mb-2">
                  <h3 className="text-white" style={{ fontSize: '1.3rem', fontWeight: 800 }}>{plan.name}</h3>
                </div>
                <div className="mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="inline-block px-3 py-1.5 rounded-xl text-sm" style={{ background: `${plan.color}18`, color: plan.color, fontWeight: 700 }}>
                    {plan.badge}
                  </div>
                </div>
                <ul className="flex flex-col gap-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5">
                      <CheckCircle size={14} style={{ color: plan.color, flexShrink: 0 }} />
                      <span className="text-sm" style={{ color: '#cbd5e1' }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/signup">
                  <button
                    className="w-full py-3.5 rounded-xl text-sm text-white transition-all hover:opacity-90"
                    style={{ background: plan.popular ? `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})` : 'rgba(255,255,255,0.08)', fontWeight: 700, border: plan.popular ? 'none' : '1px solid rgba(255,255,255,0.12)' }}
                  >
                    Get Started
                  </button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: '#64748b' }}>
          All plans use wallet credits. Top up any amount, use only what you need.
        </p>
      </div>
    </section>
  );
}

// ─── FAQ SECTION ──────────────────────────────────────────────────────────────
function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  const faqs = [
    {
      q: 'What is VireSend?',
      a: 'VireSend is a unified communication SaaS platform that provides OTP virtual numbers, single and bulk SMS sending, email sending via Gmail or SMTP, bulk email campaigns, developer API access, and contact & template management — all from one clean dashboard.',
    },
    {
      q: 'Can I send bulk SMS?',
      a: 'Yes. You can upload a CSV of contacts, personalize your message with variables like {{name}}, set a custom Sender ID, and send to thousands of recipients at once. Real-time delivery tracking shows results as they happen.',
    },
    {
      q: 'Can I connect Gmail?',
      a: 'Absolutely. Click "Connect Gmail" in the Email Accounts section and authenticate via Google OAuth — no passwords stored. Once connected, all emails are sent directly from your Gmail address.',
    },
    {
      q: 'Can I use my domain email?',
      a: 'Yes. You can connect any email provider using custom SMTP credentials. Add your host, port, username, and password once, and send from your domain address across all campaigns.',
    },
    {
      q: 'Can developers send SMS through API?',
      a: 'Yes. VireSend provides a full REST API. Generate API keys from the API Access section, and send SMS from your app, website, CRM, or any system with a simple POST request. Webhooks are supported for delivery updates.',
    },
    {
      q: 'Can I receive OTP codes?',
      a: 'Yes. Choose your target service and country, buy a virtual number instantly, and your OTP code appears in the dashboard within seconds. Works with 1,000+ services across 120+ countries.',
    },
    {
      q: 'How does wallet billing work?',
      a: 'You top up your VireSend wallet with any amount and pay per use. OTP numbers start from GHS 0.01. SMS from GHS 0.002 each. Emails from GHS 0.0005 each. No monthly commitment, no minimum spend.',
    },
  ];

  return (
    <section id="faq" className="py-16 md:py-24" style={{ background: WHITE }}>
      <div className="max-w-3xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-block px-4 py-1.5 rounded-full mb-4 text-sm" style={{ background: `${PRIMARY}10`, color: PRIMARY, fontWeight: 600 }}>FAQ</div>
          <h2 className="mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, color: DARK_TEXT, letterSpacing: '-1.5px' }}>
            Common questions
          </h2>
          <p style={{ color: SLATE }}>Everything you need to know about VireSend.</p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-2xl overflow-hidden cursor-pointer"
              style={{ background: LIGHT_BG, border: `1.5px solid ${open === i ? `${PRIMARY}30` : 'transparent'}` }}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <div className="flex items-center justify-between p-5">
                <span className="text-sm pr-4" style={{ color: DARK_TEXT, fontWeight: 700 }}>{faq.q}</span>
                <motion.div
                  animate={{ rotate: open === i ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: open === i ? `${PRIMARY}14` : 'rgba(0,0,0,0.05)' }}
                >
                  <ChevronDown size={15} style={{ color: open === i ? PRIMARY : '#9ca3af' }} />
                </motion.div>
              </div>
              <AnimatePresence>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: SLATE, borderTop: `1px solid ${PRIMARY}10` }}>
                      <div className="pt-4">{faq.a}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FINAL CTA ─────────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section className="py-16 md:py-24" style={{ background: LIGHT_BG }}>
      <div className="max-w-4xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl p-12 md:p-16 text-center"
          style={{ background: `linear-gradient(135deg, ${DEEP_NAVY} 0%, #0d2563 100%)`, boxShadow: `0 30px 80px rgba(6,20,43,0.4)` }}
        >
          {/* Glows */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-20" style={{ background: CYAN, filter: 'blur(80px)' }} />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full opacity-15" style={{ background: PRIMARY, filter: 'blur(80px)' }} />
          </div>
          {/* Dots bg */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="ctadots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="white" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#ctadots)" />
          </svg>

          <div className="relative">
            {/* Icon row */}
            <div className="flex items-center justify-center gap-3 mb-7">
              {[
                { icon: MessageSquare, c: PRIMARY },
                { icon: Mail, c: '#8b5cf6' },
                { icon: Hash, c: SUCCESS },
                { icon: Code, c: CYAN },
              ].map(({ icon: Icon, c }, i) => (
                <div key={i} className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <Icon size={20} style={{ color: c }} />
                </div>
              ))}
            </div>

            <h2
              className="text-white mb-5"
              style={{ fontSize: 'clamp(1.7rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-1.5px' }}
            >
              Power your communication<br />from one dashboard
            </h2>
            <p className="mb-10 max-w-lg mx-auto" style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: 1.7 }}>
              Send SMS, emails, OTPs and connect API tools with VireSend.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/signup">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2.5 px-10 py-4 rounded-2xl text-white"
                  style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700, boxShadow: `0 8px 24px rgba(37,99,235,0.5)`, minWidth: 200 }}
                >
                  <Zap size={18} /> Get Started
                </motion.button>
              </Link>
              <Link to="/login">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2.5 px-8 py-4 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.08)', color: WHITE, fontWeight: 700, border: '1.5px solid rgba(255,255,255,0.18)', minWidth: 170 }}
                >
                  Login <ChevronRight size={18} />
                </motion.button>
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-2 justify-center">
              <CheckCircle size={14} style={{ color: SUCCESS }} />
              <span className="text-sm" style={{ color: '#64748b' }}>No credit card required · Pay as you go</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function Footer() {
  const legalLinks = [
    { label: 'Terms of Service', href: '/terms-of-service' },
    { label: 'Privacy Policy',   href: '/privacy-policy'   },
  ];

  const columns = [
    {
      title: 'Product',
      items: [
        { label: 'OTP Numbers',    href: '/#services' },
        { label: 'SMS Sender',     href: '/#services' },
        { label: 'Email Sender',   href: '/#services' },
        { label: 'Bulk Campaigns', href: '/#services' },
        { label: 'API Access',     href: '/#api'      },
      ],
    },
    {
      title: 'Developer',
      items: [
        { label: 'API Reference', href: '/#api'  },
        { label: 'API Keys',      href: '/login' },
        { label: 'Webhooks',      href: '/#api'  },
        { label: 'Usage Logs',    href: '/login' },
        { label: 'SDK (coming)',  href: '#'      },
      ],
    },
    {
      title: 'Legal',
      items: legalLinks,
    },
    {
      title: 'Support',
      items: [
        { label: 'Help Center',   href: '/faq'     },
        { label: 'Contact Us',    href: '/contact' },
        { label: 'Status Page',   href: '#'     },
        { label: 'Documentation', href: '/api' },
      ],
    },
  ];

  return (
    <footer style={{ background: DEEP_NAVY }}>
      <div className="max-w-6xl mx-auto px-5 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img
                src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
                alt="VireSend icon"
                style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
              />
              <img
                src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
                alt="VireSend"
                style={{ height: 24, width: 'auto', objectFit: 'contain' }}
              />
            </div>
            <p className="text-sm leading-relaxed mb-5" style={{ color: '#64748b' }}>
              Send. Connect. Grow.<br />A complete communication platform for SMS, email, OTP and API integration.
            </p>
            <div className="flex gap-2.5">
              {[
                { icon: Twitter,  href: '#' },
                { icon: Linkedin, href: '#' },
                { icon: Github,   href: '#' },
              ].map(({ icon: Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Icon size={15} style={{ color: '#64748b' }} />
                </a>
              ))}
            </div>
          </div>

          {/* Columns */}
          {columns.map(col => (
            <div key={col.title}>
              <h4 className="text-white text-sm mb-5" style={{ fontWeight: 700 }}>{col.title}</h4>
              <ul className="flex flex-col gap-3">
                {col.items.map(({ label, href }) => (
                  <li key={label}>
                    {href.startsWith('/') && !href.startsWith('/#') ? (
                      <Link to={href} className="text-sm transition-colors hover:text-white" style={{ color: '#64748b' }}>{label}</Link>
                    ) : (
                      <a href={href} className="text-sm transition-colors hover:text-white" style={{ color: '#64748b' }}>{label}</a>
                    )}
                  </li>
                ))}
              </ul>
              {col.title === 'Support' && (
                <div className="mt-6 flex items-center gap-2">
                  <LifeBuoy size={14} style={{ color: CYAN }} />
                  <Link to="/login" className="text-sm transition-colors hover:text-white" style={{ color: CYAN, fontWeight: 600 }}>Open a Support Ticket</Link>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm" style={{ color: '#374151' }}>
            © 2026 VireSend. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: SUCCESS }} />
              <span className="text-sm" style={{ color: '#374151' }}>All systems operational</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {legalLinks.map(({ label, href }, i) => (
                <span key={label} className="flex items-center gap-3">
                  {i > 0 && <span style={{ color: '#1f2937' }}>·</span>}
                  <Link to={href} className="transition-colors hover:text-white" style={{ color: '#374151' }}>{label}</Link>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const location = useLocation();

  useEffect(() => {
    const sectionByRoute: Record<string, string> = {
      '/services': 'services',
      '/pricing': 'pricing',
      '/api': 'api',
      '/faq': 'faq',
    };
    const sectionId = location.hash.slice(1) || sectionByRoute[location.pathname];
    if (!sectionId) return;
    const timer = window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.pathname]);

  useEffect(() => {
    const startedAt = Date.now();
    let maxScrollDepth = 0;
    let lastTrackedScroll = 0;
    const ctaLabels = ['Start Sending', 'Get Started', 'Login', 'Services', 'Pricing', 'API', 'FAQ'];

    if (hasAnalyticsConsent()) trackPageView();

    const onScroll = () => {
      maxScrollDepth = Math.max(maxScrollDepth, getScrollDepth());
      if (maxScrollDepth >= lastTrackedScroll + 25) {
        lastTrackedScroll = Math.floor(maxScrollDepth / 25) * 25;
        trackEvent('scroll_depth', { depth: lastTrackedScroll });
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const clickable = target.closest('a,button') as HTMLElement | null;
      if (!clickable) return;
      const label = (clickable.textContent || '').replace(/\s+/g, ' ').trim();
      const href = clickable.getAttribute('href') || '';
      const matched = ctaLabels.find(item => label.toLowerCase().includes(item.toLowerCase()) || href.toLowerCase().includes(item.toLowerCase()));
      if (!matched) return;
      trackEvent('cta_click', { label: matched, text: label.slice(0, 120), href });
    };

    const onEnd = () => {
      trackSessionEnd((Date.now() - startedAt) / 1000, Math.max(maxScrollDepth, getScrollDepth()));
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    window.addEventListener('pagehide', onEnd);

    return () => {
      onEnd();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
      window.removeEventListener('pagehide', onEnd);
    };
  }, []);

  return (
    <div className="w-full max-w-full overflow-x-hidden" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>
      <Navbar />
      <main>
        <HeroSlider />
        <ServicesSection />
        <DashboardPreviewSection />
        <HowItWorksSection />
        <APISection />
        <EmailFeaturesSection />
        <SMSFeaturesSection />
        <OTPSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}
