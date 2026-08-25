import { describe, expect, it } from 'vitest';
import { oidcConfig } from '@/lib/auth';

describe('oidcConfig', () => {
  it('uses the authorisation-code flow, never implicit', () => {
    // The client is registered without the implicit grant. Asking for a token
    // response here would fail at Cognito, and would put a token in the URL.
    expect(oidcConfig.response_type).toBe('code');
  });

  it('asks only for the scopes the API actually reads', () => {
    expect(oidcConfig.scope.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
  });
});
