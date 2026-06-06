import { describe, it, expect } from 'vitest';
import { RoundManager } from '../round-manager.js';
import { ClockwiseTurnOrder } from '../turn-order.js';
import { PlayerManager } from '../../players/player-manager.js';
import type { Player } from '../../players/player.js';

function makePlayer(id: string, seat: number): Player {
  return { id, displayName: id, color: 'red', seat };
}

const PHASE = [{ id: 'main', displayName: 'Main', nextPhases: ['main'] }];

function makeManager(players: ReadonlyArray<Player>): RoundManager {
  return new RoundManager([...players], new ClockwiseTurnOrder(), PHASE, 'main');
}

const P1 = makePlayer('p1', 0);
const P2 = makePlayer('p2', 1);
const P3 = makePlayer('p3', 2);

describe('RoundManager — initial state', () => {
  it('starts at round 1 with lowest-seat player active', () => {
    const rm = makeManager([P2, P1, P3]);
    expect(rm.round()).toBe(1);
    expect(rm.turn().activePlayer).toBe('p1');
  });
});

describe('RoundManager — endTurn turn advancement', () => {
  it('advances to next player', () => {
    const rm = makeManager([P1, P2]);
    const { newActivePlayer } = rm.endTurn([P1, P2], 'main');
    expect(newActivePlayer).toBe('p2');
  });

  it('does not increment round mid-lap', () => {
    const rm = makeManager([P1, P2, P3]);
    const { newRound } = rm.endTurn([P1, P2, P3], 'main');
    expect(newRound).toBe(false);
    expect(rm.round()).toBe(1);
  });

  it('increments round when all players have gone', () => {
    const rm = makeManager([P1, P2]);
    rm.endTurn([P1, P2], 'main'); // p1→p2 (no round wrap)
    const { newRound } = rm.endTurn([P1, P2], 'main'); // p2→p1 (wrap!)
    expect(newRound).toBe(true);
    expect(rm.round()).toBe(2);
  });

  it('correctly tracks active player through a full 3-player round', () => {
    const rm = makeManager([P1, P2, P3]);
    const players = [P1, P2, P3];

    const r1 = rm.endTurn(players, 'main'); // p1→p2
    expect(r1.newActivePlayer).toBe('p2');
    expect(r1.newRound).toBe(false);

    const r2 = rm.endTurn(players, 'main'); // p2→p3
    expect(r2.newActivePlayer).toBe('p3');
    expect(r2.newRound).toBe(false);

    const r3 = rm.endTurn(players, 'main'); // p3→p1 (wrap)
    expect(r3.newActivePlayer).toBe('p1');
    expect(r3.newRound).toBe(true);
    expect(rm.round()).toBe(2);
  });
});

describe('RoundManager — eliminated player handling', () => {
  it('skips eliminated players during endTurn', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    const rm = makeManager(mgr.all());

    // Turn starts at p1
    expect(rm.turn().activePlayer).toBe('p1');
    const { newActivePlayer } = rm.endTurn(mgr.all(), 'main');
    // Should skip p2 and go to p3
    expect(newActivePlayer).toBe('p3');
  });

  it('detects round wrap even after mid-round elimination', () => {
    // p1(seat=0) → p2(seat=1) → p3(seat=2) → back to p1
    // If p2 is eliminated: p1→p3→p1 (two turns per round)
    const mgr = new PlayerManager([P1, P2, P3]);
    const rm = makeManager(mgr.all());

    // Simulate: p1's turn, then p2 gets eliminated
    mgr.eliminate('p2');

    const r1 = rm.endTurn(mgr.all(), 'main'); // p1 → p3 (skip p2)
    expect(r1.newActivePlayer).toBe('p3');
    expect(r1.newRound).toBe(false);

    const r2 = rm.endTurn(mgr.all(), 'main'); // p3 → p1 (wrap, p3.seat=2 > p1.seat=0)
    expect(r2.newActivePlayer).toBe('p1');
    expect(r2.newRound).toBe(true);
  });

  it('round increments only once per lap even in a 1-vs-1 endgame', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    mgr.eliminate('p3');
    const rm = makeManager(mgr.all());

    // Only p1 remains — each endTurn wraps immediately
    const { newRound } = rm.endTurn(mgr.all(), 'main');
    expect(newRound).toBe(true);
    expect(rm.round()).toBe(2);
  });
});
