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

export function ResourceBar(): JSX.Element | null {
  const view  = useGame((s) => s.view);
  const { userId } = useAuth();

  if (!view || view.players.length === 0) return null;

  // Sort by seat so order is stable across renders
  const players = [...view.players].sort((a, b) => a.seat - b.seat);

  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap',
    }}>
      {players.map((p) => {
        const color   = PLAYER_COLOR_CSS[p.color] ?? 'var(--fg-dim)';
        const isMe    = p.id === userId;
        const isActive = p.id === view.currentActivePlayer;
        const pct     = Math.min(100, (p.vp / WIN_VP) * 100);
        const fortCount = Object.values(view.fortifications ?? {}).filter((oid) => oid === p.id).length;

        return (
          <div
            key={p.id}
            style={{
              flex: '1 1 160px',
              padding: '8px 12px',
              borderRadius: 6,
              background: isActive ? 'var(--accent-soft)' : 'var(--bg-soft)',
              border: `1px solid ${isActive ? 'var(--accent)' : isMe ? '#444' : 'var(--rule)'}`,
              display: 'flex', flexDirection: 'column', gap: 5,
            }}
          >
            {/* Name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: isMe ? 700 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.displayName}{isMe ? ' (you)' : ''}
              </span>
              {isActive && <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>▶</span>}
            </div>

            {/* VP progress bar */}
            <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
            </div>

            {/* Resource chips */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 44 }}>{p.vp}/{WIN_VP}★</span>
              <span style={{ color: p.wood  > 0 ? '#8fc870' : 'var(--fg-dim)', minWidth: 28 }}>🪵{p.wood}</span>
              <span style={{ color: p.stone > 0 ? '#c09870' : 'var(--fg-dim)', minWidth: 28 }}>🪨{p.stone}</span>
              {fortCount > 0 && (
                <span style={{ color: '#7ab0e0', fontSize: 11 }}>🏰×{fortCount}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
