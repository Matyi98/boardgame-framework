import type { PlayerId } from '../players/player.js';
import type { Piece, PieceLocation } from './piece.js';
import type { PieceRegistry } from './piece-registry.js';

/**
 * A unit. Lives on a tile (Risk-style armies / soldiers) by convention.
 * Units typically have movement and combat capability.
 */
export interface Unit extends Piece {
  readonly location: Extract<PieceLocation, { kind: 'tile' }>;
}

/**
 * Create a unit with explicit stats and state.
 * Use this when you have the stats already (e.g. from a UNIT_STATS constant).
 */
export function makeUnit(args: {
  id: string;
  kind: string;
  owner: PlayerId;
  tileId: string;
  stats?: Record<string, number>;
  state?: Record<string, unknown>;
}): Unit {
  return {
    id: args.id,
    kind: args.kind,
    owner: args.owner,
    location: { kind: 'tile', tileId: args.tileId },
    ...(args.stats ? { stats: Object.freeze({ ...args.stats }) } : {}),
    ...(args.state ? { state: args.state } : {}),
  };
}

/**
 * Create a unit, automatically merging defaultStats from the registry.
 * Per-instance overrides in `statsOverride` take precedence over registry defaults.
 * Use this when you want balance changes in the registry to propagate automatically.
 */
export function makeUnitFromRegistry(
  registry: PieceRegistry,
  args: {
    id: string;
    kind: string;
    owner: PlayerId;
    tileId: string;
    statsOverride?: Record<string, number>;
    state?: Record<string, unknown>;
  },
): Unit {
  const baseStats = registry.getDefaultStats(args.kind);
  const stats = args.statsOverride
    ? { ...baseStats, ...args.statsOverride }
    : baseStats;
  return makeUnit({ ...args, stats: Object.keys(stats).length > 0 ? stats : undefined });
}
