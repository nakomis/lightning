import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';
import type { Talk } from '@/api/types';
import ShareDialog from '@/components/ShareDialog';
import * as clipboard from '@/lib/clipboard';

const talk: Talk = {
  talkId: 't1',
  title: 'A talk',
  collection: 'TDS',
  date: '2026-08-25',
  createdBy: 'a@b.com',
  createdAt: '2026-08-25T00:00:00Z',
  files: { deck: 'talks/t1/deck/deck.html' },
};

const link = { token: 'AbCdEfGhIjKlMnOpQrStUv', url: 'https://l.example/d/AbCdEfGhIjKlMnOpQrStUv' };

const renderDialog = (onClose = vi.fn()) =>
  render(<ShareDialog talk={talk} link={link} onClose={onClose} />);

describe('ShareDialog', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the link, selected, in a labelled dialog', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Share “A talk”' })).toBeInTheDocument();
    const input = screen.getByLabelText('Share link') as HTMLInputElement;
    expect(input).toHaveValue(link.url);
    expect(input).toHaveAttribute('readonly');
    expect(document.activeElement).toBe(input);
  });

  it('says the link never expires, as the API mints it', () => {
    // share.ts stores no expiry: a token lives until it is revoked.
    renderDialog();

    expect(screen.getByText('Expires').nextElementSibling).toHaveTextContent(
      'Never — it works until you revoke it.',
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('copies the link and says so', async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(clipboard, 'copyText').mockResolvedValue('copied');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(copy).toHaveBeenCalledWith(link.url, screen.getByLabelText('Share link'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByText('Copied to the clipboard.')).toBeInTheDocument();
  });

  it('tells the user how to finish when only the selection fallback worked', async () => {
    const user = userEvent.setup();
    vi.spyOn(clipboard, 'copyText').mockResolvedValue('selected');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(/press Ctrl\+C/)).toBeInTheDocument();
  });

  it('revokes this token on this talk, then shows it as dead', async () => {
    const user = userEvent.setup();
    const revoke = vi.spyOn(api, 'revokeShare').mockResolvedValue(undefined);
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Revoke link' }));

    expect(revoke).toHaveBeenCalledWith('t1', link.token);
    expect(await screen.findByRole('status')).toHaveTextContent(/Revoked/);
    expect(screen.getByText('Revoked', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('reports a failed revoke and leaves the link active', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'revokeShare').mockRejectedValue(new ApiError(404, 'No such token on this talk'));
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No such token on this talk');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke link' })).toBeEnabled();
  });

  it('falls back to a generic message for a non-API failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'revokeShare').mockRejectedValue(new TypeError('Failed to fetch'));
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not revoke the link.');
  });

  it('closes from the button and from Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog(onClose);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
