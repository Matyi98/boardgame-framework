/**
 * Kingdoms-specific connectivity helpers.
 *
 * This module is a thin wrapper over the framework-level BFS utility
 * (utils/connectivity.ts). It adds:
 *
 *   - playerOwnedTiles()   — builds an owned-tile set from k:ownership
 *   - playerGateTileIds()  — finds tiles that carry a Gate structure for a player
 *
 * Strategy note: income only flows from tiles connected to the capital through
 * contiguous owned territory. A Gate structure on an owned tile extends that
 * connectivity one hop through an adjacent unowned tile. Cutting an opponent's
 * supply line (by conquering a tile between their capital and their farms/cities)
 * is as valuable as direct military conquest.
 *
 * Always call getConnectedTiles() fresh — never cache. ADR-005.
 */

import type { GameState } from '../../state/game-state.js';
import type { GameMap } from '../../map/game-map.js';
import { getConnectedTiles as frameworkGetConnectedTiles, isConnected } from '../../utils/connectivity.js';

// Re-export isConnected so validators import from one place.
export { isConnected };

// Re-export the framework BFS under the same name so existing callers in
// income.ts and tests don't need to change their import path.
export { frameworkGetConnectedTiles as getConnectedTiles };

// ── Scenario-specific helpers ─────────────────────────────────────────────────

/** Build an owned-tile set for one player from the k:ownership extra. */
export function playerOwnedTiles(
  ownership: Record<string, string>,
  playerId: string,
): Set<string> {
  return new Set(
    Object.entries(ownership)
      .filter(([, owner]) => owner === playerId)
      .map(([id]) => id),
  );
}

/**
 * Returns tile IDs where a Gate structure owned by the given player is located.
 *
 * These are passed to getConnectedTiles() as bridgeTileIds so that Gates extend
 * connectivity through one adjacent unowned tile.
 */
export function playerGateTileIds(state: GameState, playerId: string): Set<string> {
  const result = new Set<string>();
  for (const [, piece] of state.pieces) {
    if (piece.kind !== 'gate' || piece.owner !== playerId) continue;
    if (piece.location.kind !== 'tile') continue;
    result.add((piece.location as { kind: 'tile'; tileId: string }).tileId);
  }
  return result;
}

/**
 * Build the full connected-tile set for a player, Gate bridges included.
 *
 * Convenience wrapper used by income.ts and action validators so they don't
 * need to assemble the three inputs themselves.
 */
export function playerConnectedTiles(
  map: GameMap,
  state: GameState,
  playerId: string,
): Set<string> {
  const ownership = (state.extras['k:ownership'] as Record<string, string>) ?? {};
  const capitals  = (state.extras['k:capitals']  as Record<string, string>) ?? {};
  const capitalId = capitals[playerId];
  if (!capitalId) return new Set();

  const owned = playerOwnedTiles(ownership, playerId);
  const gates = playerGateTileIds(state, playerId);
  return frameworkGetConnectedTiles(map, capitalId, owned, gates);
}
