import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ApiError, api } from '@/api/client';
import type { Talk } from '@/api/types';
import DeckViewer from '@/components/DeckViewer';
import NewTalkForm from '@/components/NewTalkForm';
import SignInScreen from '@/components/SignInScreen';
import TalkList from '@/components/TalkList';
import UploadPanel from '@/components/UploadPanel';
import { signOut } from '@/lib/auth';

export default function Home() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const signedIn = auth.isAuthenticated;

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: signedIn, retry: false });
  const talks = useQuery({
    queryKey: ['talks'],
    queryFn: api.talks,
    enabled: signedIn && me.isSuccess,
  });

  const list = talks.data?.talks ?? [];
  const selected = list.find((t) => t.talkId === selectedId);

  // Keep the selection valid when the list changes underneath it.
  useEffect(() => {
    if (selectedId && list.length > 0 && !list.some((t) => t.talkId === selectedId)) {
      setSelectedId(undefined);
    }
  }, [list, selectedId]);

  if (auth.isLoading) {
    return (
      <main className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (!signedIn) return <SignInScreen />;

  // A 403 from /me means the token is fine but the account is not in the gate
  // group — a different thing from being signed out, and telling someone to
  // sign in again would send them round a loop that cannot succeed.
  if (me.isError) {
    const err = me.error;
    const denied =
      err instanceof ApiError && err.status === 403
        ? `${err.message}. Ask an administrator for access.`
        : 'Could not load your account.';
    return <SignInScreen denied={denied} />;
  }

  const writable = (me.data?.collections ?? []).filter((c) => c.role === 'rw').map((c) => c.name);
  const canWriteSelected =
    !!selected && (me.data?.isAdmin === true || writable.includes(selected.collection));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['talks'] });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? 'Hide talks' : 'Show talks'}
          className="rounded px-2 py-1 text-sm hover:bg-raised"
        >
          ☰
        </button>
        <span aria-hidden="true">⚡</span>
        <h1 className="flex-1 text-sm font-semibold">Lightning</h1>
        <span className="hidden text-xs text-muted sm:inline">{me.data?.email}</span>
        <button
          type="button"
          onClick={() => signOut(auth)}
          className="rounded px-2 py-1 text-sm hover:bg-raised"
        >
          Sign out
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {panelOpen && (
          <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                Talks
              </span>
              {writable.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-expanded={showNew}
                  className="rounded px-2 py-0.5 text-sm hover:bg-raised"
                  title="New talk"
                >
                  +
                </button>
              )}
            </div>

            {showNew && (
              <NewTalkForm
                collections={writable}
                onCreated={(talk: Talk) => {
                  setShowNew(false);
                  refresh();
                  setSelectedId(talk.talkId);
                }}
              />
            )}

            {talks.isLoading && <p className="px-4 py-2 text-sm text-muted">Loading talks…</p>}
            {talks.isError && (
              <p role="alert" className="px-4 py-2 text-sm text-danger">
                Could not load talks.
              </p>
            )}
            {talks.isSuccess && (
              <TalkList
                talks={list}
                collections={talks.data.collections}
                selectedId={selectedId}
                onSelect={(talk) => setSelectedId(talk.talkId)}
              />
            )}
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex items-baseline gap-3 border-b border-line px-4 py-2">
                <h2 className="text-sm font-semibold">{selected.title}</h2>
                <span className="text-xs text-muted tabular-nums">{selected.date}</span>
                <span className="text-xs text-muted">{selected.collection}</span>
              </div>
              <div className="min-h-0 flex-1">
                <DeckViewer talk={selected} />
              </div>
              <details className="border-t border-line">
                <summary className="cursor-pointer px-4 py-2 text-sm">Files &amp; sharing</summary>
                <UploadPanel talk={selected} canWrite={canWriteSelected} onChanged={refresh} />
              </details>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-sm text-muted">Select a talk from the list.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
