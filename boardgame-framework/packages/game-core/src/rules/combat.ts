/**
 * Framework-level combat resolution. Pure functions only — no I/O, no state
 * mutation, no scenario-specific imports. Any scenario can import and use this.
 *
 * Design decisions:
 * ─────────────────
 * • Deterministic: given the same inputs the function always returns the same
 *   result. Probabilistic elements (e.g. random casualty selection) must be
 *   supplied via a seeded RNG passed in by the caller (reserved for Step 8
 *   extensions).
 *
 * • Non-linear scaling: strength = Σ(attack) × √(count) × modifiers.
 *   Four spearmen are not 4× as strong as one — they are ~2× (√4). This
 *   makes quality (attack value) matter more than raw numbers and prevents
 *   "zerg rush" dominance. See docs/kingdoms/02-adr.md ADR-004.
 *
 * • Framework-level types (Combatant, TileProperties, StructureEffect) are
 *   intentionally generic — they carry only what the formula needs, not
 *   scenario-specific fields.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The minimal representation of any unit participating in a battle.
 * Constructed from Piece + Piece.stats['attack'] by the calling executor.
 */
export interface Combatant {
  /** Piece ID — used to identify which specific pieces were lost. */
  readonly id: string;
  /** Piece kind ('spearman', 'cannoneer', …) — informational, not used in formula. */
  readonly kind: string;
  /** Attack value. Read from Piece.stats['attack'] or a scenario constant. */
  readonly attack: number;
}

/** Properties of the defending tile that affect combat strength. */
export interface TileProperties {
  /**
   * Terrain defense multiplier. Applied to the defender's side only.
   * 1.0 = no bonus (plains), 2.0 = double defense (mountain).
   */
  readonly defenseBonus: number;
}

/** Combat effect contributed by a structure on the defending tile. */
export interface StructureEffect {
  /**
   * Additional defense multiplier. Stacks multiplicatively with terrain bonus.
   * 1.0 = no effect, 2.0 = castle (doubles defenders).
   */
  readonly defenseMultiplier: number;
}

export interface CombatResult {
  readonly attackerWins: boolean;
  /** Raw computed strength of the attacking force. */
  readonly attackerStrength: number;
  /** Raw computed strength of the defending force (including terrain + structures). */
  readonly defenderStrength: number;
  /**
   * IDs of attacker pieces killed.
   * Empty when attacker wins cleanly; some losses even in victory when the
   * fight is close (proportional to defenderStrength / attackerStrength).
   */
  readonly attackerLosses: ReadonlyArray<string>;
  /**
   * IDs of defender pieces killed.
   * All defenders die when the attacker wins. Partial casualties when defender wins.
   */
  readonly defenderLosses: ReadonlyArray<string>;
  /** True when all defenders were eliminated and the tile should change ownership. */
  readonly tileConquered: boolean;
}

// ── Pure helper ───────────────────────────────────────────────────────────────

function computeStrength(combatants: ReadonlyArray<Combatant>): number {
  if (combatants.length === 0) return 0;
  const totalAttack = combatants.reduce((sum, c) => sum + c.attack, 0);
  return totalAttack * Math.sqrt(combatants.length);
}

function compositeDefenseBonus(
  tile: TileProperties,
  structures: ReadonlyArray<StructureEffect>,
): number {
  const structureMultiplier = structures.reduce((acc, s) => acc * s.defenseMultiplier, 1.0);
  return tile.defenseBonus * structureMultiplier;
}

// ── resolveAttack ─────────────────────────────────────────────────────────────

/**
 * Resolve a battle between attacker and defender forces.
 *
 * @param attackers  — units attacking (all on the same tile)
 * @param defenders  — units defending (may be empty for undefended tiles)
 * @param tile       — properties of the defending tile (terrain defense bonus)
 * @param structures — structures on the defending tile (castle defense multiplier, etc.)
 *
 * @returns CombatResult with winner, piece IDs killed, and whether tile is conquered
 */
export function resolveAttack(
  attackers: ReadonlyArray<Combatant>,
  defenders: ReadonlyArray<Combatant>,
  tile: TileProperties,
  structures: ReadonlyArray<StructureEffect> = [],
): CombatResult {
  const attackerStrength = computeStrength(attackers);
  const defenseMultiplier = compositeDefenseBonus(tile, structures);
  const defenderStrength = computeStrength(defenders) * defenseMultiplier;

  // Undefended tile: immediate conquest, zero casualties
  if (defenders.length === 0) {
    return {
      attackerWins: true,
      attackerStrength,
      defenderStrength: 0,
      attackerLosses: [],
      defenderLosses: [],
      tileConquered: true,
    };
  }

  if (attackerStrength > defenderStrength) {
    // Attacker wins. All defenders die.
    // Attacker casualties scale with how hard the fight was: the closer the
    // strength ratio, the more they lose (capped at 50% of the attacking force).
    const ratio = defenderStrength / attackerStrength;
    const casualtyCount = Math.floor(attackers.length * ratio * 0.5);
    return {
      attackerWins: true,
      attackerStrength,
      defenderStrength,
      attackerLosses: attackers.slice(0, casualtyCount).map((c) => c.id),
      defenderLosses: defenders.map((c) => c.id),
      tileConquered: true,
    };
  } else {
    // Defender wins. All attackers die.
    // Defender casualties: proportional to how close the fight was.
    const ratio = attackerStrength / defenderStrength;
    const casualtyCount = Math.floor(defenders.length * ratio * 0.4);
    return {
      attackerWins: false,
      attackerStrength,
      defenderStrength,
      attackerLosses: attackers.map((c) => c.id),
      defenderLosses: defenders.slice(0, casualtyCount).map((c) => c.id),
      tileConquered: false,
    };
  }
}

// ── Convenience helper ────────────────────────────────────────────────────────

/** Extract a Combatant from a Piece if it has an 'attack' stat. */
export function pieceAsCombatant(piece: {
  id: string;
  kind: string;
  stats?: Readonly<Record<string, number>>;
}): Combatant | null {
  const attack = piece.stats?.['attack'];
  if (attack === undefined) return null;
  return { id: piece.id, kind: piece.kind, attack };
}
