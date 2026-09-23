import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Menu, X, Twitter, Linkedin, Github, LifeBuoy,
  ArrowLeft, Mail,
} from 'lucide-react';

// ─── Brand ───────────────────────────────────────────────────────────────────
const DEEP_NAVY = '#06142B';
const DARK_NAVY = '#0B1F3F';
const PRIMARY   = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const CYAN      = '#0EA5E9';
const SUCCESS   = '#10B981';

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface Props {
  title: string;
  subtitle: string;
  lastUpdated: string;
  badge: string;
  sections: LegalSection[];
}

// ─── Mini Navbar ─────────────────────────────────────────────────────────────
function LegalNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav
      style={{
        background: 'rgba(6,20,43,0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        position: 'sticky', top: 0, zIndex: 50,
      }}
    >
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public"
            alt="VireSend icon"
            style={{ width: 38, height: 38, objectFit: 'contain' }}
          />
          <img
            src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public"
            alt="VireSend"
            style={{ height: 22, width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        <Link
          to="/"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white transition-all hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700 }}
        >
          <ArrowLeft size={14} /> Back to Home
        </Link>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-xl text-white"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {menuOpen && (
        <div
          className="md:hidden px-5 pb-5 flex flex-col gap-4"
          style={{ background: 'rgba(6,20,43,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-white"
            style={{ background: `linear-gradient(135deg,${PRIMARY},${ELEC_BLUE})`, fontWeight: 700 }}
          >
            <ArrowLeft size={14} /> Back to Home
          </Link>
        </div>
      )}
    </nav>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function LegalFooter() {
  const cols: Array<{ title: string; items: Array<{ label: string; href: string }> }> = [
    {
      title: 'Product',
      items: [
        { label: 'OTP Numbers', href: '/' },
        { label: 'SMS Sender', href: '/' },
        { label: 'Email Sender', href: '/' },
        { label: 'Bulk Campaigns', href: '/' },
        { label: 'API Access', href: '/' },
      ],
    },
    {
      title: 'Developer',
      items: [
        { label: 'API Reference', href: '/' },
        { label: 'API Keys', href: '/' },
        { label: 'Webhooks', href: '/' },
        { label: 'Usage Logs', href: '/' },
      ],
    },
    {
      title: 'Legal',
      items: [
        { label: 'Terms of Service', href: '/terms-of-service' },
        { label: 'Privacy Policy', href: '/privacy-policy' },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Help Center', href: '/' },
        { label: 'Contact Us', href: '/' },
        { label: 'Status Page', href: '/' },
        { label: 'Documentation', href: '/' },
      ],
    },
  ];

  return (
    <footer style={{ background: DEEP_NAVY }}>
      <div className="max-w-6xl mx-auto px-5 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/65573ab7-9c28-47f7-5e95-88316a5f6900/public" alt="VireSend" style={{ width: 38, height: 38, objectFit: 'contain' }} />
              <img src="https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/0c85cfcd-f410-4b49-69ec-5b02a5d67b00/public" alt="VireSend" style={{ height: 22, width: 'auto', objectFit: 'contain' }} />
            </div>
            <p className="text-sm leading-relaxed mb-5" style={{ color: '#64748b' }}>
              Send. Connect. Grow.<br />Complete communication platform for SMS, email, OTP and API.
            </p>
            <div className="flex gap-2.5">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <a key={i} href="#" className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Icon size={14} style={{ color: '#64748b' }} />
                </a>
              ))}
            </div>
          </div>

          {cols.map(col => (
            <div key={col.title}>
              <h4 className="text-white text-sm mb-4" style={{ fontWeight: 700 }}>{col.title}</h4>
              <ul className="flex flex-col gap-2.5">
                {col.items.map(item => (
                  <li key={item.label}>
                    <Link to={item.href} className="text-sm transition-colors hover:text-white" style={{ color: '#64748b' }}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {col.title === 'Support' && (
                <div className="mt-5 flex items-center gap-2">
                  <LifeBuoy size={13} style={{ color: CYAN }} />
                  <Link to="/login" className="text-sm transition-colors hover:text-white" style={{ color: CYAN, fontWeight: 600 }}>Open a Ticket</Link>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm" style={{ color: '#374151' }}>© 2026 VireSend. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: SUCCESS }} />
            <span className="text-sm" style={{ color: '#374151' }}>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────
export default function LegalPageLayout({ title, subtitle, lastUpdated, badge, sections }: Props) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id || '');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const offsets = sections.map(s => {
        const el = document.getElementById(s.id);
        if (!el) return { id: s.id, top: Infinity };
        return { id: s.id, top: el.getBoundingClientRect().top };
      });
      const visible = offsets.filter(o => o.top <= 140);
      if (visible.length > 0) {
        setActiveSection(visible[visible.length - 1].id);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', 'Poppins', sans-serif", background: '#f8fafc', minHeight: '100vh' }}>
      <LegalNavbar />

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 60%, #0d2563 100%)`, padding: '56px 20px 52px' }}>
        <div className="max-w-6xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm mb-6 transition-colors hover:text-white"
            style={{ color: '#64748b' }}
          >
            <ArrowLeft size={14} /> Back to Home
          </Link>
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4 text-sm"
            style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)', color: CYAN, fontWeight: 600 }}
          >
            {badge}
          </div>
          <h1 style={{ color: 'white', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 900, letterSpacing: 0, marginBottom: 10 }}>
            {title}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 16 }}>{subtitle}</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm" style={{ color: '#64748b' }}>
              Last updated: <strong style={{ color: '#94a3b8' }}>{lastUpdated}</strong>
            </span>
            <span style={{ color: '#1f2937' }}>·</span>
            <span className="text-sm" style={{ color: '#64748b' }}>
              Effective: <strong style={{ color: '#94a3b8' }}>{lastUpdated}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-5 py-10">
        <div className="flex gap-10 items-start">

          {/* TOC */}
          <aside className="hidden lg:block flex-shrink-0" style={{ width: 240, position: 'sticky', top: 80 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                On this page
              </div>
              <nav className="flex flex-col gap-0.5">
                {sections.map(s => (
                  <button
                    key={s.id}
                    onClick={() => scrollToSection(s.id)}
                    style={{
                      background: activeSection === s.id ? 'rgba(37,99,235,0.07)' : 'transparent',
                      border: 'none',
                      borderLeft: activeSection === s.id ? `3px solid ${PRIMARY}` : '3px solid transparent',
                      padding: '7px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: activeSection === s.id ? 700 : 500,
                      color: activeSection === s.id ? PRIMARY : '#64748b',
                      cursor: 'pointer',
                      textAlign: 'left',
                      lineHeight: 1.4,
                      transition: 'all 0.15s',
                      width: '100%',
                    }}
                  >
                    {s.title}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main */}
          <div ref={contentRef} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 2px 20px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              {sections.map((section, i) => (
                <section
                  key={section.id}
                  id={section.id}
                  style={{
                    padding: '32px 36px',
                    borderBottom: i < sections.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <span
                      style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 11, fontWeight: 800,
                      }}
                    >
                      {i + 1}
                    </span>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      {section.title}
                    </h2>
                  </div>
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.8 }}>
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            {/* Contact block */}
            <div
              className="mt-8 p-8 rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${DEEP_NAVY} 0%, ${DARK_NAVY} 100%)`, border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <LifeBuoy size={20} style={{ color: CYAN }} />
                </div>
                <div>
                  <h3 style={{ color: 'white', fontWeight: 800, fontSize: 16, margin: '0 0 4px' }}>Questions or Concerns?</h3>
                  <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                    If you have any questions about this policy or your data, our team is here to help.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`, fontWeight: 700 }}
                >
                  <LifeBuoy size={14} /> Open a Support Ticket
                </Link>
                <a
                  href="mailto:support@viresender.com"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 600 }}
                >
                  <Mail size={14} /> support@viresender.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LegalFooter />
    </div>
  );
}

