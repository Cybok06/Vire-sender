/**
 * Safe clipboard helper – gracefully falls back to the legacy
 * `document.execCommand('copy')` when the Clipboard API is blocked
 * (e.g. inside a sandboxed iframe or without permissions-policy).
 */
export function safeClipboardCopy(text: string): void {
  // Modern Clipboard API (async) – preferred
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    return;
  }
  // Fallback
  legacyCopy(text);
}

function legacyCopy(text: string): void {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  } catch {
    // Nothing more we can do in a fully locked-down iframe
  }
}
