import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Talk } from '@/api/types';
import DeckViewer from '@/components/DeckViewer';

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

describe('DeckViewer', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sandboxes the deck without allow-same-origin', async () => {
    // This is the security-critical assertion in the whole SPA. A deck is
    // user-supplied HTML; with allow-same-origin it could read the Cognito
    // tokens out of storage and call the API as the viewer. The two flags
    // together also let the frame drop its own sandbox.
    vi.spyOn(api, 'content').mockResolvedValue({
      url: 'https://s3.example/deck.html',
      kind: 'deck',
      expiresIn: 900,
    });

    render(<DeckViewer talk={talk()} />);

    const frame = await screen.findByTitle('A talk — deck');
    const sandbox = frame.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('says so plainly when there is no deck, without calling the API', async () => {
    const content = vi.spyOn(api, 'content');

    render(<DeckViewer talk={talk({ files: {} })} />);

    expect(await screen.findByText(/no deck uploaded/i)).toBeInTheDocument();
    expect(content).not.toHaveBeenCalled();
  });

  it('surfaces the API message when the deck cannot be fetched', async () => {
    const { ApiError } = await import('@/api/client');
    vi.spyOn(api, 'content').mockRejectedValue(new ApiError(404, 'This talk has no deck'));

    render(<DeckViewer talk={talk()} />);

    await waitFor(() => expect(screen.getByText('This talk has no deck')).toBeInTheDocument());
  });
});
