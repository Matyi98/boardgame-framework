import { MapBuilder } from '../../map/map-builder.js';
import type { GameMap } from '../../map/game-map.js';
import { SeededRandom, seedFromString } from '../../dice/random.js';

/**
 * 37-tile three-ring hex map.
 * Ring 0 (1): centre
 * Ring 1 (6): immediate neighbours
 * Ring 2 (12): mid ring
 * Ring 3 (18): outer edge — player starting positions
 */
const COORDS = [
  // ring 0
  { q: 0,  r: 0  },
  // ring 1
  { q: 1,  r: 0  }, { q: 1,  r: -1 }, { q: 0,  r: -1 },
  { q: -1, r: 0  }, { q: -1, r: 1  }, { q: 0,  r: 1  },
  // ring 2
  { q: 2,  r: 0  }, { q: 2,  r: -1 }, { q: 2,  r: -2 },
  { q: 1,  r: -2 }, { q: 0,  r: -2 }, { q: -1, r: -1 },
  { q: -2, r: 0  }, { q: -2, r: 1  }, { q: -2, r: 2  },
  { q: -1, r: 2  }, { q: 0,  r: 2  }, { q: 1,  r: 1  },
  // ring 3
  { q: 3,  r: 0  }, { q: 3,  r: -1 }, { q: 3,  r: -2 }, { q: 3,  r: -3 },
  { q: 2,  r: -3 }, { q: 1,  r: -3 }, { q: 0,  r: -3 },
  { q: -1, r: -2 }, { q: -2, r: -1 }, { q: -3, r: 0  },
  { q: -3, r: 1  }, { q: -3, r: 2  }, { q: -3, r: 3  },
  { q: -2, r: 3  }, { q: -1, r: 3  }, { q: 0,  r: 3  },
  { q: 1,  r: 2  }, { q: 2,  r: 1  },
] as const;

/**
 * Terrain bag — 37 tiles total.
 * Plains (1 VP) × 12, Forest (2 VP) × 14, Mountain (3 VP) × 11.
 * VP pool: 12 + 28 + 33 = 73 VP across the board.
 */
const TERRAIN_BAG = [
  'grass',    'grass',    'grass',    'grass',    'grass',    'grass',
  'grass',    'grass',    'grass',    'grass',    'grass',    'grass',
  'forest',   'forest',   'forest',   'forest',   'forest',   'forest',
  'forest',   'forest',   'forest',   'forest',   'forest',   'forest',
  'forest',   'forest',
  'mountain', 'mountain', 'mountain', 'mountain', 'mountain', 'mountain',
  'mountain', 'mountain', 'mountain', 'mountain', 'mountain',
] as const;

export function buildDemoMap(_playerCount: number, seed: string): GameMap {
  const rng = new SeededRandom(seedFromString(seed));

  const terrains = [...TERRAIN_BAG] as string[];
  for (let i = terrains.length - 1; i > 0; i--) {
    const j = rng.intInRange(0, i);
    const tmp = terrains[i]!;
    terrains[i] = terrains[j]!;
    terrains[j] = tmp;
  }

  const builder = new MapBuilder();
  for (let idx = 0; idx < COORDS.length; idx++) {
    builder.addTile(COORDS[idx]!, terrains[idx]!);
  }
  return builder.build();
}
