import { useGame } from '../store/game.js';
import { useAuth } from '../store/auth.js';

const PLAYER_COLOR_CSS: Record<string, string> = {
  red:    '#e74c3c',
  blue:   '#3498db',
  green:  '#2ecc71',
  yellow: '#f1c40f',
  orange: '#e67e22',
  purple: '#9b59b6',
};

const WIN_VP = 18;

export function PlayerList(): JSX.Element {
  const view = useGame((s) => s.view);
  const { userId } = useAuth();
  const players = view?.players ?? [];

  if (players.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>waiting for players…</p>;
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
      {[...players].sort((a, b) => b.vp - a.vp).map((p) => {
        const pct = Math.min(100, (p.vp / WIN_VP) * 100);
        const color = PLAYER_COLOR_CSS[p.color] ?? 'var(--fg-dim)';
        const isMe = p.id === userId;
        return (
          <li
            key={p.id}
            style={{
              padding: '8px 10px',
              borderRadius: 4,
              background: p.isActive ? 'var(--accent-soft)' : 'var(--bg-soft)',
              border: `1px solid ${p.isActive ? 'var(--accent)' : isMe ? '#444' : 'transparent'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 999,
                background: color, display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ flex: 1, fontSize: 13 }}>
                {p.displayName}{isMe && <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>(you)</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                {p.vp}/{WIN_VP} vp
              </span>
              {p.isActive && (
                <span style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  ◀
                </span>
              )}
            </div>

            {/* VP progress bar */}
            <div style={{ height: 3, borderRadius: 2, background: 'var(--rule)', marginBottom: 6 }}>
              <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>

            {/* Resources */}
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--fg-dim)' }}>
              {p.wood > 0 && (
                <span title="Wood — trade 2 for +1 VP">
                  🪵 {p.wood}
                </span>
              )}
              {p.stone > 0 && (
                <span title="Stone — trade 2 to leap to any unclaimed tile">
                  🪨 {p.stone}
                </span>
              )}
              {p.wood === 0 && p.stone === 0 && (
                <span style={{ opacity: 0.35 }}>no resources</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
