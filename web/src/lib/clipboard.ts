export type CopyOutcome = 'copied' | 'selected';

/**
 * Copy text to the clipboard, or failing that, select it for the user to copy.
 *
 * `navigator.clipboard` is missing outside a secure context and can be refused
 * by permissions policy or by a browser that wants a fresher user gesture. In
 * every one of those cases the text is still on screen in `field`, so selecting
 * it leaves the user one keystroke from done rather than stuck.
 */
export async function copyText(
  text: string,
  field?: HTMLInputElement | null,
): Promise<CopyOutcome> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    field?.focus();
    field?.select();
    return 'selected';
  }
}
