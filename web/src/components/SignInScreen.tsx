import { useAuth } from 'react-oidc-context';

export interface SignInScreenProps {
  /** Set when a token was obtained but the account is not permitted. */
  denied?: string;
}

export default function SignInScreen({ denied }: SignInScreenProps) {
  const auth = useAuth();

  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="text-4xl">
          ⚡
        </span>
        <h1 className="text-2xl font-semibold">Lightning</h1>
        <p className="max-w-sm text-sm text-muted">Talks, decks and speaker notes.</p>
      </div>

      {denied ? (
        <p role="alert" className="max-w-sm text-sm text-danger">
          {denied}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void auth.signinRedirect()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
        >
          Sign in
        </button>
      )}
    </main>
  );
}
