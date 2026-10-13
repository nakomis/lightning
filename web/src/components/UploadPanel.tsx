import { useRef, useState } from 'react';
import { ApiError, uploadFile } from '@/api/client';
import type { Talk, UploadKind } from '@/api/types';

export interface UploadPanelProps {
  talk: Talk;
  canWrite: boolean;
  onChanged: () => void;
}

const LABELS: Record<UploadKind, string> = {
  deck: 'Deck (HTML)',
  notes: 'Speaker notes (Markdown)',
  asset: 'Asset',
};

const ACCEPT: Record<UploadKind, string> = {
  deck: '.html,text/html',
  notes: '.md,.markdown,text/markdown',
  asset: '',
};

/** Upload a deck, notes or an asset. Sharing lives in the talk header (ShareButton). */
export default function UploadPanel({ talk, canWrite, onChanged }: UploadPanelProps) {
  const [busy, setBusy] = useState<UploadKind>();
  const [error, setError] = useState<string>();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!canWrite) {
    return (
      <p className="p-4 text-sm text-muted">
        You have read-only access to <strong>{talk.collection}</strong>.
      </p>
    );
  }

  const onPick = async (kind: UploadKind, file: File | undefined) => {
    if (!file) return;
    setBusy(kind);
    setError(undefined);
    try {
      await uploadFile(talk.talkId, kind, file);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not upload the ${kind}.`);
    } finally {
      setBusy(undefined);
      const input = inputs.current[kind];
      // Clearing it means picking the same file again still fires onChange.
      if (input) input.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-3">
        {(['deck', 'notes', 'asset'] as UploadKind[]).map((kind) => (
          <label key={kind} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{LABELS[kind]}</span>
            <input
              ref={(el) => {
                inputs.current[kind] = el;
              }}
              type="file"
              accept={ACCEPT[kind] || undefined}
              disabled={busy !== undefined}
              onChange={(e) => void onPick(kind, e.target.files?.[0])}
              className="text-sm text-muted file:mr-3 file:rounded file:border file:border-line file:bg-raised file:px-3 file:py-1.5 file:text-ink"
            />
            {busy === kind && <span className="text-xs text-muted">Uploading…</span>}
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
