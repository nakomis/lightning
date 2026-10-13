import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, api } from '@/api/client';
import type { ShareLink, Talk } from '@/api/types';
import { type CopyOutcome, copyText } from '@/lib/clipboard';

export interface ShareDialogProps {
  talk: Talk;
  link: ShareLink;
  onClose: () => void;
}

/**
 * Shows a freshly minted share link, with Copy and Revoke.
 *
 * The semantics are the API's (infra/lambda/api/share.ts): a link never
 * expires, revoking it is per-token and permanent, and nothing lists the
 * tokens a talk has — so this dialog is the only place this particular link
 * can be revoked from, and the copy says so.
 */
export default function ShareDialog({ talk, link, onClose }: ShareDialogProps) {
  const titleId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<CopyOutcome>();
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onCopy = async () => {
    setCopied(await copyText(link.url, field.current));
  };

  const onRevoke = async () => {
    setRevoking(true);
    setError(undefined);
    try {
      await api.revokeShare(talk.talkId, link.token);
      setRevoked(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revoke the link.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Share “{talk.title}”
        </h2>

        <p className="text-sm text-muted">
          Anyone with this link can open the deck and its speaker notes without signing in. It isn’t
          listed or indexed anywhere, so only people you send it to will find it.
        </p>

        <div className="flex gap-2">
          <input
            ref={field}
            type="text"
            readOnly
            value={link.url}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            className={`min-w-0 flex-1 rounded border border-line bg-raised px-2 py-1.5 font-mono text-xs ${
              revoked ? 'text-muted line-through' : ''
            }`}
          />
          <button
            type="button"
            onClick={() => void onCopy()}
            disabled={revoked}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-50"
          >
            {copied === 'copied' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p aria-live="polite" className="-mt-2 min-h-4 text-xs text-muted">
          {copied === 'copied' && 'Copied to the clipboard.'}
          {copied === 'selected' &&
            'Couldn’t reach the clipboard — the link is selected, so press Ctrl+C (⌘C on a Mac).'}
        </p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Expires</dt>
          <dd>Never — it works until you revoke it.</dd>
          <dt className="text-muted">Status</dt>
          <dd>{revoked ? 'Revoked' : 'Active'}</dd>
        </dl>

        {revoked ? (
          <p role="status" className="text-sm">
            Revoked. Anyone opening this link now sees a page saying it isn’t available.
          </p>
        ) : (
          <p className="text-xs text-muted">
            Lightning doesn’t keep a list of the links it has issued, so this is the only place you
            can revoke this one. Each Share makes a new link; earlier ones keep working.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {!revoked && (
            <button
              type="button"
              onClick={() => void onRevoke()}
              disabled={revoking}
              className="rounded border border-line px-3 py-1.5 text-sm text-danger hover:bg-raised disabled:opacity-50"
            >
              {revoking ? 'Revoking…' : 'Revoke link'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line px-3 py-1.5 text-sm hover:bg-raised"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
