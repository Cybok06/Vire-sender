import { ComponentType, ReactNode, useEffect } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { useAuth } from './contexts/AuthContext';

import LandingPage from './pages/LandingPage';
import AiAssistantLandingPage from './pages/AiAssistantLandingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import EmailVerificationPage from './pages/auth/EmailVerificationPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import AuthCallbackPage from './pages/auth/AuthCallbackPage';

import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage';
import TermsOfServicePage from './pages/legal/TermsOfServicePage';
import CookiePolicyPage from './pages/legal/CookiePolicyPage';
import GdprPage from './pages/legal/GdprPage';

import UserLayout from './components/layouts/UserLayout';
import AdminLayout from './components/layouts/AdminLayout';

import DashboardPage from './pages/user/DashboardPage';
import BuyNumberPage from './pages/user/BuyNumberPage';
import OtpReceivesPage from './pages/user/OtpReceivesPage';
import OtpSessionPage from './pages/user/OtpSessionPage';
import OrdersPage from './pages/user/OrdersPage';
import WalletPage from './pages/user/WalletPage';
import SmsPackagesPage from './pages/user/SmsPackagesPage';
import MoolreReturnPage from './pages/user/MoolreReturnPage';
import ProfilePage from './pages/user/ProfilePage';
import SendSmsPage from './pages/user/SendSmsPage';
import SenderIdsPage from './pages/user/SenderIdsPage';
import SmsCampaignsPage from './pages/user/SmsCampaignsPage';
import ContactsPage from './pages/user/ContactsPage';
import ContactMarketplacePage from './pages/user/ContactMarketplacePage';
import TemplatesPage from './pages/user/TemplatesPage';
import EmailSenderPage from './pages/user/EmailSenderPage';
import CopyPasteEmailModePage from './pages/user/CopyPasteEmailModePage';
import LogsPage from './pages/user/LogsPage';
import EmailAccountsPage from './pages/user/EmailAccountsPage';
import EmailCampaignsPage from './pages/user/EmailCampaignsPage';
import EmailMessageLogsPage from './pages/user/EmailMessageLogsPage';
import ApiAccessPage from './pages/user/ApiAccessPage';
import SupportPage from './pages/user/SupportPage';
import TicketDetailPage from './pages/user/TicketDetailPage';
import EmbedWidgetsPage from './pages/user/EmbedWidgetsPage';
import CreateWidgetPage from './pages/user/CreateWidgetPage';
import WidgetDetailPage from './pages/user/WidgetDetailPage';
import NotificationsPage from './pages/user/NotificationsPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminOrders from './pages/admin/AdminOrders';
import AdminUsers from './pages/admin/AdminUsers';
import AdminPricing from './pages/admin/AdminPricing';
import AdminApiSettings from './pages/admin/AdminApiSettings';
import AdminPaymentSettings from './pages/admin/AdminPaymentSettings';
import AdminSmsManagement from './pages/admin/AdminSmsManagement';
import AdminEmailManagement from './pages/admin/AdminEmailManagement';
import AdminCampaigns from './pages/admin/AdminCampaigns';
import AdminContacts from './pages/admin/AdminContacts';
import AdminContactMarketplace from './pages/admin/AdminContactMarketplace';
import AdminTemplates from './pages/admin/AdminTemplates';
import AdminMessageLogs from './pages/admin/AdminMessageLogs';
import AdminWalletBilling from './pages/admin/AdminWalletBilling';
import AdminProviderSettings from './pages/admin/AdminProviderSettings';
import AdminReportsAnalytics from './pages/admin/AdminReportsAnalytics';
import AdminApiManagement from './pages/admin/AdminApiManagement';
import AdminCookieAnalytics from './pages/admin/AdminCookieAnalytics';
import AdminAbuse from './pages/admin/AdminAbuse';
import AdminComplaints from './pages/admin/AdminComplaints';
import AdminTicketDetail from './pages/admin/AdminTicketDetail';
import AdminEmbedWidgets from './pages/admin/AdminEmbedWidgets';
import AdminServiceControl from './pages/admin/AdminServiceControl';
import AdminSmsmanRequests from './pages/admin/AdminSmsmanRequests';
import AdminSmsPackages from './pages/admin/AdminSmsPackages';

import EmbedPage from './pages/embed/EmbedPage';

const APP_NAME = 'VireSend';

