import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';
import type { Talk } from '@/api/types';
import ShareButton from '@/components/ShareButton';

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

describe('ShareButton', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('mints a link on click and opens the dialog with it', async () => {
    const user = userEvent.setup();
    const share = vi
      .spyOn(api, 'share')
      .mockResolvedValue({ token: 'abc', url: 'https://l.example/d/abc' });

    render(<ShareButton talk={talk()} />);
    expect(share).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith('t1');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Share link')).toHaveValue('https://l.example/d/abc');
  });

  it('closes the dialog without minting another link', async () => {
    const user = userEvent.setup();
    const share = vi
      .spyOn(api, 'share')
      .mockResolvedValue({ token: 'abc', url: 'https://l.example/d/abc' });

    render(<ShareButton talk={talk()} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('cannot share a talk with no deck, since the link would lead nowhere', () => {
    render(<ShareButton talk={talk({ files: {} })} />);

    const button = screen.getByRole('button', { name: 'Share' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Upload a deck before sharing');
  });

  it('reports a failure to mint rather than opening an empty dialog', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'share').mockRejectedValue(new ApiError(403, 'Requires rw on TDS'));

    render(<ShareButton talk={talk()} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Requires rw on TDS');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to a generic message for a non-API failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'share').mockRejectedValue(new TypeError('Failed to fetch'));

    render(<ShareButton talk={talk()} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create a share link.');
  });
});
