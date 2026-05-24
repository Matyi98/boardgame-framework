import { AxialCoord, axialNeighbours, axialDistance } from './coordinate.js';

/** Hex-specific helpers. */
export const hexNeighbours = axialNeighbours;
export const hexDistance = axialDistance;

/** All hexes within `radius` of `centre`, including `centre` itself. */
export function hexesInRange(centre: AxialCoord, radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      out.push({ q: centre.q + dq, r: centre.r + dr });
    }
  }
  return out;
}
