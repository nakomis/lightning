import { useEffect, useState } from 'react';
import { ApiError, api } from '@/api/client';
import type { Talk } from '@/api/types';

export interface DeckViewerProps {
  talk: Talk;
}

/**
 * The deck, in a sandboxed iframe.
 *
 * A deck is HTML that someone uploaded. Rendered in this origin it could read
 * the Cognito tokens out of storage and call the API as the viewer, so it gets
 * `sandbox` *without* `allow-same-origin`: the frame is forced into an opaque
 * origin with no access to this document, its storage, or its cookies.
 *
 * `allow-scripts` is granted because a slide deck needs it to advance. That is
 * only safe in the absence of `allow-same-origin` — the two together let the
 * frame remove its own sandbox, which is worse than no sandbox at all.
 */
export default function DeckViewer({ talk }: DeckViewerProps) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    setError(undefined);

    if (!talk.files?.deck) {
      setError('This talk has no deck uploaded yet.');
      return;
    }

    api
      .content(talk.talkId, 'deck')
      .then((result) => {
        if (!cancelled) setUrl(result.url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load the deck.');
      });

    return () => {
      cancelled = true;
    };
  }, [talk.talkId, talk.files?.deck]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted">Loading deck…</p>
      </div>
    );
  }

  return (
    <iframe
      key={url}
      src={url}
      title={`${talk.title} — deck`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="h-full w-full border-0 bg-surface"
    />
  );
}
