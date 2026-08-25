import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '@/api/auth-token';
import AuthTokenSync from '@/components/AuthTokenSync';

const auth = { user: undefined as { access_token: string } | undefined };
vi.mock('react-oidc-context', () => ({ useAuth: () => auth }));

describe('AuthTokenSync', () => {
  it('pushes the session token into the API client', () => {
    auth.user = { access_token: 'tok-abc' };
    render(<AuthTokenSync />);

    expect(getAccessToken()).toBe('tok-abc');
  });

  it('clears it again when the session ends', () => {
    auth.user = undefined;
    render(<AuthTokenSync />);

    expect(getAccessToken()).toBeUndefined();
  });
});
