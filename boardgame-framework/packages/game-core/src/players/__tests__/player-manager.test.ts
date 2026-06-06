import { describe, it, expect } from 'vitest';
import { PlayerManager } from '../player-manager.js';
import type { Player } from '../player.js';

function makePlayer(overrides: Partial<Player> & { id: string }): Player {
  return {
    displayName: overrides.id,
    color: 'red',
    seat: 0,
    ...overrides,
  };
}

const P1 = makePlayer({ id: 'p1', seat: 0 });
const P2 = makePlayer({ id: 'p2', seat: 1 });
const P3 = makePlayer({ id: 'p3', seat: 2 });

describe('PlayerManager — initialization', () => {
  it('initializes all players as active regardless of incoming status', () => {
    const eliminated = makePlayer({ id: 'px', seat: 3, status: 'eliminated' });
    const mgr = new PlayerManager([P1, eliminated]);
    expect(mgr.isEliminated('px')).toBe(false);
    expect(mgr.active()).toHaveLength(2);
  });

  it('sorts players by seat', () => {
    const mgr = new PlayerManager([P3, P1, P2]);
    const seats = mgr.all().map((p) => p.seat);
    expect(seats).toEqual([0, 1, 2]);
  });
});

describe('PlayerManager — queries', () => {
  it('get() returns player by id', () => {
    const mgr = new PlayerManager([P1, P2]);
    expect(mgr.get('p1')?.id).toBe('p1');
    expect(mgr.get('unknown')).toBeUndefined();
  });

  it('require() throws for unknown id', () => {
    const mgr = new PlayerManager([P1]);
    expect(() => mgr.require('unknown')).toThrow();
  });

  it('atSeat() finds player by seat value, not array index', () => {
    // seats 0, 1, 2 — atSeat(2) should return P3, not P1 (index 0)
    const mgr = new PlayerManager([P1, P2, P3]);
    expect(mgr.atSeat(2)?.id).toBe('p3');
    expect(mgr.atSeat(0)?.id).toBe('p1');
    expect(mgr.atSeat(99)).toBeUndefined();
  });

  it('atSeat() works with non-zero-based seats', () => {
    const q1 = makePlayer({ id: 'q1', seat: 10 });
    const q2 = makePlayer({ id: 'q2', seat: 20 });
    const mgr = new PlayerManager([q1, q2]);
    expect(mgr.atSeat(10)?.id).toBe('q1');
    expect(mgr.atSeat(20)?.id).toBe('q2');
    expect(mgr.atSeat(0)).toBeUndefined();
  });

  it('count() returns total including eliminated', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    expect(mgr.count()).toBe(3);
    expect(mgr.active()).toHaveLength(2);
  });
});

describe('PlayerManager — elimination', () => {
  it('eliminate() marks player as eliminated', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    expect(mgr.isEliminated('p2')).toBe(true);
    expect(mgr.isEliminated('p1')).toBe(false);
  });

  it('eliminated player is excluded from active()', () => {
    const mgr = new PlayerManager([P1, P2, P3]);
    mgr.eliminate('p2');
    const active = mgr.active().map((p) => p.id);
    expect(active).not.toContain('p2');
    expect(active).toContain('p1');
    expect(active).toContain('p3');
  });

  it('all() still includes eliminated players', () => {
    const mgr = new PlayerManager([P1, P2]);
    mgr.eliminate('p1');
    expect(mgr.all()).toHaveLength(2);
  });

  it('eliminate() throws for unknown player', () => {
    const mgr = new PlayerManager([P1]);
    expect(() => mgr.eliminate('unknown')).toThrow();
  });

  it('eliminating all players empties active()', () => {
    const mgr = new PlayerManager([P1, P2]);
    mgr.eliminate('p1');
    mgr.eliminate('p2');
    expect(mgr.active()).toHaveLength(0);
  });
});
