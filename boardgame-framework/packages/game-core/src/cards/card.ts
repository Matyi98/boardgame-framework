/**
 * Abstract card. Concrete games extend with specific card shapes.
 * The 'kind' discriminator lets effects switch on what to do.
 */
export interface Card {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly description?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}
