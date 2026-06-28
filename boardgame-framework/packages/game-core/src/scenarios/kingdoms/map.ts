import { MapBuilder } from '../../map/map-builder.js';
import type { GameMap } from '../../map/game-map.js';

/**
 * 61-tile, 4-ring hex map for Kingdoms of Dominion.
 *
 * Tile properties set via MapBuilder.setTileProperties():
 *   resourceType   — 'food' | 'iron' | 'wood' | null  (primary yield of the tile)
 *   economicValue  — 1–5  (gold income weight; higher in the centre)
 *   combatValue    — 1–3  (historical; currently terrain defenseBonus drives combat)
 *
 * Terrain bag (61 total):
 *   plains   25  — neutral defense, mild economic value
 *   forest   15  — medium defense, wood flavour
 *   hills    12  — slight defense, iron flavour
 *   mountain  9  — strong defense, iron flavour; outer emphasis
 *
 * Coordinate system: pointy-top axial (q, r). Ring k tiles satisfy
 * max(|q|, |r|, |q+r|) = k.
 */

// ── Axial ring generator ──────────────────────────────────────────────────────

function ring(radius: number): ReadonlyArray<{ q: number; r: number }> {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const coords: { q: number; r: number }[] = [];
  let q = radius;
  let r = 0;
  // Starting at (radius, 0), traverse the ring counter-clockwise.
  // Direction order matters: wrong order causes inner-ring tiles to be generated
  // instead of the actual ring-k boundary (the old bug: only 45 of 61 coords
  // were unique and 3 of 6 ring-4 corners were missing entirely).
  const dirs = [
    { dq:  0, dr: -1 },
    { dq: -1, dr:  0 },
    { dq: -1, dr:  1 },
    { dq:  0, dr:  1 },
    { dq:  1, dr:  0 },
    { dq:  1, dr: -1 },
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

/**
 * Hash an arbitrary string to a non-zero uint32 using FNV-1a.
 * Matches the pattern in dice/random.ts so shuffle quality is consistent
 * with the game's RNG. Different game IDs (even single-char differences)
 * produce well-distributed seeds.
 */
function seedFromString(s: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1; // unsigned, never zero (xorshift dies on 0)
}

/**
 * Fisher-Yates shuffle driven by an xorshift32 PRNG seeded from the game ID.
 *
 * Previous implementation used (charCode × 31 + i) % (i+1) which cycled the
 * same small hash values for short seeds, producing visibly biased terrain
 * distributions. xorshift32 passes standard randomness tests at negligible
 * extra cost.
 */
function seededShuffle(arr: string[], seed: string): string[] {
  const copy = [...arr];
  let x = seedFromString(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    // xorshift32 — same algorithm as SeededRandom in dice/random.ts
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1); // unsigned modulo keeps j in [0, i]
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// ── Tile property derivation ──────────────────────────────────────────────────

type ResourceType = 'food' | 'iron' | 'wood' | null;

const TERRAIN_RESOURCE: Record<string, ResourceType> = {
  plains:   'food',
  forest:   'wood',
  hills:    'iron',
  mountain: 'iron',
};

/** Economic value: higher at centre (ring 0–1), lower at edges (ring 3–4). */
function economicValue(ringRadius: number): number {
  return Math.max(1, 5 - ringRadius);
}

/** Combat value: mirrors terrain defense bonus (plains 1, hills 2, forest 2, mountain 3). */
const TERRAIN_COMBAT_VALUE: Record<string, number> = {
  plains:   1,
  forest:   2,
  hills:    2,
  mountain: 3,
};

function tileRing(coord: { q: number; r: number }): number {
  return Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.q + coord.r));
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildKingdomsMap(_playerCount: number, seed: string): GameMap {
  const terrains = seededShuffle(TERRAIN_BAG, seed);
  const builder = new MapBuilder();

  ALL_COORDS.forEach((coord, i) => {
    const terrain = terrains[i] ?? 'plains';
    builder.addTile(coord, terrain);
    builder.setTileProperties(coord, {
      resourceType:  TERRAIN_RESOURCE[terrain] ?? null,
      economicValue: economicValue(tileRing(coord)),
      combatValue:   TERRAIN_COMBAT_VALUE[terrain] ?? 1,
    });
  });

  return builder.build();
}

// ── Starting positions ────────────────────────────────────────────────────────

/**
 * Ring-4 corner positions per player count, maximally separated.
 * All 6 ring-4 corners: (4,0) (4,-4) (0,-4) (-4,0) (-4,4) (0,4) — each pair
 * of adjacent corners is hex-distance 4 apart; opposite corners are 8 apart.
 */
export const KINGDOMS_STARTING_COORDS: Record<number, ReadonlyArray<{ q: number; r: number }>> = {
  2: [{ q: 4, r: -4 }, { q: -4, r: 4 }],
  3: [{ q: 4, r: 0  }, { q: 0,  r: -4 }, { q: -4, r: 4  }],
  4: [{ q: 4, r: 0  }, { q: 0,  r: -4 }, { q: -4, r: 0  }, { q:  0, r: 4  }],
  5: [{ q: 4, r: 0  }, { q: 4,  r: -4 }, { q: 0,  r: -4 }, { q: -4, r: 0  }, { q: 0, r: 4 }],
  6: [{ q: 4, r: 0  }, { q: 4,  r: -4 }, { q: 0,  r: -4 }, { q: -4, r: 0  }, { q: -4, r: 4 }, { q: 0, r: 4 }],
};
