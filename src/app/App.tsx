import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './routes';
import { AuthProvider } from './contexts/AuthContext';
import { OtpSessionProvider } from './contexts/OtpSessionContext';
import { ComplaintsProvider } from './contexts/ComplaintsContext';
import { EmbedWidgetsProvider } from './contexts/EmbedWidgetsContext';
import { ServiceAvailabilityProvider } from './contexts/ServiceAvailabilityContext';
import { NotificationsProvider } from './contexts/NotificationsContext';

export default function App() {
  return (
    <AuthProvider>
      <OtpSessionProvider>
        <ComplaintsProvider>
          <EmbedWidgetsProvider>
            <ServiceAvailabilityProvider>
              <NotificationsProvider>
                <RouterProvider router={router} />
                <Toaster
                  position="top-right"
                  richColors
                  closeButton
                  toastOptions={{
                    style: { borderRadius: '12px', fontFamily: 'Inter, sans-serif' },
                  }}
                />
              </NotificationsProvider>
            </ServiceAvailabilityProvider>
          </EmbedWidgetsProvider>
        </ComplaintsProvider>
      </OtpSessionProvider>
    </AuthProvider>
  );
}