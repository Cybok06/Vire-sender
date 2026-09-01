function normalizeApiOrigin(value) {
  const rawValue = (value || '').trim().replace(/\/+$/, '');
  if (!rawValue) {
    return import.meta.env.DEV ? 'http://localhost:5000' : '';
  }

  const normalizedValue = rawValue.endsWith('/api') ? rawValue.slice(0, -4) : rawValue;
  if (typeof window !== 'undefined') {
    try {
      const configuredUrl = new URL(normalizedValue, window.location.origin);
      const isLocalDevelopmentApi = ['localhost', '127.0.0.1', '0.0.0.0'].includes(configuredUrl.hostname);

      if (!import.meta.env.DEV && isLocalDevelopmentApi) {
        return '';
      }

      const configuredHost = configuredUrl.hostname.replace(/^www\./, '');
      const currentHost = window.location.hostname.replace(/^www\./, '');

      if (!import.meta.env.DEV && configuredHost === currentHost) {
        return '';
      }
    } catch {
      return normalizedValue === '/api' ? '' : normalizedValue;
    }
  }

  return normalizedValue;
}

export const API_URL = normalizeApiOrigin(import.meta.env.VITE_API_URL);
const TOKEN_KEY = 'viresend_token';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const networkError = new Error('Could not reach the server. Please check your connection and try again.');
    networkError.cause = error;
    throw networkError;
  }

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Unexpected server response.',
  }));

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function formRequest(path, formData, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    method: options.method || 'POST',
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Unexpected server response.',
  }));

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function registerUser(payload) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function verifyEmailCode(payload) {
  return request('/api/auth/verify-email-code', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resendVerificationCode(payload) {
  return request('/api/auth/resend-verification-code', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestPasswordReset(payload) {
  return request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload) {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser(token) {
  return request('/api/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getNotifications(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/notifications${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getNotificationStats() {
  return request('/api/notifications/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function markNotificationRead(notificationId) {
  return request(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function markAllNotificationsRead() {
  return request('/api/notifications/mark-all-read', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function deleteNotificationById(notificationId) {
  return request(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function clearReadNotifications() {
  return request('/api/notifications/clear-read', {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function updateProfile(payload) {
  return request('/api/profile', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload) {
  return request('/api/profile/change-password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminUsers() {
  return request('/api/admin/users', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminDashboard() {
  return request('/api/admin/dashboard', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminOtpOrders(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/otp-orders${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function cancelAdminOtpOrder(orderId) {
  return request(`/api/admin/otp-orders/${orderId}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function refundAdminOtpOrder(orderId) {
  return request(`/api/admin/otp-orders/${orderId}/refund`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getAdminSmsmanProviderSettings() {
  return request('/api/admin/provider-settings/smsman', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function saveAdminSmsmanProviderSettings(payload) {
  return request('/api/admin/provider-settings/smsman', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function testAdminSmsmanProviderSettings() {
  return request('/api/admin/provider-settings/smsman/test-balance', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function testAdminSmsmanProviderBalance(payload = {}) {
  return request('/api/admin/provider-settings/smsman/test-balance', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function pollAdminSmsmanOtps() {
  return request('/api/admin/otp/poll-smsman', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getAdminSmsmanRequestLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/smsman/request-logs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminSmsmanRequestLog(logId) {
  return request(`/api/admin/smsman/request-logs/${logId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function syncAdminSmsmanData() {
  return request('/api/admin/smsman/sync-data', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getAdminContacts() {
  return request('/api/admin/contacts', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function deleteAdminContact(contactId) {
  return request(`/api/admin/contacts/${contactId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function getAdminUser(userId) {
  return request(`/api/admin/users/${userId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function updateAdminUserStatus(userId, payload) {
  return request(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function adjustAdminUserWallet(userId, payload) {
  return request(`/api/admin/users/${userId}/wallet-adjust`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getWallet() {
  return request('/api/wallet', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getSmsPackages() {
  return request('/api/sms-packages', { method: 'GET', headers: authHeaders() });
}

export function purchaseSmsPackageWithWallet(packageId) {
  return request(`/api/sms-packages/${packageId}/purchase-wallet`, { method: 'POST', headers: authHeaders() });
}

export function initializeSmsPackagePayment(packageId, provider) {
  return request('/api/wallet/deposits', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ sms_package_id: packageId, provider }) });
}

export function getAdminSmsPackages() {
  return request('/api/admin/sms-packages', { method: 'GET', headers: authHeaders() });
}

export function createAdminSmsPackage(payload) {
  return request('/api/admin/sms-packages', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
}

export function updateAdminSmsPackage(packageId, payload) {
  return request(`/api/admin/sms-packages/${packageId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
}

export function setAdminSmsPackageStatus(packageId, is_active) {
  return request(`/api/admin/sms-packages/${packageId}/status`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ is_active }) });
}

export function getOtpServices(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/otp/services${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getOtpCountries(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/otp/countries${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getOtpCountriesList() {
  return request('/api/otp/countries-list', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getOtpServicePrices(serviceId, countryIds = []) {
  const params = new URLSearchParams({ service_id: serviceId });
  if (countryIds.length) {
    params.set('country_ids', countryIds.join(','));
  }
  return request(`/api/otp/service-prices?${params.toString()}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function mockPurchaseOtp(payload) {
  return request('/api/otp/mock-purchase', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function purchaseOtp(payload) {
  return request('/api/otp/purchase', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getOtpOrders() {
  return request('/api/otp/orders', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getActiveOtpOrders() {
  return request('/api/otp/orders/active', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function cancelOtpOrder(orderId) {
  return request(`/api/otp/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function checkOtpSms(orderId) {
  return request(`/api/otp/orders/${orderId}/check-sms`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getUserDashboard() {
  return request('/api/user/dashboard', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function initializePaystackDeposit(payload) {
  return request('/api/wallet/paystack/initialize', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getActivePaymentProviders() {
  return request('/api/payment-providers/active', {
    method: 'GET',
  });
}

export function createWalletDeposit(payload) {
  return request('/api/wallet/deposits', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function verifyWalletDeposit(depositId) {
  return request(`/api/wallet/deposits/${depositId}/verify`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function submitWalletDepositOtp(depositId, payload) {
  return request(`/api/wallet/deposits/${depositId}/otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function verifyPaystackDeposit(payload) {
  return request('/api/wallet/paystack/verify', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getPaystackSettings() {
  return request('/api/admin/payment-settings/paystack', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function savePaystackSettings(payload) {
  return request('/api/admin/payment-settings/paystack', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminPaymentProviders() {
  return request('/api/admin/payment-providers', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminPaymentProvider(provider) {
  return request(`/api/admin/payment-providers/${provider}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function saveAdminPaymentProvider(provider, payload) {
  return request(`/api/admin/payment-providers/${provider}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateAdminPaymentProviderStatus(provider, payload) {
  return request(`/api/admin/payment-providers/${provider}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function testAdminPaymentProvider(provider, payload = {}) {
  return request(`/api/admin/payment-providers/${provider}/test`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function setAdminDefaultPaymentProvider(provider) {
  return request('/api/admin/payment-providers/default', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ provider }),
  });
}

export function getAdminWalletSummary() {
  return request('/api/admin/wallet/summary', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminWalletTransactions() {
  return request('/api/admin/wallet/transactions', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getContacts() {
  return request('/api/contacts', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createContact(payload) {
  return request('/api/contacts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateContact(contactId, payload) {
  return request(`/api/contacts/${contactId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteContact(contactId) {
  return request(`/api/contacts/${contactId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function bulkDeleteContacts(ids) {
  return request('/api/contacts/bulk-delete', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ids }),
  });
}

export function bulkImportContacts(contacts) {
  return request('/api/contacts/bulk-import', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ contacts }),
  });
}

export function getTemplates(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/templates${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getTemplate(templateId) {
  return request(`/api/templates/${templateId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createTemplate(payload) {
  return request('/api/templates', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateTemplate(templateId, payload) {
  return request(`/api/templates/${templateId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteTemplate(templateId) {
  return request(`/api/templates/${templateId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function useTemplate(templateId) {
  return request(`/api/templates/${templateId}/use`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getTemplateStats() {
  return request('/api/templates/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getTemplateVariables() {
  return request('/api/templates/variables', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminTemplates(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/templates${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminTemplateStats() {
  return request('/api/admin/templates/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function updateAdminTemplateStatus(templateId, status) {
  return request(`/api/admin/templates/${templateId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
}

export function deleteAdminTemplate(templateId) {
  return request(`/api/admin/templates/${templateId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function getEmailAccounts() {
  return request('/api/email/accounts', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createSmtpEmailAccount(payload) {
  return request('/api/email/accounts/smtp', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function testEmailAccount(accountId) {
  return request(`/api/email/accounts/${accountId}/test`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function updateEmailAccount(accountId, payload) {
  return request(`/api/email/accounts/${accountId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteEmailAccount(accountId) {
  return request(`/api/email/accounts/${accountId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function setDefaultEmailAccount(accountId) {
  return request(`/api/email/accounts/${accountId}/default`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getGoogleEmailConnectUrl() {
  const token = localStorage.getItem(TOKEN_KEY);
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/api/email/google/connect${query}`;
}

export function sendSingleEmail(payload) {
  if (payload instanceof FormData) {
    return formRequest('/api/email/send-single', payload);
  }
  return request('/api/email/send-single', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function sendBulkEmail(payload) {
  if (payload instanceof FormData) {
    return formRequest('/api/email/send-bulk', payload);
  }
  return request('/api/email/send-bulk', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getCopyPasteDrafts() {
  return request('/api/email/copy-paste-drafts', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createCopyPasteDraft(payload) {
  return request('/api/email/copy-paste-drafts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateCopyPasteDraft(draftId, payload) {
  return request(`/api/email/copy-paste-drafts/${draftId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteCopyPasteDraft(draftId) {
  return request(`/api/email/copy-paste-drafts/${draftId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function validateCopyPasteRecipients(payload) {
  return request('/api/email/copy-paste/validate-recipients', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function sendCopyPasteEmails(payload) {
  if (payload instanceof FormData) {
    return formRequest('/api/email/copy-paste/send', payload);
  }
  return request('/api/email/copy-paste/send', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function assistVireSendEmail(payload) {
  return request('/api/ai/deepseek-email-assist', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAiAssistantStatus() {
  return request('/api/ai/assistant/status', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAiConversations() {
  return request('/api/ai/conversations', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createAiConversation(payload = {}) {
  return request('/api/ai/conversations', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAiConversation(conversationId) {
  return request(`/api/ai/conversations/${conversationId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function postAiConversationMessage(conversationId, payload) {
  return request(`/api/ai/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateAiDraft(draftId, payload) {
  return request(`/api/ai/drafts/${draftId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function confirmAiDraft(draftId, payload) {
  return request(`/api/ai/drafts/${draftId}/confirm`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function cancelAiDraft(draftId) {
  return request(`/api/ai/drafts/${draftId}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function queueCopyPasteEmails(payload) {
  return request('/api/email/copy-paste/queue-send', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getCopyPasteJob(jobId) {
  return request(`/api/email/copy-paste/jobs/${jobId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getGmailUnreadInbox() {
  return request('/api/gmail/inbox/unread', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getGmailMessage(messageId) {
  return request(`/api/gmail/message/${encodeURIComponent(messageId)}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function sendGmailReply(payload) {
  return request('/api/gmail/reply', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getGoogleChatConnectUrl() {
  const token = localStorage.getItem(TOKEN_KEY);
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const origin = import.meta.env.DEV ? API_URL : 'https://www.viresender.com';
  return `${origin}/api/google-chat/connect${query}`;
}

export function getGoogleChatStatus() {
  return request('/api/google-chat/status', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getGoogleChatSpaces() {
  return request('/api/google-chat/spaces', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getGoogleChatMessages(spaceName) {
  return request(`/api/google-chat/spaces/${spaceName}/messages`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function sendGoogleChatMessage(spaceName, payload) {
  return request(`/api/google-chat/spaces/${spaceName}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function startGoogleChat(payload) {
  return request('/api/google-chat/start-chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getEmailLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/email/logs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getEmailStats() {
  return request('/api/email/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function syncEmailStatus() {
  return request('/api/email/sync-status', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getEmailCampaigns() {
  return request('/api/email/campaigns', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminEmailCampaigns(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/email/campaigns${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminEmailSettings() {
  return request('/api/admin/email/settings', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function saveAdminEmailSettings(payload) {
  return request('/api/admin/email/settings', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminEmailLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/email/logs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminEmailStats() {
  return request('/api/admin/email/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminEmailAccounts() {
  return request('/api/admin/email/accounts', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getContactGroups() {
  return request('/api/contacts/groups', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getMarketplacePackages(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/contact-marketplace/packages${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getMarketplacePackage(packageId) {
  return request(`/api/contact-marketplace/packages/${packageId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function buyMarketplacePackage(packageId) {
  return request(`/api/contact-marketplace/packages/${packageId}/buy`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getMarketplacePurchases() {
  return request('/api/contact-marketplace/purchases', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminContactPackages() {
  return request('/api/admin/contact-packages', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminContactPackage(packageId) {
  return request(`/api/admin/contact-packages/${packageId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createAdminContactPackage(payload) {
  return request('/api/admin/contact-packages', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateAdminContactPackage(packageId, payload) {
  return request(`/api/admin/contact-packages/${packageId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteAdminContactPackage(packageId, action = 'deactivate', confirmation = '') {
  return request(`/api/admin/contact-packages/${packageId}?action=${encodeURIComponent(action)}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ confirmation }),
  });
}

export function uploadAdminContactPackageContacts(packageId, file, jobId = '', maxContacts = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (jobId) formData.append('job_id', jobId);
  if (maxContacts) formData.append('max_contacts', maxContacts);
  return formRequest(`/api/admin/contact-packages/${packageId}/upload`, formData);
}

export function getAdminContactPackageUploadStatus(jobId) {
  return request(`/api/admin/contact-packages/upload-status/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function uploadAdminContactPackageCoverImage(packageId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return formRequest(`/api/admin/contact-packages/${packageId}/cover-image`, formData);
}

export function uploadAdminContactPackageManual(packageId, contacts) {
  return request(`/api/admin/contact-packages/${packageId}/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ contacts }),
  });
}

export function getAdminContactPackageContacts(packageId) {
  return request(`/api/admin/contact-packages/${packageId}/contacts`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminContactMarketplaceStats() {
  return request('/api/admin/contact-marketplace/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminContactMarketplacePurchases() {
  return request('/api/admin/contact-marketplace/purchases', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getSmsCostPreview(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/sms/cost-preview${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getSmsSenderIds() {
  return request('/api/sms/sender-ids', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function submitSmsSenderIdApplication(payload) {
  return request('/api/sms/sender-id-applications', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function refreshSmsSenderIdApplication(recordId) {
  return request(`/api/sms/sender-id-applications/${recordId}/refresh`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function sendSingleSms(payload) {
  return request('/api/sms/send-single', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function sendBulkSms(payload) {
  return request('/api/sms/send-bulk', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getSmsHistory(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/sms/history${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getSmsContactGroups() {
  return request('/api/sms/contact-groups', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getSmsCampaigns() {
  return request('/api/sms/campaigns', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminSmsCampaigns(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/sms/campaigns${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createSmsCampaign(payload) {
  return request('/api/sms/campaigns', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function sendSmsCampaign(campaignId) {
  return request(`/api/sms/campaigns/${campaignId}/send`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function deleteSmsCampaign(campaignId) {
  return request(`/api/sms/campaigns/${campaignId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function getAdminSmsSettings() {
  return request('/api/admin/sms/settings', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function saveAdminSmsSettings(payload) {
  return request('/api/admin/sms/settings', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function testAdminMoolreSmsSettings(payload = {}) {
  return request('/api/admin/sms/settings/moolre/test', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function testAdminBirdSmsSettings(payload = {}) {
  return request('/api/admin/sms/settings/bird/test', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminInternationalSmsPricing(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/sms/international-pricing${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function saveAdminInternationalSmsPricing(countryCode, payload) {
  return request(`/api/admin/sms/international-pricing/${encodeURIComponent(countryCode)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function saveAdminSharedSenderCountries(countryCodes) {
  return request('/api/admin/sms/shared-senders', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ country_codes: countryCodes }),
  });
}

export function getAdminSmsLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/sms/logs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminSmsStats() {
  return request('/api/admin/sms/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminSmsSenderIds(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/sms/sender-ids${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function syncAdminSmsSenderIds() {
  return request('/api/admin/sms/sender-ids/sync', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function syncAdminSmsSenderId(recordId) {
  return request(`/api/admin/sms/sender-ids/${recordId}/sync`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getAdminSmsmanCountries(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/smsman/countries${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminSmsmanServices(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/admin/smsman/services${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminSmsmanPricing() {
  return request('/api/admin/smsman/pricing', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function saveAdminSmsmanGlobalPricing(payload) {
  return request('/api/admin/smsman/pricing/global', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function saveAdminSmsmanOverride(payload) {
  return request('/api/admin/smsman/pricing/override', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteAdminSmsmanOverride(overrideId) {
  return request(`/api/admin/smsman/pricing/override/${overrideId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function getDeveloperApiKey() {
  return request('/api/developer/api-key', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function generateDeveloperApiKey() {
  return request('/api/developer/api-key', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function regenerateDeveloperApiKey() {
  return request('/api/developer/api-key/regenerate', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function revokeDeveloperApiKey() {
  return request('/api/developer/api-key/revoke', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function saveDeveloperWebhook(payload) {
  return request('/api/developer/webhook', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getDeveloperApiLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/developer/api-logs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminDeveloperApiStats() {
  return request('/api/admin/developer-api/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminDeveloperApiUsers() {
  return request('/api/admin/developer-api/users', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function updateAdminDeveloperApiStatus(keyId, payload) {
  return request(`/api/admin/developer-api/keys/${keyId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminCookieAnalytics() {
  return request('/api/admin/analytics/summary', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getSupportTickets() {
  return request('/api/support/tickets', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createSupportTicket(payload) {
  return request('/api/support/tickets', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getSupportTicket(ticketId) {
  return request(`/api/support/tickets/${ticketId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function addSupportMessage(ticketId, payload) {
  return request(`/api/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateSupportTicketStatus(ticketId, payload) {
  return request(`/api/support/tickets/${ticketId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminComplaints() {
  return request('/api/admin/complaints/', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminComplaintStats() {
  return request('/api/admin/complaints/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminComplaint(ticketId) {
  return request(`/api/admin/complaints/${ticketId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function addAdminComplaintMessage(ticketId, payload) {
  return request(`/api/admin/complaints/${ticketId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function addAdminComplaintNote(ticketId, payload) {
  return request(`/api/admin/complaints/${ticketId}/notes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateAdminComplaintStatus(ticketId, payload) {
  return request(`/api/admin/complaints/${ticketId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getEmbedWidgets() {
  return request('/api/embed-widgets', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function createEmbedWidget(payload) {
  return request('/api/embed-widgets', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getEmbedWidget(widgetId) {
  return request(`/api/embed-widgets/${widgetId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function updateEmbedWidget(widgetId, payload) {
  return request(`/api/embed-widgets/${widgetId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteEmbedWidget(widgetId) {
  return request(`/api/embed-widgets/${widgetId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function enableEmbedWidget(widgetId) {
  return request(`/api/embed-widgets/${widgetId}/enable`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function disableEmbedWidget(widgetId) {
  return request(`/api/embed-widgets/${widgetId}/disable`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getEmbedWidgetEmbedCode(widgetId) {
  return request(`/api/embed-widgets/${widgetId}/embed-code`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getEmbedWidgetStats() {
  return request('/api/embed-widgets/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getEmbedWidgetLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/embed-widgets/logs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getPublicWidgetConfig(widgetId, token) {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return request(`/api/public/widgets/${widgetId}/config${query}`, {
    method: 'GET',
  });
}

export function sendPublicWidgetSms(widgetId, payload) {
  return request(`/api/public/widgets/${widgetId}/send-sms`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendPublicWidgetEmail(widgetId, payload) {
  return request(`/api/public/widgets/${widgetId}/send-email`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendPublicWidgetCombined(widgetId, payload) {
  return request(`/api/public/widgets/${widgetId}/send-combined`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getAdminEmbedWidgets() {
  return request('/api/admin/embed-widgets', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminEmbedWidgetStats() {
  return request('/api/admin/embed-widgets/stats', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function getAdminEmbedWidgetLogs() {
  return request('/api/admin/embed-widgets/logs', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function enableAdminEmbedWidget(widgetId) {
  return request(`/api/admin/embed-widgets/${widgetId}/enable`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function disableAdminEmbedWidget(widgetId) {
  return request(`/api/admin/embed-widgets/${widgetId}/disable`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function getServiceStatus() {
  return request('/api/service-status', {
    method: 'GET',
  });
}

export function getAdminServiceControl() {
  return request('/api/admin/service-control', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export function updateAdminServiceControl(serviceKey, payload) {
  return request(`/api/admin/service-control/${serviceKey}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function lockAdminService(serviceKey, payload = {}) {
  return request(`/api/admin/service-control/${serviceKey}/lock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function unlockAdminService(serviceKey, payload = {}) {
  return request(`/api/admin/service-control/${serviceKey}/unlock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function assignAdminComplaint(ticketId, payload) {
  return request(`/api/admin/complaints/${ticketId}/assign`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminAbuseSummary() {
  return request('/api/admin/abuse/summary', { method: 'GET', headers: authHeaders() });
}

export function getAdminAbuseHighVolumeUsers() {
  return request('/api/admin/abuse/high-volume-users', { method: 'GET', headers: authHeaders() });
}

export function getAdminAbuseSuspiciousCampaigns() {
  return request('/api/admin/abuse/suspicious-campaigns', { method: 'GET', headers: authHeaders() });
}

export function getAdminAbuseRepeatedFailures() {
  return request('/api/admin/abuse/repeated-failures', { method: 'GET', headers: authHeaders() });
}

export function getAdminAbuseBlockedKeywords() {
  return request('/api/admin/abuse/blocked-keywords', { method: 'GET', headers: authHeaders() });
}

export function addAdminAbuseBlockedKeyword(keyword) {
  return request('/api/admin/abuse/blocked-keywords', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ keyword }),
  });
}

export function deleteAdminAbuseBlockedKeyword(keyword) {
  return request(`/api/admin/abuse/blocked-keywords/${encodeURIComponent(keyword)}`, { method: 'DELETE', headers: authHeaders() });
}

export function suspendAbuseUser(userId) {
  return request(`/api/admin/abuse/users/${userId}/suspend`, { method: 'POST', headers: authHeaders() });
}

export function limitAbuseUser(userId) {
  return request(`/api/admin/abuse/users/${userId}/limit`, { method: 'POST', headers: authHeaders() });
}

export function reactivateAbuseUser(userId) {
  return request(`/api/admin/abuse/users/${userId}/reactivate`, { method: 'POST', headers: authHeaders() });
}

export function pauseAbuseCampaign(campaignId) {
  return request(`/api/admin/abuse/campaigns/${campaignId}/pause`, { method: 'POST', headers: authHeaders() });
}

export function cancelAbuseCampaign(campaignId) {
  return request(`/api/admin/abuse/campaigns/${campaignId}/cancel`, { method: 'POST', headers: authHeaders() });
}
