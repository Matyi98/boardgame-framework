/**
 * Pure combat resolver. No framework imports — just math and plain types.
 * This isolation means:
 *   (a) trivially unit-testable
 *   (b) safe to run client-side for "preview attack" UX in the future
 *
 * Formula: strength = Σ(unit.attack) × √(unitCount) × defenseModifier
 *
 * The √(unitCount) factor models that massed armies are more effective than
 * the sum of individuals (coordination, flanking, morale). Doubling unit count
 * doesn't double strength — it multiplies by ~1.4x. This makes quality (attack
 * value) matter more than pure numbers.
 */

export interface CombatUnit {
  id: string;
  kind: string;
  attack: number;
}

export interface CombatResult {
  attackerWins: boolean;
  attackerStrength: number;
  defenderStrength: number;
  /** IDs of defending pieces killed. Empty if defender wins. */
  killedDefenderIds: string[];
  /** IDs of attacking pieces killed. Empty if attacker wins cleanly. */
  killedAttackerIds: string[];
}

/**
 * Resolve a battle.
 *
 * @param attackers   — units attacking from the aggressor's tile
 * @param defenders   — units defending (may be empty for undefended tiles)
 * @param defenseBonus — composite multiplier: terrain.defenseBonus × structure.defenseMultiplier
 */
export function resolveAttack(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
  defenseBonus: number,
): CombatResult {
  const attackTotal = attackers.reduce((s, u) => s + u.attack, 0);
  const defendTotal = defenders.reduce((s, u) => s + u.attack, 0);

  const attackerStrength = attackTotal * Math.sqrt(Math.max(1, attackers.length));
  const defenderStrength = defendTotal * Math.sqrt(Math.max(1, defenders.length)) * defenseBonus;

  if (defenders.length === 0 || attackerStrength > defenderStrength) {
    // Attacker wins. Defenders all die. Attacker loses a fraction proportional to
    // how close the fight was. Even overwhelming victories cost something.
    const ratio = defenderStrength > 0 ? defenderStrength / attackerStrength : 0;
    const attackerLossFraction = ratio * 0.5;
    const attackerCasualtyCount = Math.floor(attackers.length * attackerLossFraction);

    return {
      attackerWins: true,
      attackerStrength,
      defenderStrength,
      killedDefenderIds: defenders.map((u) => u.id),
      killedAttackerIds: attackers.slice(0, attackerCasualtyCount).map((u) => u.id),
    };
  } else {
    // Defender wins. All attackers die. Defenders lose a fraction.
    const ratio = attackerStrength / defenderStrength;
    const defenderCasualtyCount = Math.floor(defenders.length * ratio * 0.4);

    return {
      attackerWins: false,
      attackerStrength,
      defenderStrength,
      killedDefenderIds: defenders.slice(0, defenderCasualtyCount).map((u) => u.id),
      killedAttackerIds: attackers.map((u) => u.id),
    };
  }
}
