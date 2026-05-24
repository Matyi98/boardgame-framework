import { AxialCoord, axialEquals } from './coordinate.js';

/**
 * An edge sits between two adjacent tiles. In Catan, roads live on edges.
 * Identity is order-independent (a–b ≡ b–a), captured by canonical ordering.
 */
export interface Edge {
  readonly id: string;
  readonly a: AxialCoord;
  readonly b: AxialCoord;
}

export function edgeId(a: AxialCoord, b: AxialCoord): string {
  // Canonical order so a-b and b-a have the same id.
  const [first, second] =
    a.q < b.q || (a.q === b.q && a.r < b.r) ? [a, b] : [b, a];
  return `${first.q},${first.r}|${second.q},${second.r}`;
}

export function edgeEquals(x: Edge, y: Edge): boolean {
  return (
    (axialEquals(x.a, y.a) && axialEquals(x.b, y.b)) ||
    (axialEquals(x.a, y.b) && axialEquals(x.b, y.a))
  );
}
