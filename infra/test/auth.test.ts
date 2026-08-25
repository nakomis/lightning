import { parseGroups } from '../lambda/shared/auth';

describe('parseGroups', () => {
  // API Gateway serialises this claim three different ways depending on payload
  // version and group count. Getting it wrong fails open, so all three are pinned.
  it('accepts an array', () => {
    expect(parseGroups(['lightning', 'other'])).toEqual(['lightning', 'other']);
  });

  it('accepts a single bare string', () => {
    expect(parseGroups('lightning')).toEqual(['lightning']);
  });

  it('accepts the bracketed string form', () => {
    expect(parseGroups('[lightning other]')).toEqual(['lightning', 'other']);
  });

  it('is empty for undefined, null and empty string', () => {
    expect(parseGroups(undefined)).toEqual([]);
    expect(parseGroups(null)).toEqual([]);
    expect(parseGroups('')).toEqual([]);
  });

  it('does not treat a substring as membership', () => {
    // "lightning-admin" must not satisfy a check for "lightning".
    expect(parseGroups('lightning-admin')).toEqual(['lightning-admin']);
    expect(parseGroups('lightning-admin').includes('lightning')).toBe(false);
  });
});
