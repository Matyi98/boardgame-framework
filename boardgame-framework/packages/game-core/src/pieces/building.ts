import { PlayerId } from '../players/player.js';
import { Piece, PieceLocation } from './piece.js';

/**
 * A building. Lives on a vertex (Catan-style settlements / cities) by convention.
 * Concrete games extend with their own kinds via the registry.
 */
export interface Building extends Piece {
  readonly location: Extract<PieceLocation, { kind: 'vertex' }>;
}

export function makeBuilding(args: {
  id: string;
  kind: string;
  owner: PlayerId;
  vertexId: string;
  state?: Record<string, unknown>;
}): Building {
  return {
    id: args.id,
    kind: args.kind,
    owner: args.owner,
    location: { kind: 'vertex', vertexId: args.vertexId },
    ...(args.state ? { state: args.state } : {}),
  };
}
