import { useState } from 'react';
import { ApiError, api } from '@/api/client';
import type { Talk } from '@/api/types';

export interface NewTalkFormProps {
  /** Only collections the caller may write to — the API would refuse the rest. */
  collections: string[];
  onCreated: (talk: Talk) => void;
}

export default function NewTalkForm({ collections, onCreated }: NewTalkFormProps) {
  const [title, setTitle] = useState('');
  const [collection, setCollection] = useState(collections[0] ?? '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (collections.length === 0) {
    return (
      <p className="p-4 text-sm text-muted">You do not have write access to any collection.</p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { talk } = await api.createTalk({ title: title.trim(), collection, date });
      setTitle('');
      onCreated(talk);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the talk.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className="rounded border border-line bg-surface px-2 py-1.5"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Collection</span>
        <select
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
          className="rounded border border-line bg-surface px-2 py-1.5"
        >
          {collections.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded border border-line bg-surface px-2 py-1.5 tabular-nums"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create talk'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
