/**
 * Centralized user-facing copy for Kingdoms of Dominion (UI refactor backlog
 * ticket #5). This is the rules-sensitive subset — anything that describes a
 * mechanic, a number, or a "why can't I do this" reason. Generic UI labels
 * ("cancel", "Send →") aren't worth centralizing; they never drift from the
 * rules engine. Everything in here SHOULD be checked against
 * docs/kingdoms/04-how-to-play.md whenever a rule changes.
 *
 * Import from here instead of inlining strings in components — that's the
 * whole point: one place to fix when the rules change, instead of grepping
 * across ActionPanel/KingdomsBoard/KingdomsPage for stale copy.
 */

// ── Icons ──────────────────────────────────────────────────────────────────────
// De-duplicated: these used to be defined separately (and slightly out of
// sync) in ActionPanel.tsx, MilitaryPanel.tsx, and KingdomsBoard.tsx.

export const UNIT_ICONS: Readonly<Record<string, string>> = {
  spearman: '🗡',
  cannoneer: '💣',
  noble: '♛',
};

// Ticket #11 icon audit: farm previously shared 🌾 with the food resource
// icon (RESOURCE_TYPE_META in ActionPanel.tsx) — they render side by side in
// the tile info / build panel for any food tile with a farm on it, so the
// identical glyph made them indistinguishable. City's 🏰⛪ pairing also read
// oddly (a church isn't a city); swapped for a civic building distinct from
// Castle's fortress.
export const STRUCTURE_ICONS: Readonly<Record<string, string>> = {
  farm: '🚜',
  city: '🏛',
  castle: '🏰',
  gate: '⛩',
};

export const ALL_PIECE_ICONS: Readonly<Record<string, string>> = { ...UNIT_ICONS, ...STRUCTURE_ICONS };

export interface PieceInfo {
  readonly label: string;
  readonly desc: string;
  readonly stats: string;
}

export const PIECE_INFO: Readonly<Record<string, PieceInfo>> = {
  spearman: {
    label: 'Spearman',
    desc: 'Basic infantry. Can attack adjacent enemy or unowned tiles. Cheap to mass-produce.',
    stats: 'ATK 3 · DEF 5 · MOV 1 · 🌾1/round',
  },
  cannoneer: {
    label: 'Cannoneer',
    desc: 'Heavy artillery with devastating attack power. Slow but deadly. High food upkeep.',
    stats: 'ATK 8 · DEF 2 · MOV 1 · 🌾2/round',
  },
  noble: {
    label: 'Noble',
    desc: 'Attack any tile you don\'t own — unowned or enemy — with a Noble in the force to erode its loyalty by 45 (starts at 100) if it survives. Reaching 0 captures it for you; raw combat alone never captures. Loyalty recovers +10 every round. Each additional Noble costs significantly more.',
    stats: 'ATK 1 · DEF 3 · MOV any own tile · 🌾1/round',
  },
  farm: {
    label: 'Farm',
    desc: 'Boosts resource output on this tile by 50%. Best built on tiles with food, wood, or iron resources.',
    stats: 'Resource ×1.5/round · No food upkeep',
  },
  city: {
    label: 'City',
    desc: 'Doubles gold income from this tile and enables recruiting units here.',
    stats: '🪙 ×2/round · 🌾2/round upkeep',
  },
  castle: {
    label: 'Castle',
    desc: 'Military fortification that doubles the tile\'s defense multiplier — very hard to capture.',
    stats: 'DEF ×2.0',
  },
  gate: {
    label: 'Gate',
    desc: 'Supply bridge. Tiles on the far side of a Gate count as connected to your capital, extending your supply lines.',
    stats: 'Extends supply line · No upkeep',
  },
};

