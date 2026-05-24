export function CardHand(): JSX.Element {
  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="panel"
          style={{
            width: 80,
            height: 110,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--fg-dim)',
            fontSize: 11,
          }}
        >
          card {i}
        </div>
      ))}
    </div>
  );
}
