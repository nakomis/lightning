import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { setAccessToken } from '@/api/auth-token';

/**
 * Keeps the API client's bearer token in step with the OIDC session. Renders
 * nothing — mount once inside <AuthProvider>.
 */
export default function AuthTokenSync() {
  const auth = useAuth();

  useEffect(() => {
    setAccessToken(auth.user?.access_token);
  }, [auth.user?.access_token]);

  return null;
}
