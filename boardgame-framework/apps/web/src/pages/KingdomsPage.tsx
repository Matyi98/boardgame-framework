/**
 * KingdomsPage — full page orchestrator for Kingdoms of Dominion.
 *
 * Interaction model:
 *  - Click any tile to select it
 *  - Clicking a non-own tile adjacent to your territory shows attack options
 *  - Clicking own tile shows send-troops / recruit / build / attack options
 *  - Send-troops: select source tile, click "Send Troops", click any own tile as
 *    destination, pick unit counts, confirm
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useKingdomsGame, type LastCombat } from '../games/kingdoms/store/kingdoms-game.js';
import { KingdomsBoard } from '../games/kingdoms/KingdomsBoard.js';
import { ActionPanel } from '../games/kingdoms/ActionPanel.js';
import { MilitaryPanel } from '../games/kingdoms/MilitaryPanel.js';
import { EventLog } from '../games/kingdoms/EventLog.js';
import { useAuth } from '../store/auth.js';
import { KINGDOMS_STRINGS } from '../games/kingdoms/strings.js';
import { playerColor as resolvePlayerColor } from '../games/kingdoms/player-visuals.js';
import { Button, Modal } from '../games/kingdoms/primitives.js';
import { playSound, useSoundSettings } from '../games/kingdoms/sound.js';
import { useAccessibilitySettings } from '../games/kingdoms/settings.js';
import { Tutorial, useTutorialSeen } from '../games/kingdoms/Tutorial.js';
import type { KingdomsView, KingdomsTileView } from '@bgf/game-core';
import '../games/kingdoms/kingdoms.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'idle' | 'attack' | 'attack-select' | 'send-troops';

// ── Tile adjacency (HEX_DIRS for axial) ──────────────────────────────────────

const HEX_DIRS = [
  { q:  1, r:  0 }, { q: -1, r:  0 },
  { q:  0, r:  1 }, { q:  0, r: -1 },
  { q:  1, r: -1 }, { q: -1, r:  1 },
] as const;

// ── Tile adjacency helpers ────────────────────────────────────────────────────

function getNeighbours(view: KingdomsView, tile: KingdomsTileView): KingdomsTileView[] {
  return HEX_DIRS
    .map(({ q, r }) => view.tiles.find((t) => t.q === tile.q + q && t.r === tile.r + r))
    .filter((t): t is KingdomsTileView => t !== undefined);
}

/** Set of all non-own tiles adjacent to the player's territory. */
function computeAttackable(view: KingdomsView, userId: string): Set<string> {
  const result = new Set<string>();
  for (const tile of view.tiles) {
    if (tile.owner !== userId) continue;
    for (const n of getNeighbours(view, tile)) {
      if (n.owner !== userId) result.add(n.id);
    }
  }
  return result;
}

/**
 * Finds the own tile best suited to attack a given target: adjacent own tile
 * with the most eligible attackers that hasn't already attacked this turn.
 * Attacking an unowned tile is the occupation mechanic — a lone Noble is
 * eligible there. Attacking an enemy tile still needs a real combat unit.
 */
function findAttackSource(
  view: KingdomsView,
  targetTile: KingdomsTileView,
  userId: string,
  attackedFrom: readonly string[],
): KingdomsTileView | null {
  const targetIsUnowned = targetTile.owner === null;
  let best: KingdomsTileView | null = null;
  let bestCount = -1;
  for (const n of getNeighbours(view, targetTile)) {
    if (n.owner !== userId) continue;
    if (attackedFrom.includes(n.id)) continue;
    const eligible = n.pieces.filter(
      (p) => p.attack !== null && p.attack > 0 && p.owner === userId && (targetIsUnowned || p.kind !== 'noble'),
    ).length;
    if (eligible > bestCount) { best = n; bestCount = eligible; }
  }
  return bestCount > 0 ? best : null;
}

// ── Resource bar ──────────────────────────────────────────────────────────────

const RES_META: Array<{ key: 'gold' | 'wood' | 'food' | 'iron'; icon: string; label: string; color: string }> = [
  { key: 'gold', icon: '🪙', label: 'Gold', color: '#d4a820' },
  { key: 'wood', icon: '🪵', label: 'Wood', color: '#c07830' },
  { key: 'food', icon: '🌾', label: 'Food', color: '#50b050' },
  { key: 'iron', icon: '⚙️', label: 'Iron', color: '#7090c0' },
];

interface IncomePopup { key: number; gold: number; wood: number; food: number; iron: number }
interface ConvertPopup { key: number; purchased: number; goldSpent: number }

