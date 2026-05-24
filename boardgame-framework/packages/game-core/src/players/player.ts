import { PlayerColor } from './player-color.js';

export type PlayerId = string;

export interface Player {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly color: PlayerColor;
  /** Seat index at the table. Drives turn order. */
  readonly seat: number;
}
