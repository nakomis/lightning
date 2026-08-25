import { afterEach, describe, expect, it } from 'vitest';
import { authHeaders, getAccessToken, setAccessToken } from '@/api/auth-token';

afterEach(() => setAccessToken(undefined));

describe('auth-token', () => {
  it('round-trips a token', () => {
    setAccessToken('abc');
    expect(getAccessToken()).toBe('abc');
    expect(authHeaders()).toEqual({ Authorization: 'Bearer abc' });
  });

  it('yields no header at all when signed out, rather than an empty one', () => {
    expect(authHeaders()).toEqual({});
  });
});
