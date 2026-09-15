import type { AuthContextProps } from 'react-oidc-context';
import Config from '@/config/config';

/**
 * OIDC settings for the shared Cognito pool.
 *
 * `response_type: 'code'` is the authorisation-code flow; the client is
 * registered without the implicit grant, so a token never appears in the URL.
 */
export const oidcConfig = {
  authority: Config.cognito.authority,
  client_id: Config.cognito.userPoolClientId,
  redirect_uri: Config.cognito.redirectUri,
  post_logout_redirect_uri: Config.cognito.logoutUri,
  response_type: 'code',
  scope: 'email openid profile',
  // Drop the ?code=…&state=… the IdP appends, so a reload does not try to
  // redeem a code that has already been spent.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, '/');
  },
};

/** Clear the local session, then Cognito's, so a re-login really re-prompts. */
export function signOut(auth: AuthContextProps) {
  const { cognitoDomain, userPoolClientId } = Config.cognito;
  const logoutUrl =
    `https://${cognitoDomain}/logout` +
    `?client_id=${userPoolClientId}` +
    `&logout_uri=${encodeURIComponent(Config.cognito.logoutUri)}`;
  void auth.removeUser();
  window.location.href = logoutUrl;
}
