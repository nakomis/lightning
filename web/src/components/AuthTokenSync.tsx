import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { setAccessToken } from '@/api/auth-token';

/**
 * Keeps the API client's bearer token in step with the OIDC session. Renders
 * nothing — mount once inside <AuthProvider>.
 *
 * The *ID* token, not the access token. A Cognito access token carries `sub`,
 * `scope` and `cognito:groups`, but no `email` — and the access table is keyed
 * on the verified email address, so the API answers 403 for every request made
 * with one. The ID token's `aud` is the client id, which is what the API
 * Gateway authoriser checks, so it validates identically.
 */
export default function AuthTokenSync() {
  const auth = useAuth();

  useEffect(() => {
    setAccessToken(auth.user?.id_token);
  }, [auth.user?.id_token]);

  return null;
}
