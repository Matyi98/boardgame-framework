/**
 * EventLog — human-readable game history (ticket #31).
 *
 * There was no event log in the Kingdoms UI before this — an earlier bug fix
 * (backlog ticket #1, "built undefined") removed a broken log component
 * entirely rather than repairing it, so this is a from-scratch build, not a
 * redesign. The raw event stream (`GameBusEvent[]`) was already being
 * collected in the store; nothing previously rendered it.
 *
 * Design per the ticket: grouped by round, one icon per event type, colored
 * by the acting player, newest round pinned at the top. The four per-player
 * economy events that fire every single round (income-collected,
 * food-consumed, food-purchased, city-mortgaged) are merged into one summary
 * line per player instead of 3-4 separate bullets — otherwise the log would
 * be mostly economic noise within the first few rounds.
 */

import { useMemo } from 'react';
import type { GameBusEvent } from '@bgf/shared-types';
import type { KingdomsPlayerView } from '@bgf/game-core';
import { playerColor } from './player-visuals.js';
import { ALL_PIECE_ICONS } from './strings.js';
import { CollapsibleSection } from './primitives.js';

interface LogEntry {
  id: string;
  round: number;
  icon: string;
  color: string;
  text: string;
}

interface EconomyAccum {
  gold: number;
  wood: number;
  food: number;
  iron: number;
  foodConsumed: number;
  foodPurchased: number;
  mortgaged: number;
}

function nameOf(players: readonly KingdomsPlayerView[], id: string | undefined): string {
  if (!id) return 'Someone';
  return players.find((p) => p.id === id)?.displayName ?? 'Someone';
}

function colorOf(players: readonly KingdomsPlayerView[], id: string | undefined): string {
  const p = id ? players.find((pl) => pl.id === id) : undefined;
  return p ? playerColor(p.color) : 'var(--fg-dim)';
}

