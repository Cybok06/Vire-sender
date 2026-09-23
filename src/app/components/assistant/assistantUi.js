export const DISCOVERY_SEEN_KEY = 'viresend_ai_discovery_seen';
export const DISCOVERY_DISMISSED_AT_KEY = 'viresend_ai_discovery_dismissed_at';
export const DISCOVERY_SESSION_KEY = 'viresend_ai_discovery_session_seen';
export const DISCOVERY_RESHOW_DAYS = 7;

export const QUICK_ACTIONS = [
  { label: 'Write an SMS', prompt: 'Help me write an SMS.' },
  { label: 'Write an email', prompt: 'Help me write an email.' },
  { label: 'View contact groups', prompt: 'Who are my contact groups?' },
  { label: 'Ask about VireSender', prompt: 'What can VireSender help me do?' },
];

export const DRAFT_QUICK_ACTIONS = [
  { label: 'Make shorter', prompt: 'Make it shorter.' },
  { label: 'Make catchy', prompt: 'Make it catchy.' },
  { label: 'Add emojis', prompt: 'Add emojis.' },
  { label: 'Make professional', prompt: 'Make it professional.' },
  { label: 'Prepare to send', prompt: 'Prepare it for sending.' },
];

export function plainTextFromHtml(value) {
  const source = String(value || '');
  return source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatMoney(value, zeroLabel = 'GHS 0.0000') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return zeroLabel;
  return `GHS ${amount.toFixed(4)}`;
}

export function emailCostLabel(preview) {
  const amount = Number(preview?.estimated_cost || 0);
  return amount <= 0 ? 'No wallet charge' : formatMoney(amount);
}

export function shouldShowDiscovery({ seen, dismissedAt, sessionSeen, now = Date.now() }) {
  if (sessionSeen) return false;
  if (!seen) return true;
  if (!dismissedAt) return false;
  return now - dismissedAt >= DISCOVERY_RESHOW_DAYS * 24 * 60 * 60 * 1000;
}
