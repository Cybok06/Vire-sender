import { useEffect } from 'react';
import { CANONICAL_ORIGIN, SOCIAL_IMAGE_URL } from '../../marketing/siteContent.js';

type SeoConfig = {
  title: string;
  description: string;
  canonical: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  schema?: Record<string, any> | null;
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement('link');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
}

export default function SeoPage({ config }: { config: SeoConfig }) {
  useEffect(() => {
    document.title = config.title;
    document.documentElement.lang = 'en';

    upsertMeta('meta[name="description"]', { name: 'description', content: config.description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: config.robots || 'index, follow' });
    upsertMeta('meta[name="application-name"]', { name: 'application-name', content: 'VireSender' });
    upsertMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title', content: 'VireSender' });
    upsertMeta('meta[name="theme-color"]', { name: 'theme-color', content: '#06142B' });

    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: config.canonical });

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'VireSender' });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: config.ogTitle || config.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: config.ogDescription || config.description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: config.canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: SOCIAL_IMAGE_URL });
    upsertMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '1200' });
    upsertMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '630' });
    upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: 'VireSender AI-powered SMS and email campaign platform' });

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: config.twitterTitle || config.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: config.twitterDescription || config.description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: SOCIAL_IMAGE_URL });

    let schemaNode = document.getElementById('route-schema');
    if (!schemaNode) {
      schemaNode = document.createElement('script');
      schemaNode.id = 'route-schema';
      schemaNode.setAttribute('type', 'application/ld+json');
      document.head.appendChild(schemaNode);
    }
    if (config.schema) {
      schemaNode.textContent = JSON.stringify(config.schema);
    } else {
      schemaNode.textContent = '';
    }

    if (window.location.hostname === 'viresender.com') {
      const nextUrl = `${CANONICAL_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(nextUrl);
    }
  }, [config]);

  return null;
}
