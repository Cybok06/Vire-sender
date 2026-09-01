import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Cookie, X, Settings, CheckCheck, XCircle } from 'lucide-react';
import { getStoredConsent, requestVisitorLocation, saveCookieConsent, trackPageView } from '../../../lib/analytics';

const PRIMARY   = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const DEEP_NAVY = '#06142B';
interface Prefs {
  essential: boolean;
  analytics: boolean;
  performance: boolean;
  marketing: boolean;
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ essential: true, analytics: true, performance: true, marketing: false });

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
    if (stored.preferences?.analytics) trackPageView();
  }, []);

  async function saveConsent(value: 'all' | 'custom' | 'essential', nextPrefs: Prefs) {
    await saveCookieConsent(value, nextPrefs);
    setVisible(false);
  }

  function acceptAll() {
    saveConsent('all', { essential: true, analytics: true, performance: true, marketing: true }).then(() => {
      trackPageView();
      requestVisitorLocation();
    });
  }

  function rejectNonEssential() {
    saveConsent('essential', { essential: true, analytics: false, performance: false, marketing: false });
  }

  function savePrefsHandler() {
    const nextPrefs = { ...prefs, essential: true };
    saveConsent(nextPrefs.analytics ? 'custom' : 'essential', nextPrefs).then(() => {
      if (nextPrefs.analytics) {
        trackPageView();
        requestVisitorLocation();
      }
    });
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        width: 'min(560px, calc(100vw - 32px))',
      }}
    >
      <div
        style={{
          background: DEEP_NAVY,
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {!showPrefs ? (
          <div style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Cookie size={18} style={{ color: '#0EA5E9' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, margin: '0 0 4px', fontFamily: "'Inter',sans-serif" }}>
                  We use cookies
                </p>
                <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.7, margin: 0, fontFamily: "'Inter',sans-serif" }}>
                  VireSend uses cookies to keep you signed in, improve security, and enhance your experience.{' '}
                  <Link to="/cookie-policy" style={{ color: '#0EA5E9', textDecoration: 'underline' }}>
                    Cookie Policy
                  </Link>
                </p>
              </div>
              <button
                onClick={rejectNonEssential}
                aria-label="Close cookie banner"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', flexShrink: 0, padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                onClick={acceptAll}
                style={{
                  flex: '1 1 140px', padding: '9px 16px', borderRadius: 12, border: 'none',
                  background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
                  color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                <CheckCheck size={13} /> Accept All
              </button>
              <button
                onClick={rejectNonEssential}
                style={{
                  flex: '1 1 140px', padding: '9px 16px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                <XCircle size={13} /> Reject Non-Essential
              </button>
              <button
                onClick={() => setShowPrefs(true)}
                style={{
                  flex: '1 1 140px', padding: '9px 16px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                  color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                <Settings size={13} /> Manage Preferences
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ color: 'white', fontWeight: 700, fontSize: 14, margin: 0, fontFamily: "'Inter',sans-serif" }}>
                Cookie Preferences
              </p>
              <button onClick={() => setShowPrefs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {[
              { key: 'essential' as const, label: 'Essential Cookies', desc: 'Required for login, sessions, and security. Always active.', locked: true },
              { key: 'analytics' as const, label: 'Analytics Cookies', desc: 'Help us understand how users use VireSend so we can improve it.', locked: false },
              { key: 'performance' as const, label: 'Performance Cookies', desc: 'Help us measure page speed, stability, and browsing quality.', locked: false },
              { key: 'marketing' as const, label: 'Marketing Cookies', desc: 'Used to measure the effectiveness of marketing campaigns.', locked: false },
            ].map(pref => (
              <div
                key={pref.key}
                style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                  padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'white', fontWeight: 600, fontSize: 12, margin: '0 0 3px', fontFamily: "'Inter',sans-serif" }}>{pref.label}</p>
                  <p style={{ color: '#64748b', fontSize: 11, margin: 0, lineHeight: 1.6, fontFamily: "'Inter',sans-serif" }}>{pref.desc}</p>
                </div>
                {pref.locked ? (
                  <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700, flexShrink: 0, marginTop: 2, padding: '3px 8px', background: 'rgba(16,185,129,0.12)', borderRadius: 6 }}>
                    Always On
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      const k = pref.key as keyof Prefs;
                      setPrefs(p => ({ ...p, [k]: !p[k] }));
                    }}
                    style={{
                      width: 40, height: 22, borderRadius: 11, border: 'none',
                      background: prefs[pref.key as keyof Prefs] ? PRIMARY : 'rgba(255,255,255,0.1)',
                      cursor: 'pointer', position: 'relative', flexShrink: 0,
                      transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: prefs[pref.key as keyof Prefs] ? 20 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={savePrefsHandler}
                style={{
                  flex: 1, padding: '9px 16px', borderRadius: 12, border: 'none',
                  background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
                  color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                Save Preferences
              </button>
              <button
                onClick={acceptAll}
                style={{
                  flex: 1, padding: '9px 16px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                Accept All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


