import { Turn } from './turn.js';

export interface Round {
  readonly roundNumber: number;
  readonly turns: ReadonlyArray<Turn>;
}
