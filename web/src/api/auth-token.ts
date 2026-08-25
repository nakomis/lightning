/**
 * Module-scoped holder for the current OIDC access token.
 *
 * The fetch wrapper runs outside React, so it cannot call `useAuth()`.
 * <AuthTokenSync> pushes the latest token in here whenever the session changes
 * and the client reads it back when building each request.
 */
let accessToken: string | undefined;

export function setAccessToken(token: string | undefined): void {
  accessToken = token;
}

export function getAccessToken(): string | undefined {
  return accessToken;
}

export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
