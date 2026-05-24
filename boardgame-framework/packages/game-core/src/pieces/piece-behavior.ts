import { Piece } from './piece.js';

/**
 * Strategy interface for piece behaviour. Composable — a piece can have
 * multiple behaviours layered on it (e.g. movable + attacking + healing).
 *
 * Implementations live in the concrete game, not in the framework.
 */
export interface PieceBehavior {
  readonly id: string;
  /** Does this behaviour apply to the given piece in the current state? */
  appliesTo(piece: Piece): boolean;
}

export interface MovableBehavior extends PieceBehavior {
  /** Maximum range per turn, expressed in adjacency steps. */
  range(piece: Piece): number;
}

export interface AttackingBehavior extends PieceBehavior {
  attackDice(piece: Piece): number;
}

export interface UpgradeableBehavior extends PieceBehavior {
  /** Kind to upgrade to (e.g. settlement → city). Null if cannot upgrade. */
  upgradeTarget(piece: Piece): string | null;
}
