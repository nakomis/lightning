import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';
import type { Me, Talk, TalksResponse } from '@/api/types';
import Home from '@/routes/Home';

const mockAuth = {
  isLoading: false,
  isAuthenticated: true,
  user: { access_token: 'tok' },
  signinRedirect: vi.fn(),
  removeUser: vi.fn(),
  error: undefined as Error | undefined,
};

vi.mock('react-oidc-context', () => ({
  useAuth: () => mockAuth,
}));

const talk = (over: Partial<Talk> = {}): Talk => ({
  talkId: 't1',
  title: 'A talk',
  collection: 'TDS',
  date: '2026-08-25',
  createdBy: 'a@b.com',
  createdAt: '2026-08-25T00:00:00Z',
  files: { deck: 'talks/t1/deck/deck.html' },
  ...over,
});

const me = (over: Partial<Me> = {}): Me => ({
  email: 'a@b.com',
  isAdmin: false,
  collections: [{ name: 'TDS', role: 'rw' }],
  ...over,
});

const talks = (over: Partial<TalksResponse> = {}): TalksResponse => ({
  talks: [talk()],
  collections: ['TDS'],
  ...over,
});

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

describe('Home', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(mockAuth, { isLoading: false, isAuthenticated: true, error: undefined });
  });

  it('shows the sign-in screen when there is no session', () => {
    mockAuth.isAuthenticated = false;
    renderHome();

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('lists talks once signed in', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(me());
    vi.spyOn(api, 'talks').mockResolvedValue(talks());

    renderHome();

    expect(await screen.findByRole('button', { name: /A talk/ })).toBeInTheDocument();
  });

  it('explains a 403 rather than inviting a sign-in loop', async () => {
    // A 403 from /me means the token is valid but the account is not in the
    // gate group. Offering "sign in" again would send them round a loop that
    // cannot succeed.
    vi.spyOn(api, 'me').mockRejectedValue(new ApiError(403, 'Not a member of the lightning group'));

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent(/lightning group/);
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('selects a talk and shows its detail', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'me').mockResolvedValue(me());
    vi.spyOn(api, 'talks').mockResolvedValue(talks());
    vi.spyOn(api, 'content').mockResolvedValue({
      url: 'https://s3/x',
      kind: 'deck',
      expiresIn: 900,
    });

    renderHome();
    await user.click(await screen.findByRole('button', { name: /A talk/ }));

    expect(await screen.findByRole('heading', { level: 2, name: 'A talk' })).toBeInTheDocument();
  });

  it('collapses the talks panel', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'me').mockResolvedValue(me());
    vi.spyOn(api, 'talks').mockResolvedValue(talks());

    renderHome();
    await screen.findByRole('button', { name: /A talk/ });

    await user.click(screen.getByRole('button', { name: /hide talks/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /A talk/ })).not.toBeInTheDocument(),
    );
  });

  it('offers no new-talk control to someone with only read access', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(me({ collections: [{ name: 'TDS', role: 'ro' }] }));
    vi.spyOn(api, 'talks').mockResolvedValue(talks());

    renderHome();
    await screen.findByRole('button', { name: /A talk/ });

    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
  });

  it('treats an admin as able to write any collection', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'me').mockResolvedValue(me({ isAdmin: true, collections: [] }));
    vi.spyOn(api, 'talks').mockResolvedValue(talks());
    vi.spyOn(api, 'content').mockResolvedValue({
      url: 'https://s3/x',
      kind: 'deck',
      expiresIn: 900,
    });

    renderHome();
    await user.click(await screen.findByRole('button', { name: /A talk/ }));
    await user.click(screen.getByText(/Files & sharing/));

    expect(screen.queryByText(/read-only access/i)).not.toBeInTheDocument();
  });

  it('reports a failure to load talks', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(me());
    vi.spyOn(api, 'talks').mockRejectedValue(new ApiError(500, 'boom'));

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load talks/i);
  });
});
