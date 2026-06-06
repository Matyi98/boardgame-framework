import { useState } from 'react';
import { useGame, type TradeOffer } from '../store/game.js';
import { useAuth } from '../store/auth.js';

const PLAYER_COLOR_CSS: Record<string, string> = {
  red: '#e74c3c', blue: '#3498db', green: '#2ecc71',
  yellow: '#f1c40f', orange: '#e67e22', purple: '#9b59b6',
};

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ value, onChange, max = 9 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const btnStyle: React.CSSProperties = {
    width: 22, height: 22, fontSize: 13, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', border: '1px solid var(--rule)', borderRadius: 3,
    cursor: 'pointer', color: 'var(--fg)', flexShrink: 0,
    padding: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <button style={btnStyle} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span style={{ minWidth: 14, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{value}</span>
      <button style={btnStyle} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

// ── Offer card ────────────────────────────────────────────────────────────────

function OfferCard({ offer, isMyTurn, canAccept, isOwnOffer, onAccept, onCancel }: {
  offer: TradeOffer;
  isMyTurn: boolean;
  canAccept: boolean;
  isOwnOffer: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const view = useGame((s) => s.view);
  const fromPlayer = view?.players.find((p) => p.id === offer.fromPlayerId);
  const color = PLAYER_COLOR_CSS[fromPlayer?.color ?? ''] ?? 'var(--fg-dim)';

  return (
    <div className="panel" style={{ padding: '8px 10px', fontSize: 12 }}>
      {/* Offerer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: color, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>{fromPlayer?.displayName ?? '?'}</span>
        {isOwnOffer && <span style={{ fontSize: 10, color: 'var(--accent)' }}>(you)</span>}
      </div>

      {/* Resources */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>gives</span>
          {offer.giveWood  > 0 && <span style={{ color: '#8fc870' }}>🪵{offer.giveWood}</span>}
          {offer.giveStone > 0 && <span style={{ color: '#c09870' }}>🪨{offer.giveStone}</span>}
        </div>
        <span style={{ color: 'var(--fg-dim)', fontSize: 14 }}>⇄</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>wants</span>
          {offer.wantWood  > 0 && <span style={{ color: '#8fc870' }}>🪵{offer.wantWood}</span>}
          {offer.wantStone > 0 && <span style={{ color: '#c09870' }}>🪨{offer.wantStone}</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        {!isOwnOffer && (
          <button
            className="btn"
            style={{ fontSize: 10, padding: '3px 10px', opacity: canAccept ? 1 : 0.4, cursor: canAccept ? 'pointer' : 'default' }}
            onClick={() => canAccept && onAccept()}
            title={!isMyTurn ? 'Wait for your turn' : !canAccept ? 'Not enough resources' : 'Accept this trade'}
          >
            accept
          </button>
        )}
        {isOwnOffer && isMyTurn && (
          <button className="btn btn--ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={onCancel}>
            cancel
          </button>
        )}
        {isOwnOffer && !isMyTurn && (
          <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>waiting…</span>
        )}
      </div>
    </div>
  );
}

// ── Compose form ──────────────────────────────────────────────────────────────

function ComposeOffer({ me, onPost, onClose }: {
  me: { wood: number; stone: number };
  onPost: (giveWood: number, giveStone: number, wantWood: number, wantStone: number) => void;
  onClose: () => void;
}) {
  const [giveWood,  setGiveWood]  = useState(0);
  const [giveStone, setGiveStone] = useState(0);
  const [wantWood,  setWantWood]  = useState(0);
  const [wantStone, setWantStone] = useState(0);

  const valid = (giveWood + giveStone > 0) && (wantWood + wantStone > 0)
    && giveWood <= me.wood && giveStone <= me.stone;

  return (
    <div className="panel" style={{ padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>new trade offer</div>

      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>I give</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span>🪵</span>
        <Stepper value={giveWood}  onChange={setGiveWood}  max={me.wood} />
        <span>🪨</span>
        <Stepper value={giveStone} onChange={setGiveStone} max={me.stone} />
        <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>have: {me.wood}🪵 {me.stone}🪨</span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>I want</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <span>🪵</span>
        <Stepper value={wantWood}  onChange={setWantWood} />
        <span>🪨</span>
        <Stepper value={wantStone} onChange={setWantStone} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '4px 12px', opacity: valid ? 1 : 0.4 }}
          onClick={() => valid && onPost(giveWood, giveStone, wantWood, wantStone)}
        >
          post offer
        </button>
        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={onClose}>
          cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TradePanelProps {
  isMyTurn: boolean;
  send: (type: string, payload: unknown) => void;
}

export function TradePanel({ isMyTurn, send }: TradePanelProps): JSX.Element {
  const view = useGame((s) => s.view);
  const { userId } = useAuth();
  const [composing, setComposing] = useState(false);

  const offers = view?.tradeOffers ?? [];
  const me = view?.players.find((p) => p.id === userId);

  const myOfferCount = offers.filter((o) => o.fromPlayerId === userId).length;
  const canCompose = isMyTurn && myOfferCount < 3 && ((me?.wood ?? 0) > 0 || (me?.stone ?? 0) > 0);

  function postOffer(giveWood: number, giveStone: number, wantWood: number, wantStone: number) {
    send('post-offer', { giveWood, giveStone, wantWood, wantStone });
    setComposing(false);
  }

  function canAcceptOffer(offer: TradeOffer): boolean {
    if (!isMyTurn || offer.fromPlayerId === userId) return false;
    return (me?.wood ?? 0) >= offer.wantWood && (me?.stone ?? 0) >= offer.wantStone;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>market</h3>
        {canCompose && !composing && (
          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setComposing(true)}>
            + offer
          </button>
        )}
      </div>

      {composing && me && (
        <ComposeOffer
          me={{ wood: me.wood, stone: me.stone }}
          onPost={postOffer}
          onClose={() => setComposing(false)}
        />
      )}

      {offers.length === 0 && !composing && (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {isMyTurn ? 'No offers. Post one with + offer.' : 'No active offers.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            isMyTurn={isMyTurn}
            canAccept={canAcceptOffer(offer)}
            isOwnOffer={offer.fromPlayerId === userId}
            onAccept={() => send('accept-offer', { offerId: offer.id })}
            onCancel={() => send('cancel-offer', { offerId: offer.id })}
          />
        ))}
      </div>
    </div>
  );
}
