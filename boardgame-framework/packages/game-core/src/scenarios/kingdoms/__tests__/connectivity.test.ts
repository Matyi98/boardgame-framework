import { describe, it, expect } from 'vitest';
import { getConnectedTiles, playerOwnedTiles, playerGateTileIds, playerConnectedTiles } from '../connectivity.js';
import { MapBuilder } from '../../../map/map-builder.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { kingdomsPieces } from '../pieces.js';
import type { GameState } from '../../../state/game-state.js';

// ── Map fixture builder ───────────────────────────────────────────────────────
//
// Builds a simple linear hex chain: (0,0)—(1,0)—(2,0)—(3,0)—(4,0)
// Easy to reason about: tiles are adjacent in sequence, none are adjacent
// to non-sequential neighbours in this layout.

function linearMap() {
  const builder = new MapBuilder();
  for (let q = 0; q <= 4; q++) builder.addTile({ q, r: 0 }, 'plains');
  return builder.build();
}

// tileId helper matching the game-core convention
const tid = (q: number) => `${q},0`;

// ── playerOwnedTiles ──────────────────────────────────────────────────────────

describe('playerOwnedTiles', () => {
  it('returns tiles owned by the given player', () => {
    const ownership = { [tid(0)]: 'p1', [tid(1)]: 'p2', [tid(2)]: 'p1' };
    const owned = playerOwnedTiles(ownership, 'p1');
    expect(owned).toContain(tid(0));
    expect(owned).toContain(tid(2));
    expect(owned.has(tid(1))).toBe(false);
  });

  it('returns empty set when player owns nothing', () => {
    const ownership = { [tid(0)]: 'p2' };
    expect(playerOwnedTiles(ownership, 'p1').size).toBe(0);
  });
});

// ── getConnectedTiles — basic cases ──────────────────────────────────────────

describe('getConnectedTiles — basic', () => {
  const map = linearMap();

  it('single capital tile returns just that tile', () => {
    const owned = new Set([tid(0)]);
    const connected = getConnectedTiles(map, tid(0), owned);
    expect(connected.size).toBe(1);
    expect(connected.has(tid(0))).toBe(true);
  });

  it('returns empty set when capital is not in owned tiles', () => {
    const owned = new Set([tid(1)]);
    const connected = getConnectedTiles(map, tid(0), owned);
    expect(connected.size).toBe(0);
  });

  it('traverses a fully connected chain', () => {
    // p1 owns all 5 tiles, capital at (0,0)
    const owned = new Set([tid(0), tid(1), tid(2), tid(3), tid(4)]);
    const connected = getConnectedTiles(map, tid(0), owned);
    expect(connected.size).toBe(5);
  });

  it('stops at unowned tiles', () => {
    // p1 owns (0,0) and (1,0) but NOT (2,0) — so (3,0) and (4,0) are unreachable
    const owned = new Set([tid(0), tid(1), tid(3), tid(4)]);
    const connected = getConnectedTiles(map, tid(0), owned);
    expect(connected.size).toBe(2);
    expect(connected.has(tid(0))).toBe(true);
    expect(connected.has(tid(1))).toBe(true);
    expect(connected.has(tid(3))).toBe(false);
    expect(connected.has(tid(4))).toBe(false);
  });
});

// ── getConnectedTiles — territory split ───────────────────────────────────────

describe('getConnectedTiles — split territory', () => {
  const map = linearMap();

  it('only returns tiles on the capital side of a gap', () => {
    // Capital at (0,0); owned: (0,0)(1,0)(3,0)(4,0); gap at (2,0)
    const owned = new Set([tid(0), tid(1), tid(3), tid(4)]);
    const connected = getConnectedTiles(map, tid(0), owned);
    expect(connected.has(tid(3))).toBe(false);
    expect(connected.has(tid(4))).toBe(false);
  });

  it('capital itself is always included when owned', () => {
    const owned = new Set([tid(2)]);
    const connected = getConnectedTiles(map, tid(2), owned);
    expect(connected.has(tid(2))).toBe(true);
  });

  it('capital in middle of a chain can reach both sides', () => {
    // Capital at (2,0); all tiles owned → all reachable
    const owned = new Set([tid(0), tid(1), tid(2), tid(3), tid(4)]);
    const connected = getConnectedTiles(map, tid(2), owned);
    expect(connected.size).toBe(5);
  });
});

