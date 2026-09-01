import { useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Send, CheckCircle } from 'lucide-react';
import LegalPageLayout from '../../components/public/LegalPageLayout';
import type { LegalSection } from '../../components/public/LegalPageLayout';

const PRIMARY   = '#2563EB';
const ELEC_BLUE = '#1D4ED8';

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

function GdprRequestForm() {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState('');
  const [detail, setDetail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !type) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSubmitted(true);
    toast.success('Your GDPR request has been submitted. We will respond within 30 days.');
  };

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle size={24} style={{ color: '#10b981' }} />
        </div>
        <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, margin: '0 0 6px' }}>Request Submitted</p>
        <p style={{ color: '#64748b', fontSize: 13 }}>We have received your GDPR request and will respond within 30 days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
            Full Name *
          </label>
          <input
            type="text"
            required
            placeholder="Your full name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
            Email Address *
          </label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Request Type *
        </label>
        <select
          required
          value={type}
          onChange={e => setType(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, color: type ? '#0f172a' : '#94a3b8', outline: 'none', fontFamily: 'inherit', background: 'white' }}
        >
          <option value="" disabled>Select request type...</option>
          <option value="access">Access — Request a copy of my data</option>
          <option value="rectification">Rectification — Correct inaccurate data</option>
          <option value="erasure">Erasure — Request deletion of my data</option>
          <option value="restriction">Restriction — Limit processing of my data</option>
          <option value="portability">Portability — Export my data</option>
          <option value="objection">Objection — Object to data processing</option>
          <option value="withdraw">Withdraw consent</option>
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Additional Details (optional)
        </label>
        <textarea
          placeholder="Provide any additional context..."
          value={detail}
          onChange={e => setDetail(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
      <button
        type="submit"
        style={{
          alignSelf: 'flex-start',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 22px', borderRadius: 12, border: 'none',
          background: `linear-gradient(135deg, ${PRIMARY}, ${ELEC_BLUE})`,
          color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
        }}
      >
        <Send size={14} /> Submit GDPR Request
      </button>
    </form>
  );
}

export default function GdprPage() {
  const sections: LegalSection[] = [
    {
      id: 'commitment',
      title: 'Our GDPR Commitment',
      content: (
        <>
          <P>VireSend is committed to protecting the privacy and rights of individuals in accordance with the <B>General Data Protection Regulation (GDPR)</B> (EU) 2016/679 and, where applicable, the UK GDPR.</P>
          <P>We have implemented appropriate technical and organizational measures to ensure that personal data is processed lawfully, fairly, and transparently.</P>
        </>
      ),
    },
    {
      id: 'controller-processor',
      title: 'Data Controller and Processor',
      content: (
        <>
          <P><B>As a Data Controller:</B> VireSend determines the purposes and means of processing personal data you provide directly, including account data, billing information, and usage analytics.</P>
          <P><B>As a Data Processor:</B> When you upload contact lists or message recipients for campaigns, VireSend processes that data on your behalf and under your instructions. In this case, you are the data controller and VireSend is the processor.</P>
        </>
      ),
    },
    {
      id: 'lawful-bases',
      title: 'Lawful Bases for Processing',
      content: (
        <>
          <P>VireSend relies on the following lawful bases:</P>
          <List items={[
            'Contract performance — processing account and usage data to provide services',
            'Consent — processing for analytics and non-essential cookies where you have given consent',
            'Legitimate interests — security monitoring, fraud prevention, and platform improvement',
            'Legal obligation — complying with applicable laws, tax regulations, and court orders',
          ]} />
        </>
      ),
    },
    {
      id: 'rights',
      title: 'Your Rights Under GDPR',
      content: (
        <>
          <P>If you are an EEA or UK resident, you have the following rights:</P>
          <List items={[
            'Right of Access (Art. 15) — Request a copy of personal data we hold about you',
            'Right to Rectification (Art. 16) — Request correction of inaccurate data',
            'Right to Erasure (Art. 17) — Request deletion of your personal data',
            'Right to Restriction (Art. 18) — Request we restrict processing in certain cases',
            'Right to Data Portability (Art. 20) — Receive data in a machine-readable format',
            'Right to Object (Art. 21) — Object to processing based on legitimate interests',
            'Right to Withdraw Consent — Withdraw any previously given consent at any time',
          ]} />
          <P>We will respond to requests within 30 days. Contact us at <B>legal@viresender.com</B>.</P>
        </>
      ),
    },
    {
      id: 'contacts-processing',
      title: 'Data Processing for SMS/Email Contacts',
      content: (
        <>
          <P>When you upload contact lists for campaigns, VireSend processes recipient data as a data processor under your instructions. As the data controller, you must ensure:</P>
          <List items={[
            'You have a valid lawful basis to process and send messages to each recipient',
            'Consent was obtained in compliance with applicable laws',
            'Recipients are informed of how their data is used',
            'You honor all opt-out and unsubscribe requests promptly',
          ]} />
        </>
      ),
    },
    {
      id: 'international-transfers',
      title: 'International Data Transfers',
      content: (
        <>
          <P>VireSend and third-party providers may store or process data outside the EEA. When transferring personal data internationally, we ensure appropriate safeguards including Standard Contractual Clauses and adequacy decisions where applicable.</P>
        </>
      ),
    },
    {
      id: 'retention',
      title: 'Data Retention',
      content: (
        <>
          <P>We retain personal data only as long as necessary:</P>
          <List items={[
            'Account data: retained while active plus 12 months after deletion',
            'Billing records: retained for 7 years for compliance',
            'Message logs: retained for up to 12 months',
            'API logs: retained for 90 days',
            'Support records: retained for up to 3 years',
          ]} />
        </>
      ),
    },
    {
      id: 'security',
      title: 'Security Measures',
      content: (
        <>
          <P>We have implemented appropriate technical and organizational security measures:</P>
          <List items={[
            'TLS/HTTPS encryption for all data in transit',
            'Encrypted storage of sensitive data at rest',
            'Role-based access controls limiting data access',
            'Regular security audits and vulnerability assessments',
            'Data breach notification procedures per GDPR Article 33',
          ]} />
        </>
      ),
    },
    {
      id: 'gdpr-request',
      title: 'Submit a GDPR Request',
      content: (
        <>
          <P>Use the form below to submit a formal GDPR data rights request. We will verify your identity before processing and respond within 30 days.</P>
          <GdprRequestForm />
        </>
      ),
    },
    {
      id: 'contact',
      title: 'Contact Us & Supervisory Authority',
      content: (
        <>
          <P>For GDPR-related enquiries:</P>
          <List items={[
            'Email: legal@viresender.com (Subject: GDPR Request — [Your Request Type])',
            'Support portal: Submit a ticket via your VireSend dashboard',
          ]} />
          <P>If unsatisfied with our response, you may lodge a complaint with your local supervisory authority. In the UK, this is the Information Commissioner&#39;s Office (ICO) at ico.org.uk.</P>
        </>
      ),
    },
  ];

  return (
    <LegalPageLayout
      title="GDPR Compliance"
      subtitle="VireSend's commitment to GDPR data protection rights and how to exercise them."
      lastUpdated="May 8, 2026"
      badge="Legal · GDPR"
      sections={sections}
    />
  );
}


