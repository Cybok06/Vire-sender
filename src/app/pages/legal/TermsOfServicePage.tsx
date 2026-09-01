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

export default function TermsOfServicePage() {
  const sections: LegalSection[] = [
    {
      id: 'welcome',
      title: 'Welcome to VireSend',
      content: (
        <>
          <P>These Terms of Service ("Terms") govern your access to and use of the VireSend platform, including all related services, applications, APIs, communication tools, websites, embedded widgets, dashboards, and messaging systems operated by VireSend.</P>
          <P>By accessing or using VireSend, you agree to these Terms.</P>
          <P>If you do not agree, do not use the platform.</P>
        </>
      ),
    },
    {
      id: 'about-viresend',
      title: 'About VireSend',
      content: (
        <>
          <P>VireSend is a communication platform that provides services including:</P>
          <List items={[
            'SMS sending',
            'Bulk SMS campaigns',
            'Email sending',
            'Bulk email campaigns',
            'OTP / virtual number services',
            'Developer APIs',
            'Embedded send pages/widgets',
            'Wallet and billing systems',
            'Analytics and delivery tracking',
            'Contact and template management',
          ]} />
          <P>Some services may rely on third-party providers including SMS gateways, email providers, OTP providers, hosting providers, and payment processors.</P>
        </>
      ),
    },
    {
      id: 'eligibility',
      title: 'Eligibility',
      content: (
        <>
          <P>Users must:</P>
          <List items={[
            'Be at least 18 years old or legally authorized',
            'Provide accurate information',
            'Secure their account credentials',
            'Follow applicable laws',
          ]} />
          <P>Users are responsible for all activity under their accounts.</P>
        </>
      ),
    },
    {
      id: 'account-registration',
      title: 'Account Registration',
      content: (
        <>
          <P>Users may need to:</P>
          <List items={[
            'Create an account',
            'Verify email',
            'Complete anti-bot verification',
            'Connect Gmail or SMTP accounts',
          ]} />
          <P>Users must not:</P>
          <List items={[
            'Create fake accounts',
            'Impersonate others',
            'Resell accounts without authorization',
          ]} />
        </>
      ),
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable Use',
      content: (
        <>
          <P>Users may NOT use VireSend for:</P>
          <List items={[
            'Fraud',
            'Scams',
            'Phishing',
            'Spam',
            'Harassment',
            'Malware distribution',
            'Unauthorized automation',
            'Illegal OTP verification',
            'Sending messages without consent',
          ]} />
          <P>Users are responsible for all content sent through the platform.</P>
        </>
      ),
    },
    {
      id: 'sms-email-responsibility',
      title: 'SMS and Email Responsibility',
      content: (
        <>
          <P>Users agree that:</P>
          <List items={[
            'They have recipient permission',
            'They comply with communication laws',
            'Delivery is not guaranteed',
          ]} />
          <P>VireSend may monitor abuse patterns.</P>
        </>
      ),
    },
    {
      id: 'otp-virtual-number-services',
      title: 'OTP / Virtual Number Services',
      content: (
        <>
          <P>OTP and virtual numbers are temporary services.</P>
          <P>VireSend does not guarantee:</P>
          <List items={[
            'Permanent ownership of numbers',
            'Long-term access to third-party accounts',
            'Successful verification on all platforms',
          ]} />
          <P>Third-party platforms may independently suspend accounts.</P>
        </>
      ),
    },
    {
      id: 'wallet-billing-payments',
      title: 'Wallet, Billing, and Payments',
      content: (
        <>
          <P>VireSend uses wallet-based billing.</P>
          <P>Users may:</P>
          <List items={[
            'Deposit funds',
            'Purchase services',
            'View transactions',
          ]} />
          <P>Charges may apply for:</P>
          <List items={[
            'SMS',
            'Email',
            'OTP',
            'API usage',
            'Campaign processing',
          ]} />
          <P>Refunds may be reviewed manually and are not guaranteed for all failed deliveries.</P>
        </>
      ),
    },
    {
      id: 'developer-api',
      title: 'Developer API',
      content: (
        <>
          <P>Users may generate API keys.</P>
          <P>Users must:</P>
          <List items={[
            'Protect API keys',
            'Follow rate limits',
            'Avoid abuse',
          ]} />
          <P>VireSend may suspend or revoke API access.</P>
          <P>All API requests are logged.</P>
        </>
      ),
    },
    {
      id: 'embedded-widgets',
      title: 'Embedded Widgets',
      content: (
        <>
          <P>Users may create embedded send pages/widgets.</P>
          <P>Users are responsible for:</P>
          <List items={[
            'Authorized domains',
            'Content sent through widgets',
            'Compliance with messaging laws',
          ]} />
          <P>VireSend may disable abusive widgets.</P>
        </>
      ),
    },
    {
      id: 'service-availability',
      title: 'Service Availability',
      content: (
        <>
          <P>Services may occasionally become unavailable due to:</P>
          <List items={[
            'Maintenance',
            'Provider downtime',
            'Security reviews',
            'Upgrades',
          ]} />
          <P>VireSend may temporarily lock:</P>
          <List items={[
            'OTP services',
            'SMS services',
            'Email services',
            'APIs',
            'Campaign systems',
          ]} />
        </>
      ),
    },
    {
      id: 'third-party-providers',
      title: 'Third-Party Providers',
      content: (
        <>
          <P>VireSend may use:</P>
          <List items={[
            'SMS gateways',
            'OTP providers',
            'Email providers',
            'Hosting providers',
            'Payment processors',
          ]} />
          <P>VireSend is not responsible for failures caused by third-party systems.</P>
        </>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      content: (
        <>
          <P>VireSend implements:</P>
          <List items={[
            'Authentication protection',
            'Email verification',
            'API security',
            'Anti-bot systems',
            'Monitoring',
            'Access controls',
          ]} />
          <P>Users are responsible for protecting:</P>
          <List items={[
            'Passwords',
            'Connected email accounts',
            'API keys',
          ]} />
        </>
      ),
    },
    {
      id: 'suspension-termination',
      title: 'Suspension and Termination',
      content: (
        <>
          <P>Accounts may be suspended for:</P>
          <List items={[
            'Spam',
            'Fraud',
            'Illegal usage',
            'Chargebacks',
            'Abuse',
            'Security threats',
          ]} />
        </>
      ),
    },
    {
      id: 'limitation-liability',
      title: 'Limitation of Liability',
      content: (
        <>
          <P>VireSend is provided "as is" without guarantees of uninterrupted service.</P>
          <P>VireSend is not liable for:</P>
          <List items={[
            'Failed message delivery',
            'Data loss',
            'Third-party account bans',
            'Provider outages',
            'Business interruption',
          ]} />
        </>
      ),
    },
    {
      id: 'privacy',
      title: 'Privacy',
      content: <P>Use of VireSend is also governed by the Privacy Policy.</P>,
    },
    {
      id: 'changes-to-terms',
      title: 'Changes to Terms',
      content: (
        <>
          <P>Terms may be updated periodically.</P>
          <P>Continued use means acceptance of updated terms.</P>
        </>
      ),
    },
    {
      id: 'contact-information',
      title: 'Contact Information',
      content: (
        <>
          <P>Support Email: support@viresender.com</P>
          <P>Platform: VireSend</P>
        </>
      ),
    },
    {
      id: 'final-agreement',
      title: 'Final Agreement',
      content: <P>By using VireSend, users acknowledge acceptance of these Terms.</P>,
    },
  ];

  return (
    <LegalPageLayout
      title="VireSend Terms of Service"
      subtitle="The rules and agreements that govern your access to and use of the VireSend platform."
      lastUpdated="May 2026"
      badge="Legal"
      sections={sections}
    />
  );
}
