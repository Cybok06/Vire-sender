import { Mail, MessageSquare, Shield } from 'lucide-react';

export const heroSlides = [
  {
    key: 'sms-marketing',
    eyebrow: 'Bulk SMS marketing',
    title: 'Send SMS to a Ready Audience',
    description: 'Reach thousands of targeted contacts instantly with powerful bulk SMS campaigns.',
    backgroundImage: '/images/sms_bg.png',
    primaryButton: { label: 'Start SMS Campaign', href: '/send-sms' },
    secondaryButton: { label: 'View SMS Services', href: '/services#sms' },
    theme: '#2563EB',
    accent: '#0EA5E9',
    icon: MessageSquare,
    mode: 'sms',
    stats: [
      { label: 'Ready contacts', value: '48,920' },
      { label: 'Delivered', value: '98.6%' },
      { label: 'Campaigns', value: '12' },
    ],
  },
  {
    key: 'otp-numbers',
    eyebrow: 'OTP virtual numbers',
    title: 'Buy OTP Numbers Instantly',
    description: 'Get virtual numbers for WhatsApp, Telegram, Facebook, Google, TikTok and more.',
    backgroundImage: '/images/otp_bg.png',
    primaryButton: { label: 'Buy OTP Number', href: '/otp-numbers' },
    secondaryButton: { label: 'View Numbers', href: '/otp-numbers' },
    theme: '#10B981',
    accent: '#0EA5E9',
    icon: Shield,
    mode: 'otp',
    stats: [
      { label: 'Services', value: '1,000+' },
      { label: 'Delivery', value: 'Instant' },
      { label: 'Countries', value: '120+' },
    ],
  },
  {
    key: 'email-campaigns',
    eyebrow: 'Email campaign sending',
    title: 'Send Email Campaigns Easily',
    description: 'Create, send, and track professional email campaigns from one dashboard.',
    backgroundImage: '/images/email_bg.png',
    primaryButton: { label: 'Start Email Campaign', href: '/email-sender' },
    secondaryButton: { label: 'Learn More', href: '/services#email' },
    theme: '#8B5CF6',
    accent: '#2563EB',
    icon: Mail,
    mode: 'email',
    stats: [
      { label: 'Subscribers', value: '24,500' },
      { label: 'Opens', value: '42%' },
      { label: 'Clicks', value: '9.8%' },
    ],
  },
] as const;

export type HeroSlideData = (typeof heroSlides)[number];
