import { useState } from 'react';
import { ApiError, api } from '@/api/client';
import type { ShareLink, Talk } from '@/api/types';
import ShareDialog from '@/components/ShareDialog';

export interface ShareButtonProps {
  talk: Talk;
}

/**
 * The Share action in the talk view: mints a link on click, then opens the
 * dialog that shows it.
 *
 * Minting on the click rather than when the dialog mounts is deliberate. Every
 * POST makes a new, permanent token, and an effect would mint two under
 * StrictMode — one of them never shown, so never revocable from the app.
 */
export default function ShareButton({ talk }: ShareButtonProps) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<ShareLink>();
  const [error, setError] = useState<string>();

  // The resolver serves the deck, so a link to a talk without one would only
  // ever answer "not available".
  const hasDeck = !!talk.files?.deck;

  const onShare = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setLink(await api.share(talk.talkId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a share link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => void onShare()}
        disabled={!hasDeck || busy}
        title={hasDeck ? 'Share this talk with a link' : 'Upload a deck before sharing'}
        className="rounded border border-line px-2 py-0.5 text-sm hover:bg-raised disabled:opacity-50"
      >
        {busy ? 'Sharing…' : 'Share'}
      </button>
      {link && <ShareDialog talk={talk} link={link} onClose={() => setLink(undefined)} />}
    </>
  );
}
