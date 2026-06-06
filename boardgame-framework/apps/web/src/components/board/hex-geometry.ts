/** Pointy-top axial hex coordinate geometry utilities. */

export const HEX_SIZE = 62;

const SQRT3 = Math.sqrt(3);

export function hexCenter(q: number, r: number): [number, number] {
  const x = HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r);
  const y = HEX_SIZE * (1.5 * r);
  return [x, y];
}

export function hexCorners(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angleDeg = 60 * i - 30;
    const rad = (angleDeg * Math.PI) / 180;
    return `${cx + size * Math.cos(rad)},${cy + size * Math.sin(rad)}`;
  }).join(' ');
}

export const HEX_DIRS = [
  { q:  1, r:  0 }, { q: -1, r:  0 },
  { q:  0, r:  1 }, { q:  0, r: -1 },
  { q:  1, r: -1 }, { q: -1, r:  1 },
] as const;

/** SVG viewBox string that fits a 3-ring (37-tile) map at HEX_SIZE=62. */
export const BOARD_VIEWBOX = '-410 -370 820 740';
