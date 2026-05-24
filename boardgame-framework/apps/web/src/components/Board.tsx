/**
 * Renders the game map. Scenario-agnostic by design — wraps a renderer the
 * scenario provides. For the skeleton, a static placeholder hex.
 */
export function Board(): JSX.Element {
  return (
    <div className="panel" style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }}>
      <svg viewBox="-50 -50 100 100" style={{ width: '60%', maxWidth: 240, opacity: 0.6 }} xmlns="http://www.w3.org/2000/svg">
        <polygon
          points="0,-40 34.6,-20 34.6,20 0,40 -34.6,20 -34.6,-20"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="0.6"
        />
        <text x="0" y="5" textAnchor="middle" fontSize="6" fill="var(--fg-dim)" fontFamily="var(--font-mono)">
          board goes here
        </text>
      </svg>
    </div>
  );
}
