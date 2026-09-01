import { motion } from 'motion/react';
import { BarChart2, CheckCircle, Mail, MessageSquare, Send, Shield, Smartphone, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { HeroSlideData } from './heroSlides';

const SUCCESS = '#10B981';
const DARK_TEXT = '#0F172A';
const SLATE = '#64748B';
const WHITE = '#FFFFFF';

function HeroDashboard({ slide }: { slide: HeroSlideData }) {
  const Icon = slide.icon;
  const isSms = slide.mode === 'sms';
  const isOtp = slide.mode === 'otp';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, y: 18 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: -28, y: 12 }}
      transition={{ duration: 0.65, delay: 0.7, ease: 'easeOut' }}
      className="relative w-full max-w-[470px] mx-auto"
      style={{ minHeight: 430 }}
    >
      <div
        className="absolute inset-0 rounded-[32px]"
        style={{ background: `radial-gradient(ellipse at center, ${slide.theme}55 0%, transparent 68%)`, filter: 'blur(44px)' }}
      />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(11,31,63,0.9)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.44)',
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex gap-1.5">
            {['#FF5F57', '#FEBC2E', '#28C840'].map(color => <div key={color} className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />)}
          </div>
          <div className="flex-1 text-center">
            <span className="text-[10px] sm:text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
              app.viresender.com/{slide.mode}
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs" style={{ color: '#94a3b8' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: SUCCESS }} />
            Live
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${slide.theme}22` }}>
                <Icon size={20} style={{ color: slide.theme }} />
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
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${slide.theme}20` }}><Users size={16} style={{ color: slide.theme }} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs truncate" style={{ fontWeight: 700 }}>{name}</div>
                    <div className="text-[10px]" style={{ color: '#94a3b8' }}>{[12400, 8300, 6100][i].toLocaleString()} contacts ready</div>
                  </div>
                  <div className="text-[10px]" style={{ color: SUCCESS, fontWeight: 700 }}>Delivered</div>
                </div>
              ))}
              <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between text-[10px] mb-2" style={{ color: '#94a3b8' }}><span>Campaign delivery</span><span>86%</span></div>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full rounded-full" style={{ width: '86%', background: `linear-gradient(90deg, ${slide.theme}, ${slide.accent})` }} /></div>
              </div>
            </div>
          )}

          {isOtp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {['WhatsApp', 'Telegram', 'Facebook', 'Google', 'TikTok'].map(service => (
                  <div key={service} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${slide.theme}18` }}><Smartphone size={14} style={{ color: slide.theme }} /></div>
                      <div className="text-white text-[11px]" style={{ fontWeight: 700 }}>{service}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${slide.theme}, ${slide.accent})` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-xs" style={{ fontWeight: 800 }}>Received Successfully</span>
                  <Shield size={16} className="text-cyan-100" />
                </div>
                <div className="flex gap-1.5 justify-center">
                  {'582394'.split('').map((digit, index) => (
                    <div key={`${digit}-${index}`} className="w-9 h-11 rounded-xl bg-white/20 flex items-center justify-center text-white" style={{ fontWeight: 900 }}>{digit}</div>
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
                    <div className="text-[10px]" style={{ color: '#94a3b8' }}>24,500 subscribers</div>
                  </div>
                  <Mail size={18} style={{ color: slide.theme }} />
                </div>
                <div className="space-y-2">
                  {[72, 54, 91].map((width, index) => (
                    <div key={index} className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${width}%`, background: index === 2 ? SUCCESS : slide.theme }} />
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
        transition={{ delay: 0.9, duration: 0.6, y: { repeat: Infinity, duration: 3.8, ease: 'easeInOut' } }}
        className="absolute -bottom-2 left-4 sm:-left-6 rounded-2xl p-3 shadow-2xl"
        style={{ background: WHITE, width: 178, boxShadow: `0 18px 44px ${slide.theme}30` }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: `${slide.theme}14` }}>
            <Icon size={13} style={{ color: slide.theme }} />
          </div>
          <div className="text-[10px]" style={{ color: DARK_TEXT, fontWeight: 800 }}>{slide.primaryButton.label}</div>
        </div>
        <div className="text-[9px]" style={{ color: SLATE }}>Ready from one dashboard</div>
      </motion.div>
    </motion.div>
  );
}

interface HeroSlideProps {
  slide: HeroSlideData;
  direction: number;
}

export default function HeroSlide({ slide, direction }: HeroSlideProps) {
  const headlineParts = slide.title.split(' ');
  const highlight = headlineParts.slice(-2).join(' ');
  const headlineStart = headlineParts.slice(0, -2).join(' ');
  const Icon = slide.icon;

  return (
    <motion.div
      key={slide.key}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="absolute inset-0"
    >
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(rgba(5,12,28,.82), rgba(5,12,28,.86)), url(${slide.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
        initial={{ scale: 1.04 }}
        animate={{ scale: 1.12 }}
        transition={{ duration: 5.6, ease: 'easeOut' }}
      />

      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 72% 36%, ${slide.theme}30, transparent 36%)` }} />

      <div className="relative z-10 max-w-6xl mx-auto px-5 pt-32 pb-20 md:pt-36 md:pb-24 min-h-screen flex items-center">
        <div className="grid lg:grid-cols-[1fr_470px] items-center gap-12 lg:gap-10 w-full">
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.52, ease: 'easeOut' }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5 text-xs sm:text-sm"
              style={{ background: `${slide.theme}18`, color: '#dbeafe', border: `1px solid ${slide.theme}35`, fontWeight: 700 }}
            >
              <Icon size={15} style={{ color: slide.accent }} />
              {slide.eyebrow}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.62, ease: 'easeOut' }}
              className="text-white mb-5"
              style={{
                fontSize: 'clamp(2.15rem, 6vw, 4rem)',
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: 0,
              }}
            >
              {headlineStart}{' '}
              <span
                style={{
                  background: `linear-gradient(90deg, ${slide.accent}, ${slide.theme})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {highlight}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.55, ease: 'easeOut' }}
              className="text-base sm:text-lg max-w-xl mx-auto lg:mx-0 mb-3 leading-relaxed"
              style={{ color: '#bfdbfe' }}
            >
              {slide.description}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.55, ease: 'easeOut' }}
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-7 mt-8"
            >
              <Link to={slide.primaryButton.href}>
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: `0 12px 32px ${slide.theme}55` }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-white w-full sm:w-auto"
                  style={{ background: `linear-gradient(135deg, ${slide.theme}, ${slide.accent})`, fontWeight: 700, boxShadow: `0 8px 24px ${slide.theme}40`, minWidth: 200 }}
                >
                  <Send size={17} />
                  {slide.primaryButton.label}
                </motion.button>
              </Link>
              <Link to={slide.secondaryButton.href}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-white w-full sm:w-auto"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', fontWeight: 700, minWidth: 180 }}
                >
                  {slide.secondaryButton.label}
                </motion.button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.58, duration: 0.5, ease: 'easeOut' }}
              className="flex flex-wrap gap-7 justify-center lg:justify-start"
            >
              {[
                { value: '5M+', label: 'Messages Sent' },
                { value: '120+', label: 'Countries' },
                { value: '99.9%', label: 'Uptime' },
                { value: 'Ghana+', label: 'Local Reach' },
              ].map(item => (
                <div key={item.label} className="text-center lg:text-left">
                  <div className="text-white text-xl" style={{ fontWeight: 800 }}>{item.value}</div>
                  <div className="text-sm" style={{ color: SLATE, fontWeight: 500 }}>{item.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <HeroDashboard slide={slide} key={`${slide.key}-${direction}`} />
        </div>
      </div>
    </motion.div>
  );
}
