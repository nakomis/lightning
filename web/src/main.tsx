import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import AuthTokenSync from '@/components/AuthTokenSync';
import { oidcConfig } from '@/lib/auth';
import { router } from '@/router';
import './index.css';

const queryClient = new QueryClient({
  // A 403 from the access check will not become a 200 by asking again.
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthTokenSync />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
);
