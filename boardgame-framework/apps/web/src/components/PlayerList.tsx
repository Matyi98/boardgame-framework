import { useGame } from '../store/game.js';

export function PlayerList(): JSX.Element {
  const view = useGame((s) => s.view) as { players?: ReadonlyArray<{ id: string; name: string; color?: string }> } | null;
  const players = view?.players ?? [];
  if (players.length === 0) return <p className="muted" style={{ fontSize: 13 }}>no players yet</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
      {players.map((p) => (
        <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: p.color ?? 'var(--fg-dim)', display: 'inline-block' }} />
          <span>{p.name}</span>
        </li>
      ))}
    </ul>
  );
}
