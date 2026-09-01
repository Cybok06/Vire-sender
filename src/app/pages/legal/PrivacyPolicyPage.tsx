import type { ReactNode } from 'react';
import LegalPageLayout from '../../components/public/LegalPageLayout';
import type { LegalSection } from '../../components/public/LegalPageLayout';

function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 12px', lineHeight: 1.85 }}>{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '8px 0 12px', paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ color: '#374151', lineHeight: 1.75, marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  const sections: LegalSection[] = [
    {
      id: 'introduction',
      title: 'Introduction',
      content: (
        <>
          <P>VireSend values your privacy and is committed to protecting your personal information.</P>
          <P>This Privacy Policy explains how VireSend collects, uses, processes, and protects information.</P>
        </>
      ),
    },
    {
      id: 'information-we-collect',
      title: 'Information We Collect',
      content: (
        <>
          <P>Account Information:</P>
          <List items={[
            'Full name',
            'Email address',
            'Phone number',
            'Authentication provider details',
          ]} />
          <P>Service Usage Data:</P>
          <List items={[
            'SMS logs',
            'Email logs',
            'OTP orders',
            'API usage logs',
            'Wallet transactions',
            'Campaign activity',
          ]} />
          <P>Technical Information:</P>
          <List items={[
            'IP address',
            'Browser type',
            'Session data',
            'Cookies',
            'Analytics',
          ]} />
          <P>Connected Services:</P>
          <List items={[
            'Gmail OAuth tokens',
            'SMTP configuration',
            'Email account metadata',
          ]} />
        </>
      ),
    },
    {
      id: 'how-we-use-information',
      title: 'How We Use Information',
      content: (
        <>
          <P>Information is used to:</P>
          <List items={[
            'Provide services',
            'Process SMS/email/OTP requests',
            'Manage authentication',
            'Process wallet billing',
            'Improve security',
            'Prevent fraud',
            'Provide support',
            'Improve performance',
          ]} />
        </>
      ),
    },
    {
      id: 'user-contacts-recipient-data',
      title: 'User Contacts and Recipient Data',
      content: (
        <>
          <P>Users are responsible for:</P>
          <List items={[
            'Recipient consent',
            'Lawful communication',
            'Uploaded contacts',
          ]} />
          <P>VireSend processes recipient data only for requested services.</P>
        </>
      ),
    },
    {
      id: 'api-activity-logs',
      title: 'API and Activity Logs',
      content: (
        <>
          <P>VireSend stores:</P>
          <List items={[
            'API logs',
            'Delivery reports',
            'Failed requests',
            'Wallet activity',
            'Authentication logs',
          ]} />
          <P>These logs support:</P>
          <List items={[
            'Security',
            'Analytics',
            'Abuse prevention',
            'Troubleshooting',
          ]} />
        </>
      ),
    },
    {
      id: 'cookies-tracking',
      title: 'Cookies and Tracking',
      content: (
        <>
          <P>Cookies may be used for:</P>
          <List items={[
            'Login sessions',
            'Preferences',
            'Security',
            'Analytics',
            'Performance optimization',
          ]} />
          <P>Users may manage cookies through browser settings.</P>
        </>
      ),
    },
    {
      id: 'third-party-providers',
      title: 'Third-Party Providers',
      content: (
        <>
          <P>Data may be shared with:</P>
          <List items={[
            'SMS providers',
            'OTP providers',
            'Email providers',
            'Hosting providers',
            'Payment processors',
            'Analytics providers',
          ]} />
        </>
      ),
    },
    {
      id: 'data-security',
      title: 'Data Security',
      content: (
        <>
          <P>Security measures include:</P>
          <List items={[
            'Encryption',
            'Authentication controls',
            'Access restrictions',
            'Monitoring systems',
            'Secure token handling',
          ]} />
          <P>No platform is completely secure.</P>
        </>
      ),
    },
    {
      id: 'data-retention',
      title: 'Data Retention',
      content: (
        <>
          <P>VireSend may retain:</P>
          <List items={[
            'Billing records',
            'Logs',
            'Security records',
            'Complaint records',
          ]} />
          <P>Retention periods may vary.</P>
        </>
      ),
    },
    {
      id: 'user-rights',
      title: 'User Rights',
      content: (
        <>
          <P>Users may request:</P>
          <List items={[
            'Access to data',
            'Corrections',
            'Deletion',
            'Export',
            'Withdrawal of connected services',
          ]} />
        </>
      ),
    },
    {
      id: 'childrens-privacy',
      title: "Children's Privacy",
      content: <P>VireSend is not intended for children under 18.</P>,
    },
    {
      id: 'international-processing',
      title: 'International Processing',
      content: <P>Data may be processed in multiple countries depending on providers and infrastructure.</P>,
    },
    {
      id: 'changes-to-privacy-policy',
      title: 'Changes to Privacy Policy',
      content: (
        <>
          <P>Policies may be updated periodically.</P>
          <P>Continued use means acceptance of updates.</P>
        </>
      ),
    },
    {
      id: 'contact-us',
      title: 'Contact Us',
      content: (
        <>
          <P>support@viresender.com</P>
          <P>Platform: VireSend</P>
        </>
      ),
    },
    {
      id: 'final-notice',
      title: 'Final Notice',
      content: <P>By using VireSend, users acknowledge this Privacy Policy.</P>,
    },
  ];

  return (
    <LegalPageLayout
      title="VireSend Privacy Policy"
      subtitle="How VireSend collects, uses, processes, and protects information."
      lastUpdated="May 2026"
      badge="Legal"
      sections={sections}
    />
  );
}
