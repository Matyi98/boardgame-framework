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
  /**
   * Numeric combat/economy statistics for this specific piece instance.
   * Populated at creation from PieceKindDefinition.defaultStats and may be
   * overridden per-instance (e.g. a veteran unit with boosted attack).
   * Typed as numbers because stats participate in math (resolveAttack, income).
   * Use `state` for non-numeric or mutable runtime data.
   */
  readonly stats?: Readonly<Record<string, number>>;
  /**
   * Mutable runtime state (current HP, movesLeft this turn, siege progress…).
   * Unlike stats, this is expected to change over the piece's lifetime.
   */
  readonly state?: Readonly<Record<string, unknown>>;
}
