import { MapBuilder } from '../../map/map-builder.js';
import type { GameMap } from '../../map/game-map.js';
import type { RandomSource } from '../../dice/random.js';

/**
 * 61-tile, 4-ring hex map for Kingdoms of Dominion.
 *
 * Terrain bag (61 total):
 *   plains   25 — base land, neutral defense
 *   forest   15 — medium defense
 *   hills    12 — slight defense bonus, iron-flavoured
 *   mountain  9 — strong defense, outer-ring emphasis
 */

// ── Axial hex ring generator ──────────────────────────────────────────────────

function ring(radius: number): ReadonlyArray<{ q: number; r: number }> {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const coords: { q: number; r: number }[] = [];
  // Start at (radius, 0) and walk the 6 sides
  let q = radius;
  let r = 0;
  const dirs = [
    { dq: -1, dr:  0 },
    { dq: -1, dr:  1 },
    { dq:  0, dr:  1 },
    { dq:  1, dr:  0 },
    { dq:  1, dr: -1 },
    { dq:  0, dr: -1 },
  ];
  for (const dir of dirs) {
    for (let i = 0; i < radius; i++) {
      coords.push({ q, r });
      q += dir.dq;
      r += dir.dr;
    }
  }
  return coords;
}

const ALL_COORDS = [0, 1, 2, 3, 4].flatMap((i) => ring(i));

// ── Terrain bag ───────────────────────────────────────────────────────────────

const TERRAIN_BAG: string[] = [
  ...Array<string>(25).fill('plains'),
  ...Array<string>(15).fill('forest'),
  ...Array<string>(12).fill('hills'),
  ...Array<string>(9).fill('mountain'),
];

function shuffle(arr: string[], rng: RandomSource): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.intInRange(0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function buildKingdomsMap(_playerCount: number, seed: string): GameMap {
  // Use the seed string as an integer for the RNG bootstrap (same pattern as Frontier)
  const rng: RandomSource = {
    next(): number {
      // Simple deterministic hash-based random for map building
      // The real seeded RNG is on state.rng — this is only used during setup
      throw new Error('intInRange only');
    },
    intInRange(min: number, max: number): number {
      return min + (Math.floor(Math.abs(Math.sin(seed.length + min + max) * 10000)) % (max - min + 1));
    },
  };

  const terrains = shuffle(TERRAIN_BAG, rng);
  const builder = new MapBuilder();

  ALL_COORDS.forEach((coord, i) => {
    builder.addTile(coord, terrains[i] ?? 'plains');
  });

  return builder.build();
}

/** Starting positions (ring-4 corners) per player count. */
export const KINGDOMS_STARTING_COORDS: Record<number, ReadonlyArray<{ q: number; r: number }>> = {
  2: [{ q: 4, r: -4 }, { q: -4, r: 4 }],
  3: [{ q: 4, r: 0  }, { q: 0,  r: -4 }, { q: -4, r: 4 }],
  4: [{ q: 4, r: 0  }, { q: 0,  r: -4 }, { q: -4, r: 0 }, { q: 0,  r: 4 }],
};
