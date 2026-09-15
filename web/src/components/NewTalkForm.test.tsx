import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';
import NewTalkForm from '@/components/NewTalkForm';

describe('NewTalkForm', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('offers no form when the caller may not write anywhere', () => {
    render(<NewTalkForm collections={[]} onCreated={vi.fn()} />);

    expect(screen.getByText(/do not have write access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create talk/i })).not.toBeInTheDocument();
  });

  it('creates a talk and hands it back', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const create = vi.spyOn(api, 'createTalk').mockResolvedValue({
      talk: { talkId: 't9' },
    } as never);

    render(<NewTalkForm collections={['TDS']} onCreated={onCreated} />);
    await user.type(screen.getByRole('textbox'), 'My talk');
    await user.click(screen.getByRole('button', { name: /create talk/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My talk', collection: 'TDS' }),
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ talkId: 't9' }));
  });

  it('shows the API message rather than a generic failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createTalk').mockRejectedValue(new ApiError(403, 'Read-only access to TDS'));

    render(<NewTalkForm collections={['TDS']} onCreated={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'My talk');
    await user.click(screen.getByRole('button', { name: /create talk/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Read-only access to TDS');
  });
});
