import { API_URL } from './api';

export const COOKIE_CONSENT_KEY = 'vs_cookie_consent';
const VISITOR_KEY = 'vs_visitor_id';
const SESSION_KEY = 'vs_session_id';

function randomId(prefix) {
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = randomId('vis');
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = randomId('ses');
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getStoredConsent() {
  try {
    return JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent() {
  const consent = getStoredConsent();
  return Boolean(consent?.preferences?.analytics);
}

export function getBrowserInfo() {
  const ua = navigator.userAgent;
  if (/Edg/i.test(ua)) return 'Microsoft Edge';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Firefox/i.test(ua)) return 'Firefox';
  return 'Other';
}

export function getDeviceInfo() {
  const ua = navigator.userAgent;
  const width = window.innerWidth;
  const device_type = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) || width < 768 ? 'mobile' : 'desktop';
  let operating_system = 'Other';
  if (/Windows/i.test(ua)) operating_system = 'Windows';
  else if (/Mac OS/i.test(ua)) operating_system = 'macOS';
  else if (/Android/i.test(ua)) operating_system = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) operating_system = 'iOS';
  else if (/Linux/i.test(ua)) operating_system = 'Linux';
  return {
    browser: getBrowserInfo(),
    device_type,
    operating_system,
    screen_size: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language || '',
  };
}

export function getUTMParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
  };
}

function basePayload(extra = {}) {
  return {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    page_url: window.location.href,
    referrer: document.referrer || '',
    ...getDeviceInfo(),
    utm: getUTMParams(),
    ...extra,
  };
}

export function requestVisitorLocation() {
  if (!hasAnalyticsConsent() || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy: position.coords.accuracy,
        };
        trackEvent('location_permission_granted', location);
        resolve(location);
      },
      () => {
        trackEvent('location_permission_denied', {});
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  });
}

function postAnalytics(path, payload, keepalive = false) {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null);
}

export function saveCookieConsent(consentType, preferences) {
  const payload = {
    type: consentType,
    preferences: {
      essential: true,
      analytics: Boolean(preferences.analytics),
      performance: Boolean(preferences.performance),
      marketing: Boolean(preferences.marketing),
    },
    saved_at: new Date().toISOString(),
  };
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(payload));
  document.cookie = `${COOKIE_CONSENT_KEY}=${encodeURIComponent(consentType)}; path=/; max-age=31536000; SameSite=Lax`;
  const consentPayload = payload.preferences.analytics ? basePayload({
    consent_type: consentType,
    consent_preferences: payload.preferences,
  }) : {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    page_url: window.location.href,
    consent_type: consentType,
    consent_preferences: payload.preferences,
  };
  return postAnalytics('/api/analytics/consent', consentPayload);
}

export function trackPageView() {
  if (!hasAnalyticsConsent()) return;
  return postAnalytics('/api/analytics/page-view', basePayload({
    consent_preferences: getStoredConsent()?.preferences || {},
  }));
}

export function trackEvent(eventName, eventData = {}) {
  if (!hasAnalyticsConsent()) return;
  return postAnalytics('/api/analytics/event', basePayload({
    event_name: eventName,
    event_data: eventData,
  }));
}

export function trackSessionEnd(timeOnPage, scrollDepth) {
  if (!hasAnalyticsConsent()) return;
  return postAnalytics('/api/analytics/session-end', basePayload({
    time_on_page: Math.round(timeOnPage),
    scroll_depth: Math.round(scrollDepth),
  }), true);
}

export function getScrollDepth() {
  const doc = document.documentElement;
  const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
  return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
}
