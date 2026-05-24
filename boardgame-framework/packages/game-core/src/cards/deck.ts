import { Card } from './card.js';
import { RandomSource } from '../dice/random.js';

/**
 * A deck of cards. Draws come off the top; discards stack on a separate pile.
 * Uses an injected RandomSource so shuffles are deterministic when seeded.
 */
export class Deck<C extends Card = Card> {
  private readonly drawPile: C[];
  private readonly discardPile: C[] = [];

  constructor(cards: ReadonlyArray<C>) {
    this.drawPile = [...cards];
  }

  size(): number { return this.drawPile.length; }
  discardSize(): number { return this.discardPile.length; }
  isEmpty(): boolean { return this.drawPile.length === 0; }

  shuffle(rng: RandomSource): void {
    // Fisher–Yates
    for (let i = this.drawPile.length - 1; i > 0; i--) {
      const j = rng.intInRange(0, i);
      const tmp = this.drawPile[i];
      const other = this.drawPile[j];
      // Both indices are guaranteed valid by the loop bounds.
      this.drawPile[i] = other!;
      this.drawPile[j] = tmp!;
    }
  }

  draw(): C | undefined {
    return this.drawPile.shift();
  }

  discard(card: C): void {
    this.discardPile.push(card);
  }

  /** Move discards back into the draw pile (call shuffle afterwards). */
  recycleDiscards(): void {
    this.drawPile.push(...this.discardPile);
    this.discardPile.length = 0;
  }
}
