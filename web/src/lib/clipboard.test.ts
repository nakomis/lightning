import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/lib/clipboard';

const field = (value: string) => {
  const input = document.createElement('input');
  input.value = value;
  document.body.append(input);
  return input;
};

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('writes to the clipboard when it can', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('https://l.example/d/abc')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://l.example/d/abc');
  });

  it('selects the text instead when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    });
    const input = field('https://l.example/d/abc');

    await expect(copyText(input.value, input)).resolves.toBe('selected');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('selects the text when there is no clipboard API at all', async () => {
    // As on plain http, where navigator.clipboard is undefined.
    vi.stubGlobal('navigator', {});
    const input = field('https://l.example/d/abc');

    await expect(copyText(input.value, input)).resolves.toBe('selected');
    expect(input.selectionEnd).toBe(input.value.length);
  });
});