function setRobotsContent(content: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function withPageTitle(title: string, Page: ComponentType, robots = 'index, follow') {
  return function PageWithTitle() {
    useEffect(() => {
      document.title = `${title} | ${APP_NAME}`;
      const path = window.location.pathname;
      const isPrivatePath = ['/user', '/admin', '/login', '/signup', '/register', '/auth', '/embed'].some((prefix) =>
        path.startsWith(prefix),
      );
      setRobotsContent(isPrivatePath ? 'noindex, nofollow' : robots);
    }, [robots, title]);

    return <Page />;
  };
}

function ProtectedRoute({ role, children }: { role: 'user' | 'admin'; children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const storedToken = localStorage.getItem('viresend_token');
  let storedUser: { role?: 'user' | 'admin' } | null = null;

  try {
    storedUser = JSON.parse(localStorage.getItem('viresend_user') || 'null');
  } catch {
    storedUser = null;
  }

  const activeUser = user || storedUser;
  const hasSession = isAuthenticated || (!!storedToken && !!activeUser);

  useEffect(() => {
    setRobotsContent('noindex, nofollow');
  }, []);

  if (!hasSession || !activeUser) {
    return <Navigate to="/login" replace />;
  }

  if (activeUser.role !== role) {
    return <Navigate to={activeUser.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'} replace />;
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/', Component: withPageTitle('Send SMS and Email Campaigns with AI in Ghana', LandingPage) },
  { path: '/services', Component: withPageTitle('SMS and Email Marketing Services', LandingPage) },
  { path: '/pricing', Component: withPageTitle('Pricing', LandingPage) },
  { path: '/api', Component: withPageTitle('Developer Messaging API', LandingPage) },
  { path: '/faq', Component: withPageTitle('FAQ', LandingPage) },
  { path: '/contact', Component: withPageTitle('Contact', LandingPage) },
  { path: '/ai-assistant', Component: withPageTitle('VireSend AI | Send SMS and Email Through Conversation', AiAssistantLandingPage) },
  { path: '/login', Component: withPageTitle('Login', LoginPage, 'noindex, nofollow') },
  { path: '/signup', Component: withPageTitle('Sign Up', SignupPage, 'noindex, nofollow') },
  { path: '/register', element: <Navigate to="/signup" replace /> },
  { path: '/verify-email', Component: withPageTitle('Verify Email', EmailVerificationPage, 'noindex, nofollow') },
  { path: '/auth/callback', Component: withPageTitle('Signing In', AuthCallbackPage, 'noindex, nofollow') },
  { path: '/forgot-password', Component: withPageTitle('Forgot Password', ForgotPasswordPage, 'noindex, nofollow') },
  { path: '/reset-password', Component: withPageTitle('Reset Password', ForgotPasswordPage, 'noindex, nofollow') },
  { path: '/privacy-policy',   Component: withPageTitle('VireSend Privacy Policy', PrivacyPolicyPage)  },
  { path: '/terms', Component: withPageTitle('VireSend Terms', TermsOfServicePage) },
  { path: '/terms-of-service', Component: withPageTitle('VireSend Terms of Service', TermsOfServicePage) },
  { path: '/cookie-policy',    Component: withPageTitle('Cookie Policy', CookiePolicyPage)   },
  { path: '/gdpr',             Component: withPageTitle('GDPR Compliance', GdprPage)           },

  // ── Standalone embed page (no layout, no auth) ──
  { path: '/embed/:widgetId', Component: withPageTitle('Embed Widget', EmbedPage, 'noindex, nofollow') },
  {
    path: '/user/email/copy-paste-mode',
    element: <ProtectedRoute role="user"><CopyPasteEmailModePage /></ProtectedRoute>,
  },
  { path: '/dashboard', element: <Navigate to="/user/dashboard" replace /> },
  { path: '/wallet', element: <Navigate to="/user/wallet" replace /> },
  { path: '/wallet/deposit/moolre/return', element: <ProtectedRoute role="user"><MoolreReturnPage /></ProtectedRoute> },
  { path: '/send-sms', element: <Navigate to="/user/send-sms" replace /> },
  { path: '/email-sender', element: <Navigate to="/user/email-sender" replace /> },
  { path: '/otp-numbers', element: <Navigate to="/user/buy-number" replace /> },
  { path: '/otp-receives', element: <Navigate to="/user/otp-receives" replace /> },
  { path: '/api-access', element: <Navigate to="/user/api-access" replace /> },
  { path: '/complaints', element: <Navigate to="/user/support" replace /> },

  {
    path: '/user',
    element: <ProtectedRoute role="user"><UserLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard',         Component: withPageTitle('Dashboard', DashboardPage)        },
      { path: 'buy-number',        Component: withPageTitle('Buy Number', BuyNumberPage)        },
      { path: 'otp-receives',      Component: withPageTitle('OTP Receives', OtpReceivesPage)      },
      { path: 'otp-session',       Component: withPageTitle('OTP Session', OtpSessionPage)       },
      { path: 'orders',            Component: withPageTitle('Orders', OrdersPage)           },
      { path: 'wallet',            Component: withPageTitle('Wallet', WalletPage)           },
      { path: 'sms-packages',      Component: withPageTitle('Recharge SMS', SmsPackagesPage) },
      { path: 'profile',           Component: withPageTitle('Profile', ProfilePage)          },
      { path: 'send-sms',          Component: withPageTitle('Send SMS', SendSmsPage)          },
      { path: 'sender-ids',        Component: withPageTitle('Sender IDs', SenderIdsPage)        },
      { path: 'sms-campaigns',     Component: withPageTitle('SMS Campaigns', SmsCampaignsPage)     },
      { path: 'contacts',          Component: withPageTitle('Contacts', ContactsPage)         },
      { path: 'contact-marketplace', Component: withPageTitle('Contact Marketplace', ContactMarketplacePage) },
      { path: 'templates',         Component: withPageTitle('Templates', TemplatesPage)        },
      { path: 'email-accounts',    Component: withPageTitle('Email Accounts', EmailAccountsPage)    },
      { path: 'email-sender',      Component: withPageTitle('Email Sender', EmailSenderPage)      },
      { path: 'email-campaigns',   Component: withPageTitle('Email Campaigns', EmailCampaignsPage)   },
      { path: 'email-message-logs', Component: withPageTitle('Email Message Logs', EmailMessageLogsPage) },
      { path: 'logs',              Component: withPageTitle('Logs', LogsPage)             },
      { path: 'api-access',        Component: withPageTitle('API Access', ApiAccessPage)        },
      { path: 'support',           Component: withPageTitle('Support', SupportPage)          },
      { path: 'support/:ticketId', Component: withPageTitle('Support Ticket', TicketDetailPage)     },
      // ── Embed Widgets ──
      { path: 'embed-widgets',              Component: withPageTitle('Embed Widgets', EmbedWidgetsPage)  },
      { path: 'embed-widgets/create',       Component: withPageTitle('Create Widget', CreateWidgetPage)  },
      { path: 'embed-widgets/:widgetId',    Component: withPageTitle('Widget Details', WidgetDetailPage)  },
      { path: 'embed-widgets/:widgetId/edit', Component: withPageTitle('Edit Widget', CreateWidgetPage) },
      { path: 'notifications',             Component: withPageTitle('Notifications', NotificationsPage)  },
    ],
  },
  {
    path: '/admin',
    element: <ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard',              Component: withPageTitle('Admin Dashboard', AdminDashboard)         },
      { path: 'orders',                 Component: withPageTitle('Admin Orders', AdminOrders)            },
      { path: 'users',                  Component: withPageTitle('Admin Users', AdminUsers)             },
      { path: 'pricing',                Component: withPageTitle('Pricing', AdminPricing)           },
      { path: 'api-settings',           Component: withPageTitle('API Settings', AdminApiSettings)       },
      { path: 'payment-settings',       Component: withPageTitle('Payment Settings', AdminPaymentSettings)   },
      { path: 'settings',               element: <Navigate to="../payment-settings" replace /> },
      { path: 'sms',                    Component: withPageTitle('SMS Management', AdminSmsManagement)     },
      { path: 'sms-packages',           Component: withPageTitle('SMS Packages', AdminSmsPackages) },
      { path: 'sms-logs',               element: <Navigate to="../sms" replace /> },
      { path: 'email',                  Component: withPageTitle('Email Management', AdminEmailManagement)   },
      { path: 'email-logs',             element: <Navigate to="../email" replace /> },
      { path: 'campaigns',              Component: withPageTitle('Campaigns', AdminCampaigns)         },
      { path: 'contacts',               Component: withPageTitle('Contacts', AdminContacts)          },
      { path: 'contact-marketplace',    Component: withPageTitle('Contact Marketplace', AdminContactMarketplace) },
      { path: 'templates',              Component: withPageTitle('Templates', AdminTemplates)         },
      { path: 'logs',                   Component: withPageTitle('Message Logs', AdminMessageLogs)       },
      { path: 'billing',                Component: withPageTitle('Wallet Billing', AdminWalletBilling)     },
      { path: 'provider-settings',      Component: withPageTitle('Provider Settings', AdminProviderSettings)  },
      { path: 'reports',                Component: withPageTitle('Reports Analytics', AdminReportsAnalytics)  },
      { path: 'cookie-analytics',        Component: withPageTitle('Cookie Analytics', AdminCookieAnalytics)    },
      { path: 'api-management',         Component: withPageTitle('API Management', AdminApiManagement)     },
      { path: 'abuse',                  Component: withPageTitle('Abuse Reports', AdminAbuse)             },
      { path: 'complaints',             Component: withPageTitle('Complaints', AdminComplaints)        },
      { path: 'complaints/:ticketId',   Component: withPageTitle('Complaint Ticket', AdminTicketDetail)      },
      // ── Embed Widgets ──
      { path: 'embed-widgets',          Component: withPageTitle('Admin Embed Widgets', AdminEmbedWidgets)      },
      { path: 'service-control',        Component: withPageTitle('Service Control', AdminServiceControl)    },
      { path: 'smsman-requests',        Component: withPageTitle('SMS-MAN Requests', AdminSmsmanRequests)    },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
