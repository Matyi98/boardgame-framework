import { Card } from './card.js';

/** A player's hand. Add/remove individual cards; query by kind. */
export class Hand<C extends Card = Card> {
  private readonly cards: C[] = [];

  size(): number { return this.cards.length; }
  list(): ReadonlyArray<C> { return this.cards; }

  add(card: C): void { this.cards.push(card); }

  remove(cardId: string): C | undefined {
    const idx = this.cards.findIndex(c => c.id === cardId);
    if (idx < 0) return undefined;
    const [removed] = this.cards.splice(idx, 1);
    return removed;
  }

  countByKind(kind: string): number {
    return this.cards.filter(c => c.kind === kind).length;
  }
}
