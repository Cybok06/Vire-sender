import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_ORIGIN,
  SOCIAL_IMAGE_URL,
  aiAssistantPageMeta,
  aiFaqs,
  buildFaqSchema,
  homepageMeta,
} from '../siteContent.js';

const projectRoot = path.resolve(process.cwd());
const homepageHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const aiPageHtml = fs.readFileSync(path.join(projectRoot, 'ai-assistant', 'index.html'), 'utf8');
const robotsTxt = fs.readFileSync(path.join(projectRoot, 'public', 'robots.txt'), 'utf8');
const sitemapXml = fs.readFileSync(path.join(projectRoot, 'public', 'sitemap.xml'), 'utf8');
const landingSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'pages', 'LandingPage.tsx'), 'utf8');
const aiSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'pages', 'AiAssistantLandingPage.tsx'), 'utf8');
const routesSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'routes.tsx'), 'utf8');

test('homepage metadata uses the canonical www domain and AI-focused title', () => {
  assert.equal(homepageMeta.canonical, `${CANONICAL_ORIGIN}/`);
  assert.match(homepageHtml, /<title>VireSender \| Send SMS and Email Campaigns with AI in Ghana<\/title>/);
  assert.match(homepageHtml, /<link rel="canonical" href="https:\/\/www\.viresender\.com\/"/);
  assert.match(homepageHtml, new RegExp(SOCIAL_IMAGE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('AI assistant page metadata is present and canonicalized', () => {
  assert.equal(aiAssistantPageMeta.canonical, `${CANONICAL_ORIGIN}/ai-assistant`);
  assert.match(aiPageHtml, /<title>VireSend AI \| Send SMS and Email Through Conversation<\/title>/);
  assert.match(aiPageHtml, /<link rel="canonical" href="https:\/\/www\.viresender\.com\/ai-assistant"/);
});

test('FAQ schema mirrors visible AI FAQ content and does not advertise scheduling', () => {
  const schema = buildFaqSchema(aiFaqs);
  assert.equal(schema['@type'], 'FAQPage');
  assert.equal(schema.mainEntity.length, aiFaqs.length);
  assert.equal(aiFaqs.some((faq) => /schedule/i.test(faq.question)), false);
});

test('public homepage and AI page avoid internal provider names', () => {
  assert.equal(/Moolre|Arkesel/i.test(landingSource), false);
  assert.equal(/Moolre|Arkesel/i.test(aiSource), false);
});

test('route and navigation source include the public AI assistant page', () => {
  assert.match(routesSource, /path: '\/ai-assistant'/);
  assert.match(landingSource, /VireSend AI/);
});

test('robots.txt points to the canonical sitemap and blocks private areas', () => {
  assert.match(robotsTxt, /Sitemap: https:\/\/www\.viresender\.com\/sitemap\.xml/);
  assert.match(robotsTxt, /Disallow: \/admin\//);
  assert.match(robotsTxt, /Disallow: \/user\//);
  assert.doesNotMatch(robotsTxt, /Disallow: \/ai-assistant/);
});

test('sitemap contains only canonical public URLs including the AI page', () => {
  assert.match(sitemapXml, /https:\/\/www\.viresender\.com\/ai-assistant/);
  assert.match(sitemapXml, /https:\/\/www\.viresender\.com\/services/);
  assert.equal(/https:\/\/viresender\.com\//.test(sitemapXml), false);
  assert.equal(/\/user\/|\/admin\/|\/wallet\/|\/api\/ai\//.test(sitemapXml), false);
});
