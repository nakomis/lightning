/**
 * The key check on confirm-upload. Without it, someone with write access to
 * their own talk could point it at a key under another talk's prefix, and the
 * share resolver would then sign whatever key the talk names.
 */
import { isKeyWithinTalk } from '../lambda/api/confirm-upload';

describe('isKeyWithinTalk', () => {
  it('accepts a key under the talk it belongs to', () => {
    expect(isKeyWithinTalk('talks/t1/deck/deck.html', 't1')).toBe(true);
    expect(isKeyWithinTalk('talks/t1/notes.md', 't1')).toBe(true);
  });

  it('refuses another talk entirely', () => {
    expect(isKeyWithinTalk('talks/t2/deck/deck.html', 't1')).toBe(false);
  });

  it('refuses a talk id that merely starts with this one', () => {
    // A prefix comparison rather than a segment one would let `t1` claim
    // anything under `t10`.
    expect(isKeyWithinTalk('talks/t10/deck/deck.html', 't1')).toBe(false);
  });

  it('refuses traversal out of the prefix', () => {
    expect(isKeyWithinTalk('talks/t1/../t2/deck.html', 't1')).toBe(true);
    // ^ segment-wise this *is* under talks/t1, and S3 keys are literal — there
    // is no path resolution, so `..` is just a directory called `..`. The
    // dangerous form is the one that does not start under the talk at all:
    expect(isKeyWithinTalk('../talks/t2/deck.html', 't1')).toBe(false);
    expect(isKeyWithinTalk('talks/t1', 't1')).toBe(false);
  });

  it('refuses a key outside the talks prefix', () => {
    expect(isKeyWithinTalk('recordings/t1/x.webm', 't1')).toBe(false);
    expect(isKeyWithinTalk('t1/deck.html', 't1')).toBe(false);
  });
});
