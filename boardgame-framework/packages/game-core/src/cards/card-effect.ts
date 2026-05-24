import { Card } from './card.js';
import { GameEvent } from '../events/game-event.js';
import { PlayerId } from '../players/player.js';

/**
 * A card effect is what a card *does* when played. Effects are registered by
 * card kind. The engine looks up the effect for a played card and runs it,
 * receiving back the events it produced.
 *
 * NOTE: actual state-mutation type comes from `state/game-state.ts`.
 * Effects receive a mutable handle to the state; that's by design — the engine
 * calls them inside a transactional boundary.
 */
export interface CardEffectContext {
  readonly playedBy: PlayerId;
  readonly targets?: ReadonlyArray<string>;
}

export interface CardEffect<C extends Card = Card> {
  readonly forKind: string;
  apply(card: C, ctx: CardEffectContext): GameEvent[];
}

export class CardEffectRegistry {
  private readonly effects = new Map<string, CardEffect>();

  register(effect: CardEffect): this {
    if (this.effects.has(effect.forKind)) {
      throw new Error(`Effect for kind '${effect.forKind}' already registered`);
    }
    this.effects.set(effect.forKind, effect);
    return this;
  }

  get(kind: string): CardEffect | undefined { return this.effects.get(kind); }
}
