import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUICK_ACTIONS,
  emailCostLabel,
  plainTextFromHtml,
  shouldShowDiscovery,
} from '../assistantUi.js';

test('plainTextFromHtml strips unsafe html and preserves line breaks', () => {
  const result = plainTextFromHtml('<p>Hello <strong>team</strong></p><script>alert(1)</script><p>Line 2<br />Next</p>');
  assert.equal(result, 'Hello team\n\nalert(1) Line 2\nNext');
});

test('emailCostLabel uses no wallet charge for zero-cost email', () => {
  assert.equal(emailCostLabel({ estimated_cost: 0 }), 'No wallet charge');
});

test('discovery message appears for new users and stays hidden in-session once seen', () => {
  assert.equal(shouldShowDiscovery({ seen: false, dismissedAt: 0, sessionSeen: false }), true);
  assert.equal(shouldShowDiscovery({ seen: true, dismissedAt: Date.now(), sessionSeen: true }), false);
});

test('discovery message can reappear after several days', () => {
  const now = Date.now();
  const eightDaysAgo = now - (8 * 24 * 60 * 60 * 1000);
  assert.equal(shouldShowDiscovery({ seen: true, dismissedAt: eightDaysAgo, sessionSeen: false, now }), true);
});

test('quick actions are conversational and do not force delivery', () => {
  assert.deepEqual(QUICK_ACTIONS.map(item => item.label), [
    'Write an SMS',
    'Write an email',
    'View contact groups',
    'Ask about VireSender',
  ]);
});
