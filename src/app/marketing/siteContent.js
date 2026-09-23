export const CANONICAL_ORIGIN = 'https://www.viresender.com';
export const SOCIAL_IMAGE_PATH = '/social/viresend-ai-social.svg';
export const SOCIAL_IMAGE_URL = `${CANONICAL_ORIGIN}${SOCIAL_IMAGE_PATH}`;
export const PUBLIC_LASTMOD = '2026-07-13';

export const aiFaqs = [
  {
    question: 'What is VireSend AI?',
    answer:
      'VireSend AI is a communication assistant built into VireSender. It helps users create and prepare SMS and email campaigns through natural-language conversation.',
  },
  {
    question: 'Can VireSend AI send SMS and emails?',
    answer:
      'Yes. You can ask it to prepare an SMS or email for a saved contact group. It can also prepare SMS messages for valid phone numbers that have not been saved as contacts.',
  },
  {
    question: 'Does VireSend AI send messages immediately?',
    answer:
      'No. VireSend AI first prepares a campaign preview containing the recipients, message and relevant campaign details. You must review and confirm the campaign before it is sent.',
  },
  {
    question: 'Can I send an SMS to a phone number that is not saved?',
    answer:
      'Yes. You can provide a valid phone number directly to VireSend AI. The number is validated, and the assistant prepares the message for your confirmation.',
  },
  {
    question: 'Can VireSend AI send messages to contact groups?',
    answer:
      'Yes. It can search your saved contact groups and prepare SMS or email campaigns for the selected group.',
  },
  {
    question: 'Can the AI write the message for me?',
    answer:
      'Yes. Tell it the goal, audience and preferred tone. It can generate birthday wishes, announcements, promotional messages, holiday greetings and other business communications.',
  },
  {
    question: 'Can I edit an AI-generated message?',
    answer:
      'Yes. You can review and edit the subject, message, recipients, Sender ID or sending account before confirming.',
  },
  {
    question: 'Will I see the SMS cost before sending?',
    answer:
      'Yes. VireSender calculates valid recipients, SMS segments, estimated cost and wallet balance before you confirm an SMS campaign.',
  },
  {
    question: 'Does VireSend AI have access to my passwords or provider keys?',
    answer:
      'No. Provider credentials, email tokens, SMTP passwords and internal API keys remain protected on the VireSender backend and are not exposed to the AI assistant.',
  },
  {
    question: 'Can VireSend AI access another user’s contacts?',
    answer:
      'No. Users can only access contacts, groups, Sender IDs and email accounts belonging to their own VireSender account.',
  },
  {
    question: 'Can I still send campaigns without using AI?',
    answer:
      'Yes. The normal SMS and email campaign tools remain available. VireSend AI is an additional way to prepare communications faster.',
  },
];

export const aiCapabilities = [
  'Send SMS to contact groups',
  'Send email to contact groups',
  'Send SMS to direct phone numbers',
  'Generate birthday wishes',
  'Generate holiday greetings',
  'Generate promotional messages',
  'Rewrite and improve messages',
  'Translate messages',
  'Validate recipients',
  'Calculate SMS segments',
  'Estimate SMS campaign cost',
  'Require confirmation before sending',
  'Show campaign progress and results',
];

export const homepageMeta = {
  title: 'VireSender | Send SMS and Email Campaigns with AI in Ghana',
  description:
    'Send bulk SMS and email campaigns with VireSend AI. Manage contacts, message direct phone numbers, use approved Sender IDs, access OTP APIs and track campaigns from one platform.',
  canonical: `${CANONICAL_ORIGIN}/`,
  robots: 'index, follow',
  ogTitle: 'VireSender — Send SMS and Email Campaigns with AI',
  ogDescription:
    'Tell VireSend AI who you want to contact and what you want to say. Review the campaign, confirm it and send SMS or email from one platform.',
  twitterTitle: 'VireSender — AI-Powered SMS and Email Campaigns',
  twitterDescription:
    'Create, review and send SMS and email campaigns through natural-language conversation.',
};

export const aiAssistantPageMeta = {
  title: 'VireSend AI | Send SMS and Email Through Conversation',
  description:
    'Use VireSend AI to prepare SMS and email campaigns through natural-language conversation. Review recipients, message details and estimated SMS costs before sending.',
  canonical: `${CANONICAL_ORIGIN}/ai-assistant`,
  robots: 'index, follow',
  ogTitle: 'VireSender — Send SMS and Email Campaigns with AI',
  ogDescription:
    'Tell VireSend AI who you want to contact and what you want to say. Review the campaign, confirm it and send SMS or email from one platform.',
  twitterTitle: 'VireSender — AI-Powered SMS and Email Campaigns',
  twitterDescription:
    'Create, review and send SMS and email campaigns through natural-language conversation.',
};

export function buildFaqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function buildOrganizationGraph({ faqSchema, pageUrl }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${CANONICAL_ORIGIN}/#organization`,
        name: 'VireSender',
        url: `${CANONICAL_ORIGIN}/`,
        logo: `${CANONICAL_ORIGIN}/web-app-manifest-512x512.png`,
        description:
          'VireSender is a business messaging platform for AI-assisted SMS, email campaigns, OTP services, contact management, and developer API messaging.',
      },
      {
        '@type': 'WebSite',
        '@id': `${CANONICAL_ORIGIN}/#website`,
        name: 'VireSender',
        url: `${CANONICAL_ORIGIN}/`,
        publisher: { '@id': `${CANONICAL_ORIGIN}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${pageUrl}#software`,
        name: 'VireSender',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: pageUrl,
        description:
          'Bulk SMS, email campaign sending, OTP tools, contact management, and VireSend AI for business communication.',
        offers: {
          '@type': 'Offer',
          priceCurrency: 'GHS',
          availability: 'https://schema.org/InStock',
        },
      },
      faqSchema,
    ],
  };
}
