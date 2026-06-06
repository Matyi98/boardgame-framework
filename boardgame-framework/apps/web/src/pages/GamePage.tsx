import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useGame, type DemoView } from '../store/game.js';
import type { GameBusEvent } from '@bgf/shared-types';
import { useAuth } from '../store/auth.js';
import { Board } from '../components/Board.js';
import { PlayerList } from '../components/PlayerList.js';
import { ResourceBar } from '../components/ResourceBar.js';
import { TradePanel } from '../components/TradePanel.js';

// ── Rules modal ───────────────────────────────────────────────────────────────

function RulesModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div className="panel" style={{ maxWidth: 500, width: '100%', padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Frontier</h2>
          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Territory expansion — 2–4 players, 37 hex tiles.</p>

        <h4 style={{ marginBottom: 8 }}>Core loop</h4>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          Each turn: click an adjacent unclaimed tile to claim it (2 dice roll automatically), then <strong>pass →</strong> to end your turn. You can also trade or build before passing.
        </p>

        <h4 style={{ marginBottom: 10 }}>Terrain</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
          {([
            { label: 'Plains', vp: 1, color: '#3d7244', res: '—' },
            { label: 'Forest', vp: 2, color: '#1a5225', res: '🪵 /claim + /round' },
            { label: 'Mountain', vp: 3, color: '#4a3520', res: '🪨 /claim + /round' },
          ] as const).map((t) => (
            <div key={t.label} style={{ background: t.color, borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ece8df' }}>{t.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f1c40f' }}>{t.vp} vp</span>
              <span style={{ fontSize: 10, color: '#ece8dfaa' }}>{t.res}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 16 }}>
          Forest and Mountain also give you <strong>+1 resource per round</strong> passively (shown in the bar above the board).
        </p>

        <h4 style={{ marginBottom: 8 }}>Dice (2d6)</h4>
        <ul style={{ fontSize: 13, paddingLeft: 18, margin: '0 0 16px', lineHeight: 1.9 }}>
          <li>Roll 2–6: base VP only</li>
          <li>Roll 7–9: +1 bonus VP</li>
          <li>Roll 10–12: +2 bonus VP</li>
        </ul>

        <h4 style={{ marginBottom: 8 }}>Actions on your turn</h4>
        <ul style={{ fontSize: 13, paddingLeft: 18, margin: '0 0 4px', lineHeight: 2 }}>
          <li><strong>🪵×2 → +1 VP</strong> — sell wood for points</li>
          <li><strong>🪨×2 → Leap</strong> — next claim ignores adjacency</li>
          <li><strong>🏰 Fortify</strong> (2🪵+1🪨) — build a fort on your tile → +1 VP every round</li>
          <li><strong>Market</strong> — post a trade offer for other players to accept</li>
        </ul>

        <h4 style={{ marginBottom: 8, marginTop: 16 }}>Market (player trading)</h4>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          On your turn click <em>+ offer</em> in the Market panel. Set what you give and want, then post it.
          Resources are reserved immediately. Any other player can accept on their own turn.
          You can cancel your offer (and reclaim resources) on your turn.
        </p>

        <h4 style={{ marginBottom: 8 }}>Victory</h4>
        <ul style={{ fontSize: 13, paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
          <li>First to <strong>18 VP</strong> wins immediately.</li>
          <li>Board full → highest VP wins. Tie = draw.</li>
        </ul>
      </div>
    </div>
  );
}

// ── Event log ─────────────────────────────────────────────────────────────────

function describeEvent(e: GameBusEvent, view: DemoView | null): string {
  const name = (id: string) => view?.players.find((p) => p.id === id)?.displayName ?? id.slice(0, 6);

  switch (e.type) {
    case 'game-started': return 'Game started';
    case 'tile-claimed': {
      const p = e.payload as { terrain: string; vp: number; claimedBy: string; diceRoll?: number; bonusVp?: number; resource?: string | null };
      const tl: Record<string, string> = { grass: 'plains', forest: 'forest', mountain: 'mountain' };
      const dice = p.diceRoll != null ? ` 🎲${p.diceRoll}` : '';
      const bonus = (p.bonusVp ?? 0) > 0 ? ` ✨+${p.bonusVp}!` : '';
      const res = p.resource === 'wood' ? ' +🪵' : p.resource === 'stone' ? ' +🪨' : '';
      return `${name(p.claimedBy)} claimed ${tl[p.terrain] ?? p.terrain} (+${p.vp}vp${res})${dice}${bonus}`;
    }
    case 'tile-income': {
      const p = e.payload as { wood: number; stone: number };
      const who = e.playerId ? name(e.playerId) : '?';
      const parts = [];
      if (p.wood  > 0) parts.push(`+${p.wood}🪵`);
      if (p.stone > 0) parts.push(`+${p.stone}🪨`);
      return `${who} tile income ${parts.join(' ')}`;
    }
    case 'trade': {
      const p = e.payload as { resource: string; effect: string; amount?: number };
      const who = e.playerId ? name(e.playerId) : '?';
      if (p.effect === 'vp') return `${who} traded 2${p.resource === 'wood' ? '🪵' : '🪨'} → +${p.amount ?? 1}vp`;
      if (p.effect === 'stone-leap') return `${who} used 2🪨 — leap active!`;
      return `${who} traded ${p.resource}`;
    }
    case 'fortify': {
      const who = e.playerId ? name(e.playerId) : '?';
      return `${who} built a fort 🏰`;
    }
    case 'fort-income': {
      const p = e.payload as { vp: number };
      const who = e.playerId ? name(e.playerId) : '?';
      return `🏰 ${who} +${p.vp}vp (fort)`;
    }
    case 'post-offer': {
      const p = e.payload as { offer: { giveWood: number; giveStone: number; wantWood: number; wantStone: number } };
      const who = e.playerId ? name(e.playerId) : '?';
      const g = [p.offer.giveWood > 0 ? `${p.offer.giveWood}🪵` : '', p.offer.giveStone > 0 ? `${p.offer.giveStone}🪨` : ''].filter(Boolean).join(' ');
      const w = [p.offer.wantWood > 0 ? `${p.offer.wantWood}🪵` : '', p.offer.wantStone > 0 ? `${p.offer.wantStone}🪨` : ''].filter(Boolean).join(' ');
      return `${who} offers ${g} for ${w}`;
    }
    case 'accept-offer': {
      const p = e.payload as { offer: { fromPlayerId: string; giveWood: number; giveStone: number; wantWood: number; wantStone: number } };
      const who = e.playerId ? name(e.playerId) : '?';
      return `${who} accepted ${name(p.offer.fromPlayerId)}'s trade offer`;
    }
    case 'cancel-offer': {
      const who = e.playerId ? name(e.playerId) : '?';
      return `${who} cancelled their offer`;
    }
    case 'turn-ended': {
      const p = e.payload as { newActivePlayer: string };
      return `${name(p.newActivePlayer)}'s turn`;
    }
    case 'round-ended': {
      const p = e.payload as { round: number };
      return `— round ${p.round} complete —`;
    }
    case 'game-ended': {
      const p = e.payload as { winner: string | null };
      return p.winner ? `${name(p.winner)} wins! 🎉` : 'Draw!';
    }
    case 'error': {
      const p = e.payload as { message?: string };
      return `⚠ ${p.message ?? 'invalid action'}`;
    }
    default: return e.type;
  }
}

const EVENT_COLOR: Partial<Record<string, string>> = {
  'error':      '#e74c3c',
  'game-ended': '#f1c40f',
  'fort-income': '#7ab0e0',
  'tile-income': '#8fc870',
  'post-offer':  '#c09870',
  'accept-offer': '#2ecc71',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function GamePage(): JSX.Element {
  const { gameId } = useParams<{ gameId: string }>();
  const { connect, disconnect, events, view, send, fetchInit } = useGame();
  const { userId } = useAuth();
  const [showRules, setShowRules]   = useState(false);
  const [fortifyMode, setFortifyMode] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    connect(gameId);
    void fetchInit(gameId);
    return () => disconnect();
  }, [gameId, connect, disconnect, fetchInit]);

  const isMyTurn = !!userId && view?.currentActivePlayer === userId;

  useEffect(() => { if (!isMyTurn) setFortifyMode(false); }, [isMyTurn]);

  function claimTile(tileId: string)   { send('claim-tile', { tileId }); }
  function fortifyTile(tileId: string) { send('fortify', { tileId }); setFortifyMode(false); }
  function endTurn()                   { send('end-turn', {}); }
  function trade(resource: 'wood' | 'stone') { send('trade', { resource }); }

  const me = view?.players.find((p) => p.id === userId);
  const canTradeWood  = isMyTurn && (me?.wood  ?? 0) >= 2;
  const canTradeStone = isMyTurn && (me?.stone ?? 0) >= 2;
  const myFortCount   = Object.values(view?.fortifications ?? {}).filter((o) => o === userId).length;
  const myTileCount   = view?.tiles.filter((t) => t.claimedBy === userId).length ?? 0;
  const canBuildFort  = isMyTurn && (me?.wood ?? 0) >= 2 && (me?.stone ?? 0) >= 1 && myTileCount > myFortCount;

  // ── Winner screen ────────────────────────────────────────────────────────
  if (view?.status === 'ended') {
    const winner = view.players.find((p) => p.id === view.winner);
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🏆</div>
        <h1 style={{ marginBottom: 6 }}>{winner ? `${winner.displayName} wins!` : 'Draw!'}</h1>
        <p className="muted" style={{ marginBottom: 32 }}>{view.winReason}</p>
        <div style={{ display: 'grid', gap: 8, marginBottom: 32, maxWidth: 340, margin: '0 auto 32px' }}>
          {[...view.players].sort((a, b) => b.vp - a.vp).map((p, i) => (
            <div key={p.id} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: i === 0 ? '#f1c40f' : undefined }}>{i === 0 ? '★ ' : `${i + 1}. `}{p.displayName}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{p.vp} vp</span>
            </div>
          ))}
        </div>
        <Link to="/lobby" className="btn">← back to lobby</Link>
      </div>
    );
  }

  // ── Active game ──────────────────────────────────────────────────────────
  return (
    <>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {/* Resource bar — spans full width above the grid */}
      <ResourceBar />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 268px', gap: 24 }}>
        <section>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h2 style={{ margin: 0 }}>Frontier</h2>
              {view && <span className="muted" style={{ fontSize: 12 }}>round {view.round}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {view && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {isMyTurn
                    ? fortifyMode ? '🏰 click a tile to fortify' : '▶ your turn'
                    : `${view.players.find((p) => p.id === view.currentActivePlayer)?.displayName ?? '…'}'s turn`}
                </span>
              )}
              <button className="btn btn--ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setShowRules(true)}>
                ? rules
              </button>
            </div>
          </div>

          <Board
            onClaimTile={isMyTurn && !fortifyMode ? claimTile : undefined}
            onFortifyTile={fortifyMode ? fortifyTile : undefined}
            isMyTurn={isMyTurn}
            fortifyMode={fortifyMode}
          />

          {isMyTurn && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!fortifyMode && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn btn--ghost" onClick={endTurn}>pass →</button>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {view && view.tiles.some((t) => t.claimedBy == null)
                      ? 'click an orange tile to claim — or pass'
                      : 'board full — pass to end turn'}
                  </span>
                </div>
              )}

              {fortifyMode && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn btn--ghost" style={{ borderColor: '#5595d0', color: '#5595d0' }} onClick={() => setFortifyMode(false)}>
                    ✕ cancel
                  </button>
                  <span className="muted" style={{ fontSize: 11 }}>click a blue tile to build (2🪵+1🪨 → +1vp/round)</span>
                </div>
              )}

              {!fortifyMode && (canTradeWood || canTradeStone || canBuildFort) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {canTradeWood && (
                    <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => trade('wood')} title="2 wood → +1 VP">
                      🪵×2 → +1vp
                    </button>
                  )}
                  {canTradeStone && (
                    <button className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => trade('stone')} title="2 stone → leap (ignore adjacency)">
                      🪨×2 → leap
                    </button>
                  )}
                  {canBuildFort && (
                    <button className="btn btn--ghost" style={{ fontSize: 12, borderColor: '#5595d0', color: '#5595d0' }} onClick={() => setFortifyMode(true)} title="2 wood + 1 stone → fort (+1vp/round)">
                      🏰 fortify →
                    </button>
                  )}
                  <span className="muted" style={{ fontSize: 10 }}>{me?.wood ?? 0}🪵 {me?.stone ?? 0}🪨</span>
                </div>
              )}
            </div>
          )}

          {!view && <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>connecting…</p>}
        </section>

        <aside>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>players</h3>
            <span className="muted" style={{ fontSize: 11 }}>goal: 18 vp</span>
          </div>
          <PlayerList />

          <TradePanel isMyTurn={isMyTurn} send={send} />

          <h3 style={{ marginTop: 24, marginBottom: 10 }}>log</h3>
          <div className="panel" style={{ maxHeight: 220, overflow: 'auto', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {events.length === 0
              ? <span className="muted">waiting for events…</span>
              : [...events].reverse().map((e, i) => (
                  <div key={`${e.seq}-${i}`} style={{ lineHeight: 1.5 }}>
                    <span className="muted" style={{ marginRight: 4 }}>[{e.seq}]</span>
                    <span style={{ color: EVENT_COLOR[e.type] ?? 'var(--fg)' }}>
                      {describeEvent(e, view)}
                    </span>
                  </div>
                ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <Link to="/lobby" className="btn btn--ghost" style={{ fontSize: 12 }}>← lobby</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
