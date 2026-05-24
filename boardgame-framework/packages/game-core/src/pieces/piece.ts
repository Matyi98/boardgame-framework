import { PlayerId } from '../players/player.js';

/** Where a piece can be placed. Different piece kinds care about different anchors. */
export type PieceLocation =
  | { kind: 'tile'; tileId: string }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'vertex'; vertexId: string };

/** Abstract piece. Identified by id; owns by player; lives somewhere on the map. */
export interface Piece {
  readonly id: string;
  /** Game-specific kind ('settlement', 'soldier', 'fort'...). Registered in PieceRegistry. */
  readonly kind: string;
  readonly owner: PlayerId;
  readonly location: PieceLocation;
  /** Free-form state (strength, health, level, etc.). */
  readonly state?: Readonly<Record<string, unknown>>;
}