// ── getConnectedTiles — ring map ──────────────────────────────────────────────
//
// Build a 7-tile map (center + 6 neighbours) to test real hex adjacency.

describe('getConnectedTiles — hex ring', () => {
  function ringMap() {
    const builder = new MapBuilder();
    builder.addTile({ q: 0, r: 0 }, 'plains');                        // centre
    builder.addTile({ q: 1, r: 0 }, 'plains');
    builder.addTile({ q: 0, r: 1 }, 'plains');
    builder.addTile({ q: -1, r: 1 }, 'plains');
    builder.addTile({ q: -1, r: 0 }, 'plains');
    builder.addTile({ q: 0, r: -1 }, 'plains');
    builder.addTile({ q: 1, r: -1 }, 'plains');
    return builder.build();
  }

  const map = ringMap();
  const centre = '0,0';

  it('all 7 tiles reachable from centre when fully owned', () => {
    const owned = new Set(['0,0', '1,0', '0,1', '-1,1', '-1,0', '0,-1', '1,-1']);
    const connected = getConnectedTiles(map, centre, owned);
    expect(connected.size).toBe(7);
  });

  it('BFS does not revisit already-visited tiles', () => {
    // Multiple paths exist from centre; all should be visited exactly once
    const owned = new Set(['0,0', '1,0', '0,1', '1,-1']);
    const connected = getConnectedTiles(map, centre, owned);
    expect(connected.size).toBe(4);
  });
});

// ── getConnectedTiles — Gate bridge ───────────────────────────────────────────
//
// Gate mechanic: a player can build a Gate on their owned tile. That tile then
// acts as a bridge — the BFS can hop through one adjacent unowned tile to reach
// owned tiles on the other side, maintaining supply to cut-off territory.
//
// Layout used below: (0,0)—(1,0)—(2,0)—(3,0)—(4,0) linear chain.
// Capital at (0,0). Unowned gap at (2,0).

describe('getConnectedTiles — Gate bridge', () => {
  const map = linearMap();

  it('Gate on an owned tile bridges through one unowned tile', () => {
    // Owned: 0,1,3,4. Gap at 2. Gate on tile 1.
    const owned  = new Set([tid(0), tid(1), tid(3), tid(4)]);
    const bridge = new Set([tid(1)]); // Gate on tile (1,0)
    const connected = getConnectedTiles(map, tid(0), owned, bridge);
    expect(connected.has(tid(0))).toBe(true);
    expect(connected.has(tid(1))).toBe(true);
    expect(connected.has(tid(3))).toBe(true); // reached via Gate bridge
    expect(connected.has(tid(4))).toBe(true); // reached via (3,0) once connected
    expect(connected.size).toBe(4);
  });

  it('unowned gap tile is NOT added to the connected set', () => {
    const owned  = new Set([tid(0), tid(1), tid(3)]);
    const bridge = new Set([tid(1)]);
    const connected = getConnectedTiles(map, tid(0), owned, bridge);
    expect(connected.has(tid(2))).toBe(false); // bridge pass-through, not owned
  });

  it('Gate does NOT bridge through two consecutive unowned tiles', () => {
    // Owned: 0,1,4. Gaps at 2 and 3 (two-tile gap). Gate on (1,0).
    const owned  = new Set([tid(0), tid(1), tid(4)]);
    const bridge = new Set([tid(1)]);
    const connected = getConnectedTiles(map, tid(0), owned, bridge);
    // (1,0) Gate peeks through (2,0) → finds (3,0), which is NOT owned → no further jump
    expect(connected.has(tid(4))).toBe(false);
    expect(connected.size).toBe(2);
  });

  it('without a Gate the gap is not crossed', () => {
    // Same owned set but no bridge tiles
    const owned  = new Set([tid(0), tid(1), tid(3), tid(4)]);
    const connected = getConnectedTiles(map, tid(0), owned); // no bridgeTileIds
    expect(connected.has(tid(3))).toBe(false);
    expect(connected.size).toBe(2);
  });

  it('Gate on capital itself bridges its own unowned neighbours', () => {
    // Capital (0,0) has a Gate. Owns (0,0) and (2,0) but NOT (1,0).
    const owned  = new Set([tid(0), tid(2)]);
    const bridge = new Set([tid(0)]); // Gate on capital
    const connected = getConnectedTiles(map, tid(0), owned, bridge);
    expect(connected.has(tid(0))).toBe(true);
    expect(connected.has(tid(2))).toBe(true); // reached via bridge through (1,0)
    expect(connected.size).toBe(2);
  });

  it('two chained Gates bridge two separate one-tile gaps', () => {
    // Owned: 0,1,3,5 (using a 6-tile map). Gaps at 2 and 4.
    // Gates on tiles 1 and 3 each bridge one gap.
    const builder = new MapBuilder();
    for (let q = 0; q <= 5; q++) builder.addTile({ q, r: 0 }, 'plains');
    const sixTileMap = builder.build();
    const t = (q: number) => `${q},0`;

    const owned  = new Set([t(0), t(1), t(3), t(5)]);
    const bridge = new Set([t(1), t(3)]); // Gates on both bridge tiles
    const connected = getConnectedTiles(sixTileMap, t(0), owned, bridge);
    expect(connected.has(t(0))).toBe(true);
    expect(connected.has(t(1))).toBe(true);
    expect(connected.has(t(3))).toBe(true); // bridged via Gate on (1,0)
    expect(connected.has(t(5))).toBe(true); // bridged via Gate on (3,0)
    expect(connected.size).toBe(4);
  });
});

