import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '@/api/auth-token';
import AuthTokenSync from '@/components/AuthTokenSync';

const auth = { user: undefined as { id_token: string; access_token: string } | undefined };
vi.mock('react-oidc-context', () => ({ useAuth: () => auth }));

describe('AuthTokenSync', () => {
  it('pushes the ID token, not the access token', () => {
    // Deliberately different values: a Cognito access token has no email
    // claim, so sending it makes every API call 403.
    auth.user = { id_token: 'id-abc', access_token: 'access-abc' };
    render(<AuthTokenSync />);

    expect(getAccessToken()).toBe('id-abc');
  });

  it('clears it again when the session ends', () => {
    auth.user = undefined;
    render(<AuthTokenSync />);

    expect(getAccessToken()).toBeUndefined();
  });
});
