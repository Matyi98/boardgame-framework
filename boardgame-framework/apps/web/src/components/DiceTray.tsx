import { useGame } from '../store/game.js';

export function DiceTray(): JSX.Element {
  const send = useGame((s) => s.send);
  return (
    <div className="panel" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>dice</div>
        <div style={{ fontSize: 24, fontFamily: 'var(--font-display)' }}>—</div>
      </div>
      <button className="btn" onClick={() => send('roll-dice', { count: 2 })}>roll</button>
    </div>
  );
}
