/**
 * Single source of truth for player color + visual identity (UI refactor
 * backlog tickets #8, #17). Previously duplicated three times — once each in
 * KingdomsBoard.tsx, MilitaryPanel.tsx, and KingdomsPage.tsx — with no
 * guarantee they'd stay in sync.
 *
 * ── Why these specific hex values ──────────────────────────────────────────
 * The backend (game-runner.service.ts) assigns each seat a color KEY from a
 * fixed list — 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple' —
 * always in the same seat order. Those keys are internal identifiers, never
 * shown as text to players, so we're free to remap what hex value each key
 * resolves to on the frontend without touching the backend. The original
 * red/green pairing collides for the ~8% of players with deuteranopia or
 * protanopia (the two most common forms of red-green colorblindness); this
 * palette swaps to blue/orange/teal/magenta for the first four seats (the
 * scenario's actual max player count), keeping yellow/purple in reserve for
 * a hypothetical 5-6 player mode.
 *
 * ── Patterns ────────────────────────────────────────────────────────────────
 * Ownership should never depend on color alone. Each color key also gets a
 * distinct stroke-dasharray for tile ownership rings, so colorblind players
 * (or anyone on a washed-out monitor) can still tell owners apart by pattern.
 */

export const PLAYER_COLORS: Readonly<Record<string, string>> = {
  red:    '#4090d0', // seat 1 → blue
  blue:   '#e08020', // seat 2 → orange
  green:  '#20b0a0', // seat 3 → teal
  yellow: '#c050a0', // seat 4 → magenta
  orange: '#c8a030', // seat 5 (5-6p forward-compat) → yellow
  purple: '#8050c0', // seat 6 (5-6p forward-compat) → purple
};

/** SVG stroke-dasharray per color key — undefined/empty means a solid line. */
export const PLAYER_PATTERNS: Readonly<Record<string, string | undefined>> = {
  red:    undefined,    // solid ring
  blue:   '7 4',         // dashed ring
  green:  '1.5 3.5',      // dotted ring
  yellow: '8 2 2 2',      // dash-dot ring
  orange: '4 4',
  purple: '10 3',
};

export function playerColor(colorKey: string): string {
  return PLAYER_COLORS[colorKey] ?? '#888888';
}

export function playerPattern(colorKey: string): string | undefined {
  return PLAYER_PATTERNS[colorKey];
}