// ── playerGateTileIds ─────────────────────────────────────────────────────────

describe('playerGateTileIds', () => {
  function stateWithGates(
    gates: Array<{ id: string; owner: string; tileId: string }>,
  ): GameState {
    const pieces = new Map(
      gates.map((g) => [
        g.id,
        makeUnitFromRegistry(kingdomsPieces, { id: g.id, kind: 'gate', owner: g.owner, tileId: g.tileId }),
      ]),
    );
    return { pieces } as unknown as GameState;
  }

  it('returns tile IDs of the player\'s own Gates', () => {
    const state = stateWithGates([
      { id: 'g1', owner: 'p1', tileId: '1,0' },
      { id: 'g2', owner: 'p1', tileId: '3,0' },
      { id: 'g3', owner: 'p2', tileId: '5,0' },
    ]);
    const gates = playerGateTileIds(state, 'p1');
    expect(gates.has('1,0')).toBe(true);
    expect(gates.has('3,0')).toBe(true);
    expect(gates.has('5,0')).toBe(false); // enemy gate
  });

  it('returns empty set when player has no Gates', () => {
    const state = stateWithGates([]);
    expect(playerGateTileIds(state, 'p1').size).toBe(0);
  });
});

// ── playerConnectedTiles ──────────────────────────────────────────────────────

describe('playerConnectedTiles', () => {
  const map = linearMap();

  function stateWithGate(
    ownership: Record<string, string>,
    capitals: Record<string, string>,
    gateTileId: string | null,
    gateOwner = 'p1',
  ): GameState {
    const pieces = new Map<string, ReturnType<typeof makeUnitFromRegistry>>();
    if (gateTileId) {
      pieces.set('g1', makeUnitFromRegistry(kingdomsPieces, {
        id: 'g1', kind: 'gate', owner: gateOwner, tileId: gateTileId,
      }));
    }
    return {
      extras: { 'k:ownership': ownership, 'k:capitals': capitals },
      map,
      pieces,
    } as unknown as GameState;
  }

  it('includes Gate bridge tiles when querying connected territory', () => {
    const ownership = { [tid(0)]: 'p1', [tid(1)]: 'p1', [tid(3)]: 'p1' };
    const capitals  = { p1: tid(0) };
    const state = stateWithGate(ownership, capitals, tid(1)); // Gate on (1,0)
    const connected = playerConnectedTiles(map, state, 'p1');
    expect(connected.has(tid(3))).toBe(true);
  });

  it('returns empty set when player has no capital', () => {
    const state = stateWithGate({ [tid(0)]: 'p1' }, {}, null);
    expect(playerConnectedTiles(map, state, 'p1').size).toBe(0);
  });
});
