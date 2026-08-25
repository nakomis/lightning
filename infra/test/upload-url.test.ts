import { sanitiseFilename } from '../lambda/api/upload-url';

describe('sanitiseFilename', () => {
  // The filename becomes part of an S3 key, so traversal here would write
  // outside the talk's own prefix.
  it('strips directory traversal', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('..\\..\\windows\\system32')).toBe('system32');
  });

  it('keeps ordinary names intact', () => {
    expect(sanitiseFilename('slides.html')).toBe('slides.html');
    expect(sanitiseFilename('my-deck_v2.html')).toBe('my-deck_v2.html');
  });

  it('replaces characters that are ambiguous in a key', () => {
    expect(sanitiseFilename('a b?c#d.png')).toBe('a-b-c-d.png');
  });

  it('refuses a name that sanitises to nothing', () => {
    expect(() => sanitiseFilename('../')).toThrow();
    expect(() => sanitiseFilename('...')).toThrow();
  });

  it('caps the length', () => {
    expect(sanitiseFilename('a'.repeat(500))).toHaveLength(120);
  });
});