function ResourceBar({ view, userId, incomePopup, convertPopup }: {
  view: KingdomsView;
  userId: string | null;
  incomePopup?: IncomePopup | null;
  convertPopup?: ConvertPopup | null;
}): JSX.Element {
  const me = userId ? view.players.find((p) => p.id === userId) : null;
  if (!me) return <div className="k-resource-bar" />;

  // Ticket #26: the only TRUE blocking condition in the current rules is an
  // empty food stockpile (§10) — a negative per-round foodBalance is just a
  // routine trend (normal early-game) and must never alarm on its own.
  const isFoodBlocked = me.food === 0;

  return (
    <div className="k-resource-bar">
      <span style={{ fontWeight: 700, color: 'var(--fg-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>
        R{view.round}
      </span>
      {RES_META.map(({ key, icon, label }) => {
        const amount = me[key];
        const income = me.incomePreview[key];
        const blocked = key === 'food' && isFoodBlocked;
        // Ticket #37: float the round-end delta right above its chip instead
        // of the number just silently changing between renders.
        const popupDelta = incomePopup?.[key];
        const convertDelta = key === 'food' ? convertPopup?.purchased : key === 'gold' ? convertPopup ? -convertPopup.goldSpent : undefined : undefined;
        return (
          <div
            key={key}
            className="k-resource-bar__item"
            style={{ position: 'relative' }}
            title={KINGDOMS_STRINGS.resourceBar.tooltip(label, amount, income)}
          >
            {(!!popupDelta || !!convertDelta) && (
              <div className="k-income-popup-stack">
                {!!popupDelta && (
                  <span key={incomePopup!.key} className="k-income-popup" style={{ color: '#40b060' }}>+{popupDelta}{icon}</span>
                )}
                {!!convertDelta && (
                  <span key={`c${convertPopup!.key}`} className="k-income-popup" style={{ color: convertDelta > 0 ? '#40b060' : '#e89253' }}>
                    {convertDelta > 0 ? `+${convertDelta}` : convertDelta}{icon}
                  </span>
                )}
              </div>
            )}
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span className="k-resource-bar__amount" style={{ color: blocked ? '#e05050' : 'var(--fg)' }}>
              {amount}
            </span>
            {income !== 0 && (
              <span style={{ fontSize: 9, color: income > 0 ? '#40b060' : 'var(--fg-dim)' }}>
                {income > 0 ? `+${income}` : income}
              </span>
            )}
          </div>
        );
      })}
      {isFoodBlocked && (
        <span style={{ color: '#e05050', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
          {KINGDOMS_STRINGS.resourceBar.foodBlocked}
        </span>
      )}
      <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 10 }}>
        {me.connectedTileCount} tiles
      </span>
    </div>
  );
}

// ── Settings panel (ticket #43) ──────────────────────────────────────────────
//
// No colorblind-palette toggle here: ticket #8 made the colorblind-safe
// blue/orange/teal/magenta palette + ownership patterns THE palette, not a
// switchable alternative — there's no second palette to toggle to, so a
// fake "enable colorblind mode" checkbox would do nothing and be worse than
// not having one. Said so explicitly below instead of a no-op control.

function SettingsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const { muted, volume, toggleMute, setVolume } = useSoundSettings();
  const { reduceMotion, toggleReduceMotion } = useAccessibilitySettings();

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="k-modal__section">
        <div className="k-modal__section-title">Audio</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={muted} onChange={toggleMute} />
          Mute all sound
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: muted ? 0.5 : 1 }}>
          Volume
          <input
            type="range" min={0} max={1} step={0.05} value={volume} disabled={muted}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </label>
      </div>
      <div className="k-modal__section">
        <div className="k-modal__section-title">Accessibility</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={reduceMotion} onChange={toggleReduceMotion} />
          Reduce motion (disables animations and transitions)
        </label>
        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.8 }}>
          Player colors (blue/orange/teal/magenta) and ownership-ring patterns are colorblind-safe by default — there's no separate mode to turn on.
        </div>
      </div>
    </Modal>
  );
}

// ── Mute toggle (ticket #40) ─────────────────────────────────────────────────

function MuteToggle(): JSX.Element {
  const { muted, toggleMute } = useSoundSettings();
  return (
    <button
      onClick={toggleMute}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Unmute sound' : 'Mute sound'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 14, color: 'var(--fg-dim)', padding: 2, lineHeight: 1,
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

// ── Turn indicator ────────────────────────────────────────────────────────────

function TurnIndicator({ view, userId }: { view: KingdomsView; userId: string | null }): JSX.Element {
  const isMyTurn = !!userId && view.currentActivePlayer === userId;
  const currentPlayer = view.players.find((p) => p.id === view.currentActivePlayer);
  const playerColor = currentPlayer ? resolvePlayerColor(currentPlayer.color) : 'var(--fg)';

  if (isMyTurn) {
    // Ticket #34: §3 limits one attack per turn regardless of source tile —
    // this used to only surface as a contextual message when a relevant
    // tile happened to be selected, so the limit was invisible the rest of
    // the time despite being fully enforced server-side.
    const attackUsed = view.turnState.attackedFrom.length > 0;
    return (
      // Ticket #39: key forces a remount exactly when it becomes my turn
      // (currentActivePlayer changing) so the slide-in plays once per
      // hand-off instead of replaying on every unrelated re-render.
      <div className="k-turn-indicator k-turn-indicator--mine" key={view.currentActivePlayer} style={{ animation: 'k-turn-banner 0.35s ease-out both' }}>
        {KINGDOMS_STRINGS.turn.yours}
        {/* Ticket #61: red/green alone is a colorblind risk — ⊘/✓ carry the
            same meaning without relying on hue. */}
        <span
          style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: attackUsed ? '#e05050' : '#40b060', opacity: 0.85 }}
          title={attackUsed ? 'You\'ve used your one attack this turn' : 'You can still attack this turn'}
        >
          ⚔ {attackUsed ? '⊘ attack used' : '✓ attack available'}
        </span>
      </div>
    );
  }

  return (
    <div className="k-turn-indicator k-turn-indicator--other">
      <span style={{ color: playerColor }}>{currentPlayer?.displayName ?? '…'}</span>
      <span style={{ marginLeft: 6, fontSize: 10 }}>{KINGDOMS_STRINGS.turn.isPlaying}</span>
    </div>
  );
}