export const KINGDOMS_STRINGS = {
  // ── Mode headers (ActionPanel) ──────────────────────────────────────────
  modeHeaders: {
    attack: '⚔ ATTACK MODE — click enemy tile on map',
    attackSelect: '⚔ CHOOSE ATTACKING UNITS',
    sendTroopsWaiting: '📦 SEND TROOPS — click your destination tile',
    sendTroopsSelect: '📦 SEND TROOPS',
  },

  // ── Attack-select mode (ActionPanel) ────────────────────────────────────
  attackSelect: {
    loyaltyNote: 'a surviving Noble erodes loyalty — only way to capture',
    noSelectionUnowned: 'select at least one unit',
    noSelectionEnemy: 'select at least one non-Noble unit',
    noUnitsAvailable: 'no units available',
    confirmButton: '⚔ Attack →',
  },

  // ── Why the attack option isn't showing (ActionPanel) ──────────────────
  // Priority order matters: "already attacked" must come first since it's
  // the only reason that's never misleading (see ActionPanel.tsx comment).
  attackUnavailable: {
    alreadyAttacked: 'already attacked this turn',
    noUnitUnowned: 'No unit available to attack from an adjacent tile (any unit works against unowned tiles)',
    noUnitEnemy: 'No non-Noble unit available to attack from an adjacent tile',
    notAdjacent: 'Not adjacent to any of your tiles — move units closer first',
  },

  // ── Send troops (ActionPanel) ───────────────────────────────────────────
  sendTroops: {
    noMovableUnits: 'no movable units on this tile',
  },

  // ── Occupation / loyalty badge (ActionPanel) ────────────────────────────
  occupation: {
    /** capturedPct, remainingLoyalty */
    badge: (capturedPct: number, remainingLoyalty: number) =>
      `♛ ${capturedPct}% seized — loyalty ${remainingLoyalty}% remaining (captures at 0%)`,
  },

  // ── Board legend (KingdomsPage) ─────────────────────────────────────────
  legend: {
    units: '🗡=spearman 💣=cannoneer ♛=noble',
    structures: '🚜=farm 🏛=city 🏰=castle ⛩=gate ★=capital',
    loyaltyRule: "A surviving Noble's attack erodes any tile's loyalty by 45% (unowned or enemy) · recovers +10%/round · 0% = captured",
  },

  // ── Resource bar (KingdomsPage) ─────────────────────────────────────────
  // foodBlocked fires on the TRUE blocking condition (food stockpile === 0,
  // per §10 of the rules doc) — not on a routine negative per-round food
  // delta, which is normal early-game and shouldn't read as an alarm (ticket #26).
  resourceBar: {
    foodBlocked: '⚠ out of food — recruiting blocked until it recovers',
    /** resource label, current amount, projected per-round delta */
    tooltip: (label: string, amount: number, delta: number) =>
      `${label}: ${amount} (${delta >= 0 ? '+' : ''}${delta}/round)`,
  },

  // ── Client-side cancellation toasts (KingdomsPage) ──────────────────────
  // These fire on invalid clicks the client catches before even asking the
  // server — distinct from server-rejected actions, which surface through
  // the generic error toast with whatever message the engine returns.
  cancellation: {
    attackInvalidTarget: 'Attack cancelled — that tile is not a valid target',
    sendTroopsInvalidDestination: 'Send Troops cancelled — destination must be one of your own tiles',
  },

  // ── Combat toast for uninvolved players (KingdomsPage) ──────────────────
  combatToast: {
    won: 'won an attack',
    repelled: 'was repelled attacking',
    unownedTarget: 'an unowned tile',
    /** defenderName */
    enemyTarget: (defenderName: string) => `${defenderName}'s tile`,
  },

  // ── Turn / winner / loading (KingdomsPage) ──────────────────────────────
  turn: {
    yours: '▶ YOUR TURN',
    isPlaying: 'is playing',
  },
  winner: {
    /** winnerName */
    wins: (winnerName: string) => `${winnerName} wins!`,
    draw: 'Draw!',
  },
  loading: {
    connecting: 'connecting to game…',
  },

  // ── Persistent rules reference (ticket #42) ─────────────────────────────
  // The full picture lives in docs/kingdoms/04-how-to-play.md — this is the
  // condensed in-game version, reachable any time via the ❓ button instead
  // of only ever showing up as a single footer line under the board.
  rules: {
    sections: [
      {
        title: 'Turns & rounds',
        body: 'On your turn, do any number of actions in any order — recruit, build, move, attack, develop, demolish — then end your turn. A round completes once everyone has gone; income and food upkeep resolve once per round, not every turn. One attack per turn, no matter which tile it comes from.',
      },
      {
        title: 'Combat',
        body: 'Strength = (sum of attack stats) × √(unit count) × terrain bonus × structure bonus for the defender. Pick which units join an attack; the defender fights with everything on the tile. The loser is wiped out; the winner takes some casualties if it was close. An undefended tile is an automatic win.',
      },
      {
        title: 'Capture & loyalty — the part that surprises people',
        body: "Winning a fight never captures the tile by itself. Every tile you don't own has hidden loyalty starting at 100. A surviving Noble in your attacking force erodes it by 45 — three Noble-led wins (100→55→10→captured) takes any tile, unowned or enemy, including a Capital. If the Noble dies, loyalty is untouched. It recovers +10 every round regardless of attacks, so sporadic pressure stalls out — you need sustained attacks to actually take ground.",
      },
      {
        title: 'Economy',
        body: 'Only tiles connected to your Capital produce income or can be built on. Gold converts to Wood/Food/Iron automatically at 3:1 when you\'re short on food. Units are never disbanded for unpaid upkeep — an empty food stockpile just blocks recruiting until it recovers.',
      },
      {
        title: 'Winning',
        body: 'Capturing a Capital eliminates that player instantly — their pieces are removed and their other tiles become unowned. Last kingdom standing wins.',
      },
    ],
  },
} as const;
