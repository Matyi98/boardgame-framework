/**
 * Coordinate systems for board maps.
 * - Axial: hex grids (q, r). Good for Catan-style maps.
 * - Cube: hex grids (x, y, z with x+y+z = 0). Better for some hex operations (distance, rotation).
 * - Offset: square grids (col, row).
 */

export interface AxialCoord {
  readonly q: number;
  readonly r: number;
}

export interface CubeCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OffsetCoord {
  readonly col: number;
  readonly row: number;
}

export const axial = (q: number, r: number): AxialCoord => ({ q, r });

export const axialToCube = (c: AxialCoord): CubeCoord => ({
  x: c.q,
  z: c.r,
  y: -c.q - c.r,
});

export const cubeToAxial = (c: CubeCoord): AxialCoord => ({ q: c.x, r: c.z });

export const axialEquals = (a: AxialCoord, b: AxialCoord): boolean =>
  a.q === b.q && a.r === b.r;

export const axialDistance = (a: AxialCoord, b: AxialCoord): number => {
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  return (Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) + Math.abs(ac.z - bc.z)) / 2;
};

/** The six neighbour directions in axial space. */
export const AXIAL_NEIGHBOURS: ReadonlyArray<AxialCoord> = [
  { q: +1, r:  0 }, { q: +1, r: -1 }, { q:  0, r: -1 },
  { q: -1, r:  0 }, { q: -1, r: +1 }, { q:  0, r: +1 },
];

export const axialNeighbours = (c: AxialCoord): AxialCoord[] =>
  AXIAL_NEIGHBOURS.map(d => ({ q: c.q + d.q, r: c.r + d.r }));