// ── Player scoreboard ─────────────────────────────────────────────────────────

function PlayerScoreboard({ view, userId }: { view: KingdomsView; userId: string | null }): JSX.Element {
  const sorted = [...view.players].sort((a, b) => a.seat - b.seat);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map((p) => {
        const color = resolvePlayerColor(p.color);
        const isMe = p.id === userId;
        // Ticket #30: foreshadow elimination — find this player's capital
        // and check whether it's currently under loyalty siege (§8: losing
        // the capital eliminates the player on the spot).
        const capitalTile = !p.isEliminated
          ? view.tiles.find((t) => t.owner === p.id && t.pieces.some((piece) => piece.kind === 'capital-base'))
          : undefined;
        const capitalSiege = capitalTile ? view.turnState.tileLoyalty[capitalTile.id] : undefined;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 9px', borderRadius: 6,
              background: p.isActive
                ? 'linear-gradient(180deg, rgba(217,126,58,0.16), rgba(217,126,58,0.05))'
                : 'var(--bg)',
              border: `1px solid ${p.isActive ? 'var(--accent)' : 'var(--rule)'}`,
              boxShadow: p.isActive ? '0 0 10px rgba(217,126,58,0.25)' : 'none',
              opacity: p.isEliminated ? 0.45 : 1, fontSize: 11,
              transition: 'background 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <span
              style={{
                width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0, display: 'inline-block',
                boxShadow: `0 0 6px ${color}aa`,
              }}
            />
            <span style={{ flex: 1, fontWeight: isMe ? 700 : 400 }}>
              {p.displayName}
              {isMe && <span style={{ color: 'var(--fg-dim)', marginLeft: 4, fontSize: 10 }}>(you)</span>}
              {p.isEliminated && <span style={{ color: '#e05050', marginLeft: 4, fontSize: 10 }}>out</span>}
              {capitalSiege && (
                <span
                  style={{ color: '#e05050', marginLeft: 4, fontSize: 9, fontWeight: 700, animation: 'k-dot-pulse 1.3s ease-in-out infinite' }}
                  title={`Capital under siege — ${100 - capitalSiege.loyalty}% captured`}
                >
                  ⚠ capital threatened
                </span>
              )}
            </span>
            <span style={{ color: 'var(--fg-dim)' }}>{p.connectedTileCount}t</span>
            {p.isActive && <span style={{ color: 'var(--accent)', fontSize: 10 }}>◀</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Winner screen ─────────────────────────────────────────────────────────────

function WinnerScreen({ view, userId }: { view: KingdomsView; userId: string | null }): JSX.Element {
  const winner = view.players.find((p) => p.id === view.winner);
  const sorted = [...view.players].sort((a, b) => b.connectedTileCount - a.connectedTileCount);
  // Ticket #46: every player used to see the literal same "{winner} wins!"
  // text — win, loss, and draw all read identically except for the name.
  const isWinner = !!winner && winner.id === userId;
  const isDraw = !winner;
  return (
    <div className="k-winner-overlay">
      <div className="k-winner-overlay__content">
        <div style={{ fontSize: 56, marginBottom: 16, textAlign: 'center' }}>
          {isDraw ? '⚖' : isWinner ? '🏆' : '♛'}
        </div>
        <h1 style={{ textAlign: 'center', fontFamily: 'var(--font-display)', marginBottom: 8, color: isDraw ? undefined : isWinner ? '#d4a820' : undefined }}>
          {isDraw
            ? KINGDOMS_STRINGS.winner.draw
            : isWinner
              ? 'Victory! You are the last kingdom standing.'
              : `Defeated — ${KINGDOMS_STRINGS.winner.wins(winner!.displayName)}`}
        </h1>
        {view.winReason && (
          <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 24 }}>{view.winReason}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
          {sorted.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--rule)', borderRadius: 4 }}>
              <span style={{ color: i === 0 ? '#d4a820' : 'var(--fg)' }}>
                {i === 0 ? '★ ' : `${i + 1}. `}{p.displayName}
                {p.isEliminated && <span style={{ color: '#e05050', fontSize: 10, marginLeft: 6 }}>(eliminated)</span>}
              </span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{p.connectedTileCount} tiles</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Link to="/lobby" className="btn">← back to lobby</Link>
        </div>
      </div>
    </div>
  );
}

// ── Combat overlay ────────────────────────────────────────────────────────────
//
// The big centered, backdrop-blurred card is only relevant to the two players
// who actually fought — showing it to every other player in the game (who
// have nothing to do with this battle) interrupts whatever they're doing.
// Everyone else gets a small, non-blocking corner notification instead.

function CombatOverlay({ lastCombat, onDismiss }: { lastCombat: LastCombat; onDismiss: () => void }): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDismiss]);

  return (
    <div className="k-combat-overlay">
      <div className="k-combat-overlay__card">
        <button className="k-combat-overlay__dismiss" onClick={onDismiss} aria-label="dismiss">x</button>
        <div className={`k-combat-overlay__title ${lastCombat.attackerWins ? 'k-combat-overlay__title--win' : 'k-combat-overlay__title--lose'}`}>
          {lastCombat.attackerWins ? '⚔ Attacker Wins!' : '⚔ Defender Holds!'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.8 }}>
          <div>Attacker STR: {lastCombat.attackerStrength.toFixed(1)} | Defender STR: {lastCombat.defenderStrength.toFixed(1)}</div>
          <div>Casualties: {lastCombat.attackerCasualties} attackers, {lastCombat.defenderCasualties} defenders</div>
        </div>
      </div>
    </div>
  );
}

