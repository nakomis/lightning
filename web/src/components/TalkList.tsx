import { useMemo, useState } from 'react';
import type { Talk } from '@/api/types';

export interface TalkListProps {
  talks: Talk[];
  collections: string[];
  selectedId?: string;
  onSelect: (talk: Talk) => void;
}

/**
 * The talk list, grouped by collection with each group collapsible.
 *
 * Collections come from the API rather than from the talks, so a collection the
 * caller may read but has not filled yet still appears — otherwise there would
 * be nowhere to put the first talk.
 */
export default function TalkList({ talks, collections, selectedId, onSelect }: TalkListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Talk[]>();
    for (const name of collections) map.set(name, []);
    for (const talk of talks) {
      const list = map.get(talk.collection);
      if (list) list.push(talk);
      else map.set(talk.collection, [talk]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.date.localeCompare(a.date));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [talks, collections]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (name: string) => setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  if (grouped.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted">No collections available.</p>;
  }

  return (
    <nav aria-label="Talks" className="flex flex-col gap-1 p-2">
      {grouped.map(([name, items]) => {
        const isCollapsed = collapsed[name] ?? false;
        const regionId = `collection-${name}`;
        return (
          <section key={name}>
            <h2>
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-expanded={!isCollapsed}
                aria-controls={regionId}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold tracking-wide text-muted uppercase hover:bg-raised"
              >
                <span aria-hidden="true" className="text-[0.6rem]">
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <span className="flex-1">{name}</span>
                <span className="tabular-nums text-muted/70">{items.length}</span>
              </button>
            </h2>
            <ul id={regionId} hidden={isCollapsed} className="mt-0.5 mb-2 flex flex-col gap-0.5">
              {items.length === 0 && (
                <li className="px-4 py-1.5 text-sm text-muted italic">Nothing here yet</li>
              )}
              {items.map((talk) => {
                const isSelected = talk.talkId === selectedId;
                return (
                  <li key={talk.talkId}>
                    <button
                      type="button"
                      onClick={() => onSelect(talk)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left text-sm ${
                        isSelected ? 'bg-accent text-accent-ink' : 'hover:bg-raised'
                      }`}
                    >
                      <span className="font-medium">{talk.title}</span>
                      <span
                        className={`text-xs tabular-nums ${
                          isSelected ? 'text-accent-ink/80' : 'text-muted'
                        }`}
                      >
                        {talk.date}
                        {!talk.files?.deck && ' · no deck'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
