import { PlayerColor } from './player-color.js';

export type PlayerId = string;

export interface Player {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly color: PlayerColor;
  /** Seat index at the table. Drives turn order. */
  readonly seat: number;
  /**
   * Runtime lifecycle status. Default 'active'. Set to 'eliminated' by
   * PlayerManager.eliminate() when the player's Capital Base falls (or any
   * other scenario-defined elimination condition).
   *
   * TurnOrder implementations filter out eliminated players so they are
   * automatically skipped. Optional so lobby-created Player objects (which
   * don't carry a status yet) still satisfy the type.
   */
  status?: 'active' | 'eliminated';
}
