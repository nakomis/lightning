import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Talk } from '@/api/types';
import TalkList from '@/components/TalkList';

const talk = (id: string, over: Partial<Talk> = {}): Talk => ({
  talkId: id,
  title: `Talk ${id}`,
  collection: 'TDS',
  date: '2026-01-01',
  createdBy: 'a@b.com',
  createdAt: '2026-01-01T00:00:00Z',
  files: { deck: 'k' },
  ...over,
});

describe('TalkList', () => {
  it('groups by collection and orders newest first', () => {
    render(
      <TalkList
        talks={[
          talk('a', { date: '2026-01-01', title: 'Older' }),
          talk('b', { date: '2026-06-01', title: 'Newer' }),
        ]}
        collections={['TDS']}
        onSelect={vi.fn()}
      />,
    );

    const titles = screen.getAllByRole('button').map((b) => b.textContent);
    expect(titles.findIndex((t) => t?.includes('Newer'))).toBeLessThan(
      titles.findIndex((t) => t?.includes('Older')),
    );
  });

  it('shows a collection the caller may read but has not filled yet', () => {
    // Otherwise there is nowhere to put the first talk.
    render(<TalkList talks={[]} collections={['Personal', 'TDS']} onSelect={vi.fn()} />);

    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing here yet')).toHaveLength(2);
  });

  it('collapses and expands a group', async () => {
    const user = userEvent.setup();
    render(<TalkList talks={[talk('a')]} collections={['TDS']} onSelect={vi.fn()} />);

    const header = screen.getByRole('button', { name: /TDS/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('reports the selected talk to its parent', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TalkList talks={[talk('a')]} collections={['TDS']} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Talk a/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ talkId: 'a' }));
  });

  it('marks a talk with no deck, so an unfinished one is obvious in the list', () => {
    render(
      <TalkList talks={[talk('a', { files: {} })]} collections={['TDS']} onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/no deck/)).toBeInTheDocument();
  });

  it('marks the current selection for assistive technology', () => {
    render(
      <TalkList talks={[talk('a')]} collections={['TDS']} selectedId="a" onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /Talk a/ })).toHaveAttribute('aria-current', 'true');
  });
});