function CombatToast({
  lastCombat,
  view,
  onDismiss,
}: {
  lastCombat: LastCombat;
  view: KingdomsView;
  onDismiss: () => void;
}): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 4200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDismiss]);

  const attackerName = view.players.find((p) => p.id === lastCombat.attackerId)?.displayName ?? 'Someone';
  const defenderName = lastCombat.defenderId
    ? view.players.find((p) => p.id === lastCombat.defenderId)?.displayName ?? 'a player'
    : null;
  const verb = lastCombat.attackerWins ? KINGDOMS_STRINGS.combatToast.won : KINGDOMS_STRINGS.combatToast.repelled;
  const target = defenderName ? KINGDOMS_STRINGS.combatToast.enemyTarget(defenderName) : KINGDOMS_STRINGS.combatToast.unownedTarget;

  return (
    <div className="k-combat-toast" key={`${lastCombat.fromTileId}-${lastCombat.toTileId}`}>
      <span>⚔</span>
      <span>{attackerName} {verb} {target}</span>
      <button className="k-error-toast__close" onClick={onDismiss} aria-label="dismiss">×</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function KingdomsPage(): JSX.Element {
  const { gameId } = useParams<{ gameId: string }>();
  const { connect, disconnect, events, view, send, fetchInit, tileEffects, lastCombat, clearLastCombat, addTileEffect, connectionStatus } = useKingdomsGame();
  const { userId } = useAuth();
  const { reduceMotion } = useAccessibilitySettings();

  // ── Interaction state ──────────────────────────────────────────────────
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('idle');

  // Attack mode: source tile, then (once a target is picked) staged for unit selection
  const [attackingFromTileId, setAttackingFromTileId] = useState<string | null>(null);
  const [attackToTileId, setAttackToTileId] = useState<string | null>(null);
  // unitId → selected for the attack force
  const [attackUnitIds, setAttackUnitIds] = useState<Record<string, boolean>>({});

  // Send-troops mode: source tile selected, waiting for destination
  const [sendFromTileId, setSendFromTileId] = useState<string | null>(null);
  const [sendToTileId, setSendToTileId] = useState<string | null>(null);
  // unitId → selected count to send (0 = not sending)
  const [sendCounts, setSendCounts] = useState<Record<string, number>>({});

  // ── Connect / disconnect ───────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return;
    connect(gameId);
    void fetchInit(gameId);
    return () => disconnect();
  }, [gameId, connect, disconnect, fetchInit]);

  // Ticket #47: an invalid gameId or a server hiccup left the spinner
  // running forever with no escape — fetchInit silently swallows its error
  // on the assumption the game-started WS event is just running late, which
  // isn't true if the game genuinely doesn't exist.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (view) { setLoadTimedOut(false); return; }
    const t = setTimeout(() => setLoadTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [view, gameId]);

  const myCapitalTileId = (view && userId) ? (view.players.find((p) => p.id === userId)?.capitalTileId ?? null) : null;

  const resetInteraction = useCallback(() => {
    setMode('idle');
    setSelectedTileId(myCapitalTileId);
    setAttackingFromTileId(null);
    setAttackToTileId(null);
    setAttackUnitIds({});
    setSendFromTileId(null);
    setSendToTileId(null);
    setSendCounts({});
  }, [myCapitalTileId]);

  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (lastEvent?.type === 'game-started') resetInteraction();
  }, [events, resetInteraction]);

  // ── Error toast — surfaces validation failures (e.g. "not enough gold")
  // that previously vanished silently once the event log panel was removed.
  const [errorToast, setErrorToast] = useState<{ key: number; message: string } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { hasSeenTutorial } = useTutorialSeen();
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    if (view && !hasSeenTutorial) setShowTutorial(true);
  }, [view, hasSeenTutorial]);
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (lastEvent?.type === 'error') {
      const message = (lastEvent.payload as { message?: string } | undefined)?.message ?? 'Action failed';
      setErrorToast({ key: Date.now(), message });
      playSound('error');
    }
  }, [events]);
  useEffect(() => {
    if (!errorToast) return;
    const t = setTimeout(() => setErrorToast(null), 4200);
    return () => clearTimeout(t);
  }, [errorToast]);

  // ── Round-end economy juice (ticket #37) — the once-per-round payout
  // (§10) previously updated resource numbers with zero feedback. Floats
  // the income/conversion delta near the resource bar and briefly flashes
  // every tile that's currently producing for this player, reusing the
  // 'built' tile-effect kind from ticket #35.
  const [incomePopup, setIncomePopup] = useState<{ key: number; gold: number; wood: number; food: number; iron: number } | null>(null);
  const [convertPopup, setConvertPopup] = useState<{ key: number; purchased: number; goldSpent: number } | null>(null);
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (!lastEvent) return;

    // Bug fix: round-ended carries no playerId at all (it's a global,
    // once-per-round marker, not tied to any one player's action), so
    // gating this whole branch on `playerId === userId` meant it could
    // never fire — moved out of the player-scoped checks below.
    if (lastEvent.type === 'round-ended') {
      playSound('roundTick');
      if (view && userId) {
        for (const tile of view.tiles) {
          if (tile.owner === userId && tile.incomePreview !== null) addTileEffect(tile.id, 'built');
        }
      }
      return;
    }

    if (lastEvent.playerId !== userId) return;
    if (lastEvent.type === 'income-collected') {
      const p = lastEvent.payload as { gold: number; wood: number; food: number; iron: number };
      if (p.gold || p.wood || p.food || p.iron) setIncomePopup({ key: Date.now(), ...p });
    }
    if (lastEvent.type === 'food-purchased') {
      const p = lastEvent.payload as { purchased: number; goldSpent: number };
      setConvertPopup({ key: Date.now(), ...p });
    }
    if (lastEvent.type === 'tile-captured') {
      playSound('capture');
    }
  }, [events, userId, view, addTileEffect]);
  useEffect(() => {
    if (!incomePopup) return;
    const t = setTimeout(() => setIncomePopup(null), 1500);
    return () => clearTimeout(t);
  }, [incomePopup]);
  useEffect(() => {
    if (!convertPopup) return;
    const t = setTimeout(() => setConvertPopup(null), 1800);
    return () => clearTimeout(t);
  }, [convertPopup]);

  // ── Elimination banner (ticket #38) — a capital falling had literally no
  // visible feedback before this: no toast, no banner, nothing — the only
  // trace was a line in the (also newly-built) event log. Shown to everyone,
  // not just the eliminated player, since it's a public, game-shaping event.
  const [eliminationBanner, setEliminationBanner] = useState<{ key: number; eliminatedName: string; byName: string } | null>(null);
  // Ticket #46: the public banner above is brief and non-blocking, correctly
  // so for everyone watching — but the specific player it just happened to
  // gets nothing more deliberate than that, despite their interactive role
  // in the game having just ended. This is a distinct, not-auto-dismissing
  // acknowledgment for that one player.
  const [showEliminatedSelf, setShowEliminatedSelf] = useState<{ byName: string } | null>(null);
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (lastEvent?.type !== 'player-eliminated' || !view) return;
    const p = lastEvent.payload as { eliminatedPlayerId: string; byPlayerId: string };
    const byName = view.players.find((pl) => pl.id === p.byPlayerId)?.displayName ?? 'a rival';
    setEliminationBanner({
      key: Date.now(),
      eliminatedName: view.players.find((pl) => pl.id === p.eliminatedPlayerId)?.displayName ?? 'A kingdom',
      byName,
    });
    if (p.eliminatedPlayerId === userId) setShowEliminatedSelf({ byName });
  }, [events, view, userId]);
  useEffect(() => {
    if (!eliminationBanner) return;
    const t = setTimeout(() => setEliminationBanner(null), 4000);
    return () => clearTimeout(t);
  }, [eliminationBanner]);

  // Victory fanfare — fires once on the status transition into 'ended',
  // not on every re-render while the winner screen stays mounted.
  const hasPlayedVictorySound = useRef(false);
  useEffect(() => {
    if (view?.status === 'ended' && !hasPlayedVictorySound.current) {
      hasPlayedVictorySound.current = true;
      playSound('victory');
    }
  }, [view?.status]);

  // Once the view first loads, default the selection to the player's capital
  // so recruit/build options are visible without having to find the tile on the map.
  const hasAutoSelectedCapital = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedCapital.current && myCapitalTileId && selectedTileId === null) {
      setSelectedTileId(myCapitalTileId);
      hasAutoSelectedCapital.current = true;
    }
  }, [myCapitalTileId, selectedTileId]);

  // ── Derived data ───────────────────────────────────────────────────────
  const isMyTurn = !!userId && !!view && view.currentActivePlayer === userId;

  const selectedTile: KingdomsTileView | null = view?.tiles.find((t) => t.id === selectedTileId) ?? null;
  const sendFromTile: KingdomsTileView | null = view?.tiles.find((t) => t.id === sendFromTileId) ?? null;
  const sendToTile: KingdomsTileView | null   = view?.tiles.find((t) => t.id === sendToTileId) ?? null;
  const attackFromTile: KingdomsTileView | null = view?.tiles.find((t) => t.id === attackingFromTileId) ?? null;
  const attackToTile: KingdomsTileView | null   = view?.tiles.find((t) => t.id === attackToTileId) ?? null;

  // All non-own tiles adjacent to player territory (potential attack targets)
  const attackableTiles: Set<string> = (!view || !userId) ? new Set() : computeAttackable(view, userId);

  // Whether the selected non-own tile borders the player's territory at all
  // (used to explain why no attack button shows, instead of nothing)
  const isAdjacentToTerritory = !!selectedTile && selectedTile.owner !== userId && attackableTiles.has(selectedTile.id);

  // When a non-own tile is selected, auto-find which own tile to attack from
  const attackSourceTile: KingdomsTileView | null = (() => {
    if (!view || !userId || !selectedTile || selectedTile.owner === userId) return null;
    if (!attackableTiles.has(selectedTile.id)) return null;
    return findAttackSource(view, selectedTile, userId, view.turnState.attackedFrom);
  })();

  // In attack mode: tiles that can be attacked FROM the current origin
  const attackTargetTiles: Set<string> = (() => {
    if (mode !== 'attack' || !attackingFromTileId || !view || !userId) return new Set<string>();
    const from = view.tiles.find((t) => t.id === attackingFromTileId);
    if (!from) return new Set<string>();
    const result = new Set<string>();
    for (const n of getNeighbours(view, from)) {
      if (n.owner !== userId) result.add(n.id);
    }
    return result;
  })();

  // Send-troops mode: all own tiles except source (waiting for destination click)
  const reachableTiles: Set<string> = (() => {
    if (!view || !userId) return new Set<string>();
    if (mode === 'send-troops' && sendFromTileId && !sendToTileId) {
      return new Set(view.tiles.filter((t) => t.owner === userId && t.id !== sendFromTileId).map((t) => t.id));
    }
    return new Set<string>();
  })();

  // ── Action handlers ────────────────────────────────────────────────────

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (!view) return;

      // Attack mode: click target to stage unit selection (does not fire yet)
      if (mode === 'attack' && attackingFromTileId) {
        if (attackTargetTiles.has(tileId)) {
          const fromTile = view.tiles.find((t) => t.id === attackingFromTileId);
          const targetTile = view.tiles.find((t) => t.id === tileId);
          const targetIsUnowned = targetTile?.owner === null;
          const initial: Record<string, boolean> = {};
          for (const p of fromTile?.pieces ?? []) {
            if (p.owner === userId && p.attack !== null) initial[p.id] = targetIsUnowned || p.kind !== 'noble';
          }
          setAttackUnitIds(initial);
          setAttackToTileId(tileId);
          setMode('attack-select');
        } else {
          // Clicked outside targets → cancel
          setErrorToast({ key: Date.now(), message: KINGDOMS_STRINGS.cancellation.attackInvalidTarget });
          setMode('idle');
          setAttackingFromTileId(null);
        }
        return;
      }

      // Send-troops mode: waiting for destination tile
      if (mode === 'send-troops' && sendFromTileId && !sendToTileId) {
        const tile = view.tiles.find((t) => t.id === tileId);
        if (tile?.owner === userId && tileId !== sendFromTileId) {
          // Destination selected → show count panel
          setSendToTileId(tileId);
          // Pre-fill counts: all movable units default to 0 (user picks)
          const fromTile = view.tiles.find((t) => t.id === sendFromTileId);
          const movable = (fromTile?.pieces ?? []).filter(
            (p) => p.attack !== null && !view.turnState.movedThisTurn.includes(p.id),
          );
          const initial: Record<string, number> = {};
          for (const p of movable) initial[p.id] = 0;
          setSendCounts(initial);
        } else {
          // Clicked non-own or same tile → cancel, but say so instead of silently resetting
          setErrorToast({ key: Date.now(), message: KINGDOMS_STRINGS.cancellation.sendTroopsInvalidDestination });
          resetInteraction();
        }
        return;
      }

      // Idle: toggle selection
      setSelectedTileId(tileId === selectedTileId ? null : tileId);
      setSendToTileId(null);
      setSendCounts({});
      if (mode !== 'send-troops') setMode('idle');
    },
    [
      view, mode, attackingFromTileId, attackTargetTiles, sendFromTileId, sendToTileId,
      selectedTileId, userId, send, resetInteraction,
    ],
  );

  const handleEndTurn = useCallback(() => {
    playSound('click');
    send('end-turn', {});
    resetInteraction();
  }, [send, resetInteraction]);

  // Attack FROM a specific source tile (target selected separately on map)
  const handleStartAttackFromTile = useCallback((fromTileId: string) => {
    setAttackingFromTileId(fromTileId);
    setMode('attack');
    setSelectedTileId(null);
  }, []);

  // Attack from auto-picked source + clicked target → stage unit selection
  const handleAttackTarget = useCallback((fromTileId: string, toTileId: string) => {
    if (!view) return;
    const fromTile = view.tiles.find((t) => t.id === fromTileId);
    const targetTile = view.tiles.find((t) => t.id === toTileId);
    const targetIsUnowned = targetTile?.owner === null;
    const initial: Record<string, boolean> = {};
    for (const p of fromTile?.pieces ?? []) {
      if (p.owner === userId && p.attack !== null) initial[p.id] = targetIsUnowned || p.kind !== 'noble';
    }
    setAttackingFromTileId(fromTileId);
    setAttackToTileId(toTileId);
    setAttackUnitIds(initial);
    setMode('attack-select');
    setSelectedTileId(null);
  }, [view, userId]);

  // Adjust how many units of one kind join the staged attack (+1/-1 per click)
  const handleAttackUnitCountChange = useCallback((kind: string, delta: number) => {
    if (!attackFromTile) return;
    const ids = attackFromTile.pieces
      .filter((p) => p.kind === kind && p.owner === userId && p.attack !== null)
      .map((p) => p.id);
    setAttackUnitIds((prev) => {
      const next = { ...prev };
      if (delta > 0) {
        for (const id of ids.filter((id) => !next[id]).slice(0, delta)) next[id] = true;
      } else if (delta < 0) {
        for (const id of ids.filter((id) => next[id]).slice(0, -delta)) next[id] = false;
      }
      return next;
    });
  }, [attackFromTile, userId]);

  const handleConfirmAttack = useCallback(() => {
    if (!attackingFromTileId || !attackToTileId) return;
    const unitIds = Object.entries(attackUnitIds).filter(([, v]) => v).map(([id]) => id);
    playSound('attack');
    send('attack-tile', { fromTileId: attackingFromTileId, toTileId: attackToTileId, unitIds });
    resetInteraction();
  }, [attackingFromTileId, attackToTileId, attackUnitIds, send, resetInteraction]);

  const handleCancelAttack = useCallback(() => {
    resetInteraction();
  }, [resetInteraction]);

  // Enter send-troops mode from an own tile
  const handleStartSendTroops = useCallback((fromTileId: string) => {
    setSendFromTileId(fromTileId);
    setSendToTileId(null);
    setSendCounts({});
    setMode('send-troops');
    setSelectedTileId(fromTileId);
  }, []);

  // Adjust how many units of one kind are staged to send (+1/-1 per click)
  const handleSendUnitCountChange = useCallback((kind: string, delta: number) => {
    if (!sendFromTile) return;
    const ids = sendFromTile.pieces
      .filter((p) => p.kind === kind && p.owner === userId && p.attack !== null)
      .map((p) => p.id);
    setSendCounts((prev) => {
      const next = { ...prev };
      if (delta > 0) {
        for (const id of ids.filter((id) => !(next[id] > 0)).slice(0, delta)) next[id] = 1;
      } else if (delta < 0) {
        for (const id of ids.filter((id) => next[id] > 0).slice(0, -delta)) next[id] = 0;
      }
      return next;
    });
  }, [sendFromTile, userId]);

  // Confirm sending troops: loop move-unit for each selected unit
  const handleConfirmSend = useCallback(() => {
    if (!sendFromTileId || !sendToTileId) return;
    playSound('click');
    for (const [pieceId, count] of Object.entries(sendCounts)) {
      if (count > 0) {
        send('move-unit', { pieceId, targetTileId: sendToTileId });
      }
    }
    resetInteraction();
  }, [sendFromTileId, sendToTileId, sendCounts, send, resetInteraction]);

  const handleCancelSend = useCallback(() => {
    resetInteraction();
  }, [resetInteraction]);

  const handleRecruit = useCallback((unitKind: string) => {
    if (!selectedTileId) return;
    playSound('recruit');
    send('recruit-unit', { tileId: selectedTileId, unitKind });
  }, [selectedTileId, send]);

  const handleBuild = useCallback((structureKind: string) => {
    if (!selectedTileId) return;
    playSound('build');
    send('build-structure', { tileId: selectedTileId, structureKind });
  }, [selectedTileId, send]);

  const handleDemolish = useCallback((structureKind: string) => {
    if (!selectedTileId) return;
    playSound('click');
    send('demolish-structure', { tileId: selectedTileId, structureKind });
  }, [selectedTileId, send]);

  const handleDevelop = useCallback(() => {
    if (!selectedTileId) return;
    playSound('build');
    send('develop-tile', { tileId: selectedTileId });
  }, [selectedTileId, send]);

  const handleCancel = useCallback(() => resetInteraction(), [resetInteraction]);

  // Ticket #47: a dropped connection used to look identical to a frozen,
  // working game — no banner, no retry indication, nothing.
  const connectionBanner = connectionStatus !== 'connected' && (
    <div className="k-connection-banner">
      {connectionStatus === 'reconnecting' ? '⏳ Reconnecting…' : '⚠ Disconnected — attempting to reconnect…'}
    </div>
  );

  // ── Loading state ──────────────────────────────────────────────────────
  if (!view) {
    return (
      <div className="k-app-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>
        {connectionBanner}
        {loadTimedOut ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
            <p style={{ color: 'var(--fg-dim)', marginBottom: 16 }}>
              This game didn't load. It may not exist anymore, or the server may be unavailable.
            </p>
            <Link to="/lobby" className="btn">← back to lobby</Link>
          </>
        ) : (
          <>
            <div className="k-spinner" />
            <p style={{ color: 'var(--fg-dim)' }}>
              {connectionStatus === 'reconnecting' ? 'reconnecting…' : KINGDOMS_STRINGS.loading.connecting}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Attack preview tile ────────────────────────────────────────────────
  const attackPreviewTile =
    mode === 'attack-select' && attackToTile
      ? attackToTile
      : mode === 'attack' && selectedTileId && attackTargetTiles.has(selectedTileId)
        ? (view.tiles.find((t) => t.id === selectedTileId) ?? null)
        : null;

  const attackOriginTile =
    (mode === 'attack' || mode === 'attack-select') && attackingFromTileId
      ? (view.tiles.find((t) => t.id === attackingFromTileId) ?? null)
      : selectedTile;

  // Board mode for highlighting
  const boardMode: 'idle' | 'move' | 'attack' | 'recruit' | 'build' =
    (mode === 'attack' || mode === 'attack-select') ? 'attack'
    : (mode === 'send-troops' && !sendToTileId) ? 'move'
    : 'idle';

  return (
    <div className={`k-app-root${reduceMotion ? ' k-reduce-motion' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
      {connectionBanner}
      <ResourceBar view={view} userId={userId} incomePopup={incomePopup} convertPopup={convertPopup} />

      <div className="k-game-layout">
        {/* ── Board panel ── */}
        <div style={{ background: '#0a0e12', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid var(--rule)', background: 'var(--bg-soft)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>Kingdoms of Dominion</span>
              <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>round {view.round}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => setShowTutorial(true)}
                aria-label="Replay tutorial"
                title="Replay tutorial"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--fg-dim)', padding: 2, lineHeight: 1 }}
              >
                🎓
              </button>
              <button
                onClick={() => setShowRules(true)}
                aria-label="How to play"
                title="How to play"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--fg-dim)', padding: 2, lineHeight: 1 }}
              >
                ❓
              </button>
              <button
                onClick={() => setShowSettings(true)}
                aria-label="Settings"
                title="Settings"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--fg-dim)', padding: 2, lineHeight: 1 }}
              >
                ⚙
              </button>
              <MuteToggle />
              <Link to="/lobby" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>← lobby</Link>
            </div>
          </div>

          <div className="k-board-wrapper" style={{ flex: 1, margin: '8px', padding: '10px' }}>
            <KingdomsBoard
              tiles={view.tiles}
              players={view.players}
              turnState={view.turnState}
              userId={userId}
              mode={boardMode}
              selectedTileId={selectedTileId}
              reachableTiles={reachableTiles}
              attackableTiles={mode === 'attack' ? attackTargetTiles : attackableTiles}
              tileEffects={tileEffects}
              onTileClick={handleTileClick}
            />
          </div>

          <div style={{ padding: '6px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 16, fontSize: 10, color: 'var(--fg-dim)', flexWrap: 'wrap', flexShrink: 0 }}>
            <span>{KINGDOMS_STRINGS.legend.units}</span>
            <span>{KINGDOMS_STRINGS.legend.structures}</span>
            <span>{KINGDOMS_STRINGS.legend.loyaltyRule}</span>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="k-game-sidebar" style={{ background: 'var(--bg-soft)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--rule)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            <TurnIndicator view={view} userId={userId} />
            <div style={{ marginTop: 8 }}>
              <PlayerScoreboard view={view} userId={userId} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ActionPanel
              view={view}
              userId={userId}
              selectedTile={selectedTile}
              mode={mode}
              attackSourceTile={attackSourceTile}
              isAdjacentToTerritory={isAdjacentToTerritory}
              attackFromTile={attackFromTile}
              attackToTile={attackToTile}
              attackUnitIds={attackUnitIds}
              onAttackUnitCountChange={handleAttackUnitCountChange}
              onConfirmAttack={handleConfirmAttack}
              onCancelAttack={handleCancelAttack}
              sendFromTile={sendFromTile}
              sendToTile={sendToTile}
              sendCounts={sendCounts}
              onSendUnitCountChange={handleSendUnitCountChange}
              onStartAttackFromTile={handleStartAttackFromTile}
              onAttackTarget={handleAttackTarget}
              onStartSendTroops={handleStartSendTroops}
              onConfirmSend={handleConfirmSend}
              onCancelSend={handleCancelSend}
              onRecruit={handleRecruit}
              onBuild={handleBuild}
              onDemolish={handleDemolish}
              onDevelop={handleDevelop}
              onCancel={handleCancel}
            />

            <MilitaryPanel
              selectedTile={attackOriginTile}
              attackingTile={attackPreviewTile}
              players={view.players}
              view={view}
              attackUnitIds={mode === 'attack-select' ? attackUnitIds : undefined}
              hideContent={mode === 'attack-select'}
            />

            <EventLog events={events} players={view.players} />
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--rule)', flexShrink: 0 }}>
            {isMyTurn ? (
              <Button className="k-end-turn-cta" style={{ width: '100%', fontSize: 14, padding: '10px 0', letterSpacing: '0.05em' }} onClick={handleEndTurn}>
                END TURN →
              </Button>
            ) : (
              <div className="k-waiting-dot" style={{ textAlign: 'center', fontSize: 11, color: 'var(--fg-dim)', padding: '8px 0' }}>
                waiting for{' '}
                <strong style={{ color: 'var(--fg)' }}>{view.players.find((p) => p.id === view.currentActivePlayer)?.displayName ?? '…'}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {lastCombat && (
        (userId === lastCombat.attackerId || userId === lastCombat.defenderId)
          ? <CombatOverlay lastCombat={lastCombat} onDismiss={clearLastCombat} />
          : <CombatToast lastCombat={lastCombat} view={view} onDismiss={clearLastCombat} />
      )}
      {view.status === 'ended' && <WinnerScreen view={view} userId={userId} />}
      {showRules && (
        <Modal title="How to play" onClose={() => setShowRules(false)}>
          {KINGDOMS_STRINGS.rules.sections.map((section) => (
            <div className="k-modal__section" key={section.title}>
              <div className="k-modal__section-title">{section.title}</div>
              <div>{section.body}</div>
            </div>
          ))}
        </Modal>
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      {showEliminatedSelf && view.status !== 'ended' && (
        <Modal title="⚔ Your Capital has fallen" onClose={() => setShowEliminatedSelf(null)}>
          <p>{showEliminatedSelf.byName} captured your Capital — you've been eliminated.</p>
          <p style={{ marginTop: 8 }}>The game continues for the remaining kingdoms; you can keep watching until it ends.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setShowEliminatedSelf(null)} style={{ marginLeft: 'auto' }}>Continue watching</Button>
          </div>
        </Modal>
      )}
      {eliminationBanner && (
        <div className="k-elimination-banner" key={eliminationBanner.key}>
          <div className="k-elimination-banner__title">⚔ Capital fallen</div>
          <div>{eliminationBanner.eliminatedName} was eliminated by {eliminationBanner.byName}</div>
        </div>
      )}
      {errorToast && (
        <div className="k-error-toast" key={errorToast.key} style={{ animation: 'k-toast-in 0.2s ease-out both, k-shake 0.4s ease-out 0.2s' }}>
          <span>⚠</span>
          <span>{errorToast.message}</span>
          <button className="k-error-toast__close" onClick={() => setErrorToast(null)} aria-label="dismiss">×</button>
        </div>
      )}
    </div>
  );
}
