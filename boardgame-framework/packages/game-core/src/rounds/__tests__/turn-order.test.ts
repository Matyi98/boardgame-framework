import { describe, it, expect } from 'vitest';
import { ClockwiseTurnOrder } from '../turn-order.js';
import { PlayerManager } from '../../players/player-manager.js';
import type { Player } from '../../players/player.js';

function makePlayer(id: string, seat: number): Player {
  return { id, displayName: id, color: 'red', seat };
}

const P1 = makePlayer('p1', 0);
const P2 = makePlayer('p2', 1);
const P3 = makePlayer('p3', 2);
const P4 = makePlayer('p4', 3);

describe('ClockwiseTurnOrder — initial', () => {
  it('returns players sorted by seat', () => {
    const order = new ClockwiseTurnOrder();
    const result = order.initial([P3, P1, P2]);
    expect(result).toEqual(['p1', 'p2', 'p3']);
  });

  it('excludes eliminated players', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    const order = new ClockwiseTurnOrder();
    expect(order.initial(mgr.all())).toEqual(['p1', 'p3']);
  });
});

describe('ClockwiseTurnOrder — next', () => {
  it('advances in seat order', () => {
    const order = new ClockwiseTurnOrder();
    const players = [P1, P2, P3];
    expect(order.next('p1', players)).toBe('p2');
    expect(order.next('p2', players)).toBe('p3');
    expect(order.next('p3', players)).toBe('p1');
  });

  it('wraps around from last to first', () => {
    const order = new ClockwiseTurnOrder();
    expect(order.next('p3', [P1, P2, P3])).toBe('p1');
  });

  it('skips eliminated players', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    const order = new ClockwiseTurnOrder();
    // After P1 it should skip P2 and go to P3
    expect(order.next('p1', mgr.all())).toBe('p3');
    // After P3 it wraps to P1
    expect(order.next('p3', mgr.all())).toBe('p1');
  });

  it('returns self when only one active player', () => {
    const mgr = new PlayerManager([P1, P2]);
    mgr.eliminate('p2');
    const order = new ClockwiseTurnOrder();
    expect(order.next('p1', mgr.all())).toBe('p1');
  });

  it('returns first active player when current player just got eliminated (idx=-1)', () => {
    const mgr = new PlayerManager([P1, P2, P3, P4]);
    mgr.eliminate('p1');
    const order = new ClockwiseTurnOrder();
    // p1 was the current player but is now eliminated — should fall to first active player
    expect(order.next('p1', mgr.all())).toBe('p2');
  });
});
