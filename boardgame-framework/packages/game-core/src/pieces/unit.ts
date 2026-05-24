import { PlayerId } from '../players/player.js';
import { Piece, PieceLocation } from './piece.js';

/**
 * A unit. Lives on a tile (Risk-style armies / soldiers) by convention.
 * Units typically have movement and combat capability — see PieceBehavior.
 */
export interface Unit extends Piece {
  readonly location: Extract<PieceLocation, { kind: 'tile' }>;
}

export function makeUnit(args: {
  id: string;
  kind: string;
  owner: PlayerId;
  tileId: string;
  state?: Record<string, unknown>;
}): Unit {
  return {
    id: args.id,
    kind: args.kind,
    owner: args.owner,
    location: { kind: 'tile', tileId: args.tileId },
    ...(args.state ? { state: args.state } : {}),
  };
}
