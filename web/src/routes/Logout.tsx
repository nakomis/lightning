export default function Logout() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Signed out</h1>
      <a href="/" className="text-sm text-accent underline">
        Sign in again
      </a>
    </main>
  );
}
