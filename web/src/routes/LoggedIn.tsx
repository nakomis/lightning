import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';

/**
 * Where Cognito redirects after a successful sign-in. react-oidc-context
 * redeems the code itself; this only waits for that to finish and then puts the
 * person back at the app root.
 */
export default function LoggedIn() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      window.location.replace('/');
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  return (
    <main className="flex h-full items-center justify-center p-8">
      <p className="text-sm text-muted">{auth.error ? auth.error.message : 'Signing you in…'}</p>
    </main>
  );
}
