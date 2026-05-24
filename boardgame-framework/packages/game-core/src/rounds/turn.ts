import { PlayerId } from '../players/player.js';

export interface Turn {
  readonly turnNumber: number;
  readonly activePlayer: PlayerId;
  readonly currentPhaseId: string;
  /** Per-turn flags: has the player rolled? built? traded? */
  readonly flags: Readonly<Record<string, boolean>>;
}
