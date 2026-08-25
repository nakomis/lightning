import { newShareToken } from '../lambda/shared/ids';

describe('newShareToken', () => {
  it('is 22 base62 characters by default', () => {
    expect(newShareToken()).toMatch(/^[A-Za-z0-9]{22}$/);
  });

  it('honours an explicit length', () => {
    expect(newShareToken(40)).toHaveLength(40);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newShareToken()));
    expect(seen.size).toBe(500);
  });

  it('uses the whole alphabet', () => {
    // A modulo bias would starve the tail of the alphabet. 500 tokens is far
    // more than enough to see every character if the distribution is even.
    const chars = new Set(Array.from({ length: 500 }, () => newShareToken()).join(''));
    expect(chars.size).toBeGreaterThan(55);
  });
});
