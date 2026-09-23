import type { ReactNode } from 'react';
import LegalPageLayout from '../../components/public/LegalPageLayout';
import type { LegalSection } from '../../components/public/LegalPageLayout';

function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 12px', lineHeight: 1.85 }}>{children}</p>;
}
function B({ children }: { children: ReactNode }) {
  return <strong style={{ color: '#0f172a', fontWeight: 700 }}>{children}</strong>;
}
function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '8px 0 12px', paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ color: '#374151', lineHeight: 1.7, marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

interface CookieRow {
  name: string;
  type: string;
  purpose: string;
  expiry: string;
}

function CookieTable({ rows }: { rows: CookieRow[] }) {
  return (
    <div style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Cookie / Category', 'Type', 'Purpose', 'Expiry'].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbff' }}>
              <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{row.name}</td>
              <td style={{ padding: '10px 14px', color: '#64748b' }}>{row.type}</td>
              <td style={{ padding: '10px 14px', color: '#374151' }}>{row.purpose}</td>
              <td style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.expiry}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiePolicyPage() {
  const cookieRows: CookieRow[] = [
    { name: 'Essential Cookies', type: 'First-party', purpose: 'Required for authentication, session management, and core platform functions. Cannot be disabled.', expiry: 'Session / 30 days' },
    { name: 'Security Cookies', type: 'First-party', purpose: 'CSRF tokens, bot detection, and account protection mechanisms.', expiry: 'Session' },
    { name: 'Analytics Cookies', type: 'First/Third-party', purpose: 'Track page views, feature usage, and user flows to improve the platform experience.', expiry: '12 months' },
    { name: 'Preference Cookies', type: 'First-party', purpose: 'Remember UI preferences such as theme, sidebar state, and notification settings.', expiry: '12 months' },
    { name: 'Marketing Cookies', type: 'Third-party (optional)', purpose: 'Measure the effectiveness of marketing campaigns. Only set with consent.', expiry: '90 days' },
  ];

  const sections: LegalSection[] = [
    {
      id: 'what-are-cookies',
      title: 'What Are Cookies',
      content: (
        <>
          <P>Cookies are small text files placed on your device when you visit a website. They are used to make websites work efficiently, improve user experience, and provide information to website owners.</P>
          <P>Cookies can be session-based (deleted when you close your browser) or persistent (stored for a set period). VireSend uses both first-party and third-party cookies.</P>
        </>
      ),
    },
    {
      id: 'how-we-use',
      title: 'How VireSend Uses Cookies',
      content: (
        <>
          <P>VireSend uses cookies for:</P>
          <List items={[
            'Login sessions — to keep you signed in across page visits',
            'Security — to protect against CSRF and session hijacking',
            'Preferences — to remember your dashboard settings and UI choices',
            'Analytics — to understand how users interact with the platform',
            'Performance — to monitor page load times and API response times',
            'Anti-fraud — to detect and prevent bot activity and abusive behavior',
          ]} />
          <P>We only use cookies where necessary for the platform to function or to improve your experience.</P>
        </>
      ),
    },
    {
      id: 'types-of-cookies',
      title: 'Types of Cookies We Use',
      content: (
        <>
          <CookieTable rows={cookieRows} />
          <P>Essential and security cookies are always active as they are strictly necessary for the platform to function.</P>
        </>
      ),
    },
    {
      id: 'third-party-cookies',
      title: 'Third-Party Cookies',
      content: (
        <>
          <P>Third-party services integrated into VireSend may set their own cookies:</P>
          <List items={[
            'Google OAuth — when connecting Gmail, Google may set authentication cookies',
            'Cloudflare Turnstile — anti-bot verification that may set security tokens',
            'Payment providers (PayStack / Stripe) — may set cookies during checkout',
            'Analytics providers — performance and usage tracking cookies',
          ]} />
          <P>Third-party cookies are governed by the respective service's privacy and cookie policies.</P>
        </>
      ),
    },
    {
      id: 'managing-cookies',
      title: 'Managing Cookies',
      content: (
        <>
          <P>You can manage cookies through your browser settings:</P>
          <List items={[
            'Chrome: Settings → Privacy and Security → Cookies and other site data',
            'Firefox: Settings → Privacy & Security → Cookies and Site Data',
            'Safari: Preferences → Privacy → Manage Website Data',
            'Edge: Settings → Cookies and site permissions',
          ]} />
          <P>Disabling essential cookies may prevent VireSend from functioning correctly and you may not be able to log in.</P>
        </>
      ),
    },
    {
      id: 'cookie-banner',
      title: 'Cookie Consent Banner',
      content: (
        <>
          <P>When you first visit VireSend, you will see a cookie consent banner with the following choices:</P>
          <List items={[
            'Accept All — enables all cookie categories including analytics and marketing',
            'Reject Non-Essential — enables only essential and security cookies',
            'Manage Preferences — opens a preference panel to control each cookie category',
          ]} />
          <P>Your cookie preference is stored in your browser and respected on subsequent visits. You can change preferences at any time.</P>
        </>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to This Cookie Policy',
      content: (
        <>
          <P>We may update this Cookie Policy as our use of cookies evolves. Changes will be communicated by updating the "Last Updated" date and displaying a notice on the website. We may re-present the consent banner if new cookie categories are introduced.</P>
        </>
      ),
    },
    {
      id: 'contact',
      title: 'Contact Us',
      content: (
        <>
          <P>For questions about our use of cookies:</P>
          <List items={[
            'Email: legal@viresender.com',
            'Support portal: Submit a ticket from your VireSend dashboard',
          ]} />
        </>
      ),
    },
  ];

  return (
    <LegalPageLayout
      title="Cookie Policy"
      subtitle="How VireSend uses cookies and similar technologies on our platform."
      lastUpdated="May 8, 2026"
      badge="Legal · Cookies"
      sections={sections}
    />
  );
}
