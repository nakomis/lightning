import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '@/api/client';
import { api } from '@/api/client';
import type { Talk } from '@/api/types';
import UploadPanel from '@/components/UploadPanel';

const talk: Talk = {
  talkId: 't1',
  title: 'A talk',
  collection: 'TDS',
  date: '2026-08-25',
  createdBy: 'a@b.com',
  createdAt: '2026-08-25T00:00:00Z',
  files: {},
};

describe('UploadPanel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('offers no upload controls on a read-only collection', () => {
    render(<UploadPanel talk={talk} canWrite={false} onChanged={vi.fn()} />);

    expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share link/i })).not.toBeInTheDocument();
  });

  it('shows the share URL once one is minted', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'share').mockResolvedValue({
      token: 'abc',
      url: 'https://lightning.example/d/abc',
    });

    render(<UploadPanel talk={talk} canWrite onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /share link/i }));

    expect(await screen.findByText('https://lightning.example/d/abc')).toBeInTheDocument();
  });

  it('uploads a picked file and refreshes the talk', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const upload = vi
      .spyOn(client, 'uploadFile')
      .mockResolvedValue({ key: 'talks/t1/deck/d.html' });

    render(<UploadPanel talk={talk} canWrite onChanged={onChanged} />);

    const input = screen.getByLabelText(/Deck \(HTML\)/);
    await user.upload(input, new File(['<html></html>'], 'd.html', { type: 'text/html' }));

    expect(upload).toHaveBeenCalledWith('t1', 'deck', expect.any(File));
    expect(onChanged).toHaveBeenCalled();
  });

  it('reports an upload failure instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    vi.spyOn(client, 'uploadFile').mockRejectedValue(
      new client.ApiError(403, 'Upload failed (403)'),
    );

    render(<UploadPanel talk={talk} canWrite onChanged={vi.fn()} />);

    const input = screen.getByLabelText(/Deck \(HTML\)/);
    await user.upload(input, new File([''], 'd.html', { type: 'text/html' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Upload failed/);
  });
});