function buildLogEntries(
  events: readonly GameBusEvent[],
  players: readonly KingdomsPlayerView[],
): LogEntry[] {
  const entries: LogEntry[] = [];
  let currentRound = 1;
  // Set only during a round-end transition — the per-player economy events
  // that follow turn-ended belong to the round that's CLOSING (round() has
  // already been incremented by the time these fire), not the new one.
  let economyRound: number | null = null;
  const pending = new Map<string, EconomyAccum>();

  const ensure = (pid: string): EconomyAccum => {
    let e = pending.get(pid);
    if (!e) {
      e = { gold: 0, wood: 0, food: 0, iron: 0, foodConsumed: 0, foodPurchased: 0, mortgaged: 0 };
      pending.set(pid, e);
    }
    return e;
  };

  const flushEconomy = (round: number) => {
    for (const [pid, e] of pending) {
      const parts: string[] = [];
      const gains: string[] = [];
      if (e.gold) gains.push(`+${e.gold}🪙`);
      if (e.wood) gains.push(`+${e.wood}🪵`);
      if (e.food) gains.push(`+${e.food}🌾`);
      if (e.iron) gains.push(`+${e.iron}⚙️`);
      if (gains.length) parts.push(`income ${gains.join(' ')}`);
      if (e.foodConsumed) parts.push(`-${e.foodConsumed}🌾 upkeep`);
      if (e.foodPurchased) parts.push(`bought ${e.foodPurchased}🌾 (-${e.foodPurchased * 3}🪙)`);
      if (e.mortgaged) parts.push(`mortgaged ${e.mortgaged} cit${e.mortgaged > 1 ? 'ies' : 'y'}`);
      if (parts.length === 0) continue;
      entries.push({
        id: `econ-${round}-${pid}`,
        round,
        icon: '🪙',
        color: colorOf(players, pid),
        text: `${nameOf(players, pid)} — ${parts.join(' · ')}`,
      });
    }
    pending.clear();
  };

  for (const ev of events) {
    const p = ev.payload as Record<string, any>;
    switch (ev.type) {
      case 'income-collected': {
        const e = ensure(ev.playerId!);
        e.gold += p.gold ?? 0; e.wood += p.wood ?? 0; e.food += p.food ?? 0; e.iron += p.iron ?? 0;
        break;
      }
      case 'food-consumed':
        ensure(ev.playerId!).foodConsumed += p.foodConsumed ?? 0;
        break;
      case 'food-purchased':
        ensure(ev.playerId!).foodPurchased += p.purchased ?? 0;
        break;
      case 'city-mortgaged':
        ensure(ev.playerId!).mortgaged += 1;
        break;
      case 'territory-disconnected':
        // Informational only (no ownership change) — too granular to log.
        break;
      case 'turn-ended':
        if (p.newRound) economyRound = (p.round as number) - 1;
        break;
      case 'round-ended': {
        const round = economyRound ?? currentRound;
        flushEconomy(round);
        entries.push({ id: `round-marker-${p.round}`, round, icon: '🔄', color: 'var(--fg-dim)', text: `Round ${round} complete` });
        currentRound = p.round as number;
        economyRound = null;
        break;
      }
      case 'unit-recruited':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: ALL_PIECE_ICONS[p.unitKind as string] ?? '•', color: colorOf(players, ev.playerId),
          text: `${nameOf(players, ev.playerId)} recruited a ${p.unitKind}`,
        });
        break;
      case 'structure-built':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: ALL_PIECE_ICONS[p.structureKind as string] ?? '🏗', color: colorOf(players, ev.playerId),
          text: `${nameOf(players, ev.playerId)} built a ${p.structureKind}`,
        });
        break;
      case 'structure-demolished':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: '💥', color: colorOf(players, ev.playerId),
          text: `${nameOf(players, ev.playerId)} demolished a ${p.structureKind} (+${p.refund}🪙 refund)`,
        });
        break;
      case 'tile-developed':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: '🏗', color: colorOf(players, ev.playerId),
          text: `${nameOf(players, ev.playerId)} developed a tile${p.resourceUnlocked ? ` — unlocked ${p.resourceUnlocked}` : ''}`,
        });
        break;
      case 'battle-resolved': {
        const attackerName = nameOf(players, ev.playerId);
        const target = p.defenderOwner ? `${nameOf(players, p.defenderOwner)}'s tile` : 'an unowned tile';
        const text = p.attackerWins
          ? `${attackerName} won an attack on ${target}${p.attackerCasualties ? ` (${p.attackerCasualties} losses)` : ''}`
          : `${attackerName} was repelled attacking ${target}`;
        entries.push({ id: String(ev.seq), round: currentRound, icon: '⚔', color: colorOf(players, ev.playerId), text });
        break;
      }
      case 'tile-loyalty-reduced':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: '♛', color: colorOf(players, ev.playerId),
          text: `${nameOf(players, ev.playerId)}'s Noble eroded a tile's loyalty to ${p.loyalty}%`,
        });
        break;
      case 'tile-captured':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: '🚩', color: colorOf(players, ev.playerId),
          text: `${nameOf(players, ev.playerId)} captured ${p.previousOwner ? `${nameOf(players, p.previousOwner)}'s tile` : 'an unowned tile'}`,
        });
        break;
      case 'player-eliminated':
        entries.push({
          id: String(ev.seq), round: currentRound,
          icon: '💀', color: colorOf(players, p.eliminatedPlayerId),
          text: `${nameOf(players, p.eliminatedPlayerId)} eliminated by ${nameOf(players, p.byPlayerId)} — capital fallen`,
        });
        break;
      default:
        break; // game-started / game-ended / unit-moved / structure validators etc. — not log-worthy
    }
  }
  flushEconomy(economyRound ?? currentRound);
  return entries;
}

export function EventLog({ events, players }: {
  events: readonly GameBusEvent[];
  players: readonly KingdomsPlayerView[];
}): JSX.Element {
  // Ticket #48 perf audit: this used to re-scan the entire event history
  // and rebuild the round grouping on every render, unconditionally — events
  // gets a new array reference on every single socket message (not just
  // log-relevant ones), and a closed <details> still renders its children
  // (the browser just hides them), so this cost ran constantly for the
  // whole length of a game regardless of whether the log was even open.
  const entries = useMemo(() => buildLogEntries(events, players), [events, players]);

  const { byRound, rounds } = useMemo(() => {
    const map = new Map<number, LogEntry[]>();
    for (const e of entries) {
      const list = map.get(e.round);
      if (list) list.push(e); else map.set(e.round, [e]);
    }
    return { byRound: map, rounds: [...map.keys()].sort((a, b) => b - a) };
  }, [entries]);

  return (
    <CollapsibleSection title="📜 Event log" count={entries.length} className="k-event-log">
      {rounds.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center', padding: '8px 0' }}>
          Nothing has happened yet
        </div>
      )}
      {rounds.map((round) => (
        <div key={round} className="k-event-log__round">
          <div className="k-event-log__round-label">Round {round}</div>
          {[...byRound.get(round)!].reverse().map((e) => (
            <div key={e.id} className="k-event-log__entry" style={{ animation: 'k-slide-in-log 0.25s ease-out both' }}>
              <span style={{ flexShrink: 0 }}>{e.icon}</span>
              <span style={{ color: e.color }}>{e.text}</span>
            </div>
          ))}
        </div>
      ))}
    </CollapsibleSection>
  );
}
