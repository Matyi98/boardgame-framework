/**
 * Direct unit tests for resolveAttack() and pieceAsCombatant().
 *
 * These tests exercise the pure framework function in isolation —
 * no scenario imports, no game state, no executors.
 *
 * Strategy: construct minimal Combatant arrays, pass explicit tile
 * and structure properties, and assert on CombatResult fields.
 */

import { describe, it, expect } from 'vitest';
import { resolveAttack, pieceAsCombatant } from '../../../rules/combat.js';
import type { Combatant, TileProperties, StructureEffect } from '../../../rules/combat.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

function c(id: string, attack: number): Combatant {
  return { id, kind: 'unit', attack };
}

const PLAINS:   TileProperties = { defenseBonus: 1.0 };
const HILLS:    TileProperties = { defenseBonus: 1.3 };
const FOREST:   TileProperties = { defenseBonus: 1.5 };
const MOUNTAIN: TileProperties = { defenseBonus: 2.0 };

const CASTLE: StructureEffect = { defenseMultiplier: 2.0 };

// RNG stubs for deterministic casualty selection
const MIN_RNG = { intInRange: (min: number, _max: number) => min };
const MAX_RNG = { intInRange: (_min: number, max: number) => max };

// ── resolveAttack — undefended tile ──────────────────────────────────────────

describe('resolveAttack — undefended tile (empty defenders)', () => {
  it('immediately conquers with no casualties on either side', () => {
    const result = resolveAttack([c('a1', 5)], [], PLAINS);
    expect(result.attackerWins).toBe(true);
    expect(result.tileConquered).toBe(true);
    expect(result.attackerLosses).toHaveLength(0);
    expect(result.defenderLosses).toHaveLength(0);
    expect(result.defenderStrength).toBe(0);
  });

  it('computes attacker strength correctly for undefended tile', () => {
    // 2 units, attack=3 each → strength = 6 × √2
    const result = resolveAttack([c('a1', 3), c('a2', 3)], [], PLAINS);
    expect(result.attackerStrength).toBeCloseTo(6 * Math.sqrt(2));
  });

  it('attacker strength is 0 when attacker list is empty (both empty = defender wins by default)', () => {
    // edge: 0 vs 0 — computeStrength([]) = 0; 0 is not > 0 → defender wins
    // This is a boundary case; the caller should never fire an empty vs empty attack
    const result = resolveAttack([], [], PLAINS);
    expect(result.attackerStrength).toBe(0);
    expect(result.defenderStrength).toBe(0);
    // Undefended branch triggers when defenders.length === 0
    expect(result.attackerWins).toBe(true);
  });
});

// ── resolveAttack — attacker wins ─────────────────────────────────────────────

describe('resolveAttack — attacker wins', () => {
  it('returns attackerWins=true, tileConquered=true', () => {
    // 3 cannoneers (atk=8) vs 1 spearman (atk=3) on plains
    // attackerStr ≈ 41.6  defenderStr = 3
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8)],
      [c('d1', 3)],
      PLAINS,
    );
    expect(result.attackerWins).toBe(true);
    expect(result.tileConquered).toBe(true);
  });

  it('all defenders die when attacker wins', () => {
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8)],
      [c('d1', 3), c('d2', 3), c('d3', 3)],
      PLAINS,
    );
    expect(result.defenderLosses).toContain('d1');
    expect(result.defenderLosses).toContain('d2');
    expect(result.defenderLosses).toContain('d3');
    expect(result.defenderLosses).toHaveLength(3);
  });

  it('zero attacker casualties in an overwhelming victory', () => {
    // ratio = 3 / 41.6 ≈ 0.072 → floor(3 × 0.072 × 0.5) = 0
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8)],
      [c('d1', 3)],
      PLAINS,
    );
    expect(result.attackerLosses).toHaveLength(0);
  });

  it('attacker takes partial casualties in a close victory', () => {
    // 4 cannoneers (str = 32√4 = 64) vs 3 cannoneers (str = 24√3 ≈ 41.6)
    // ratio = 41.6/64 ≈ 0.65 → floor(4 × 0.65 × 0.5) = floor(1.3) = 1 casualty
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8), c('a4', 8)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
      [],
      MIN_RNG,
    );
    expect(result.attackerWins).toBe(true);
    expect(result.attackerLosses).toHaveLength(1);
  });

  it('reports attacker and defender strengths correctly', () => {
    // 2 spearmen (atk=3) → str = 6√2 ≈ 8.49
    // 1 spearman  (atk=3) on plains → str = 3 × 1.0 = 3
    const result = resolveAttack([c('a1', 3), c('a2', 3)], [c('d1', 3)], PLAINS);
    expect(result.attackerStrength).toBeCloseTo(3 * 2 * Math.sqrt(2));
    expect(result.defenderStrength).toBeCloseTo(3);
  });
});

// ── resolveAttack — defender wins ─────────────────────────────────────────────

describe('resolveAttack — defender wins', () => {
  it('returns attackerWins=false, tileConquered=false', () => {
    // 1 spearman vs 3 cannoneers on plains → defender wins decisively
    const result = resolveAttack(
      [c('a1', 3)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
    );
    expect(result.attackerWins).toBe(false);
    expect(result.tileConquered).toBe(false);
  });

  it('all attackers die when defender wins', () => {
    const result = resolveAttack(
      [c('a1', 3), c('a2', 3)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
    );
    expect(result.attackerLosses).toContain('a1');
    expect(result.attackerLosses).toContain('a2');
    expect(result.attackerLosses).toHaveLength(2);
  });

  it('zero defender casualties in an overwhelming defensive victory', () => {
    // ratio = 3 / 41.6 ≈ 0.072 → floor(3 × 0.072 × 0.4) = 0
    const result = resolveAttack(
      [c('a1', 3)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
    );
    expect(result.defenderLosses).toHaveLength(0);
  });

  it('defender takes partial casualties in a close defeat', () => {
    // 3 cannoneers (str≈41.6) vs 4 cannoneers (str=64): defender wins
    // ratio = 41.6/64 ≈ 0.65 → floor(4 × 0.65 × 0.4) = floor(1.04) = 1 casualty
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8)],
      [c('d1', 8), c('d2', 8), c('d3', 8), c('d4', 8)],
      PLAINS,
      [],
      MIN_RNG,
    );
    expect(result.attackerWins).toBe(false);
    expect(result.defenderLosses).toHaveLength(1);
  });

  it('equal strength resolves in favour of defender (not strictly greater)', () => {
    // 1 unit (atk=5) vs 1 unit (atk=5) on plains:
    // attackerStr = 5, defenderStr = 5 × 1.0 = 5 → 5 is NOT > 5 → defender wins
    const result = resolveAttack([c('a1', 5)], [c('d1', 5)], PLAINS);
    expect(result.attackerWins).toBe(false);
    expect(result.attackerLosses).toContain('a1');
  });
});

// ── resolveAttack — terrain defense bonus ─────────────────────────────────────

describe('resolveAttack — terrain defense bonus', () => {
  it('plains applies no bonus (defenseBonus=1.0)', () => {
    const result = resolveAttack([c('a1', 8), c('a2', 8)], [c('d1', 3)], PLAINS);
    expect(result.defenderStrength).toBeCloseTo(3 * 1.0);
  });

  it('hills applies 1.3× to defender strength', () => {
    const result = resolveAttack([c('a1', 3)], [c('d1', 3)], HILLS);
    expect(result.defenderStrength).toBeCloseTo(3 * 1.3);
  });

  it('forest applies 1.5× to defender strength', () => {
    const result = resolveAttack([c('a1', 3)], [c('d1', 3)], FOREST);
    expect(result.defenderStrength).toBeCloseTo(3 * 1.5);
  });

  it('mountain doubles defender strength (2.0×)', () => {
    const result = resolveAttack([c('a1', 3)], [c('d1', 3)], MOUNTAIN);
    expect(result.defenderStrength).toBeCloseTo(3 * 2.0);
  });

  it('terrain bonus can swing a would-be attacker-win into a defender-win', () => {
    // 2 spearmen (str≈8.49) vs 2 spearmen on plains (str≈8.49): defender wins (tie)
    // On mountain: defender str = 8.49 × 2.0 ≈ 16.97 → decisive defender win
    const plains = resolveAttack([c('a1', 3), c('a2', 3)], [c('d1', 3), c('d2', 3)], PLAINS);
    const mountain = resolveAttack([c('a1', 3), c('a2', 3)], [c('d1', 3), c('d2', 3)], MOUNTAIN);
    expect(plains.attackerWins).toBe(false);   // tie → defender wins
    expect(mountain.attackerWins).toBe(false);
    // defenderStrength is twice as large on mountain
    expect(mountain.defenderStrength).toBeCloseTo(plains.defenderStrength * 2.0);
  });
});

// ── resolveAttack — structure defense multiplier ──────────────────────────────

describe('resolveAttack — structure defense multiplier', () => {
  it('castle (×2.0) doubles defender strength on plains', () => {
    const result = resolveAttack([c('a1', 5)], [c('d1', 5)], PLAINS, [CASTLE]);
    expect(result.defenderStrength).toBeCloseTo(5 * 1.0 * 2.0);
  });

  it('empty structures array has no effect', () => {
    const withStructures = resolveAttack([c('a1', 8)], [c('d1', 5)], PLAINS, []);
    const withoutStructures = resolveAttack([c('a1', 8)], [c('d1', 5)], PLAINS);
    expect(withStructures.defenderStrength).toBeCloseTo(withoutStructures.defenderStrength);
  });

  it('terrain and structure bonuses stack multiplicatively', () => {
    // defender (atk=5) on mountain (×2.0) with castle (×2.0) → str = 5 × 2.0 × 2.0 = 20
    const result = resolveAttack([c('a1', 5)], [c('d1', 5)], MOUNTAIN, [CASTLE]);
    expect(result.defenderStrength).toBeCloseTo(5 * 2.0 * 2.0);
  });

  it('two stacked structure effects multiply together', () => {
    // Two castles: ×2.0 × ×2.0 = ×4.0
    const result = resolveAttack([c('a1', 5)], [c('d1', 5)], PLAINS, [CASTLE, CASTLE]);
    expect(result.defenderStrength).toBeCloseTo(5 * 1.0 * 4.0);
  });
});

// ── resolveAttack — RNG casualty selection ────────────────────────────────────

describe('resolveAttack — RNG casualty selection (Fisher-Yates)', () => {
  // Scenario: 4 cannoneers (str=64) vs 3 cannoneers (str≈41.6)
  // Attacker wins with 1 casualty (floor(4 × ratio × 0.5) = 1)

  it('MIN_RNG: swap(i, i) is a no-op → first element selected', () => {
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8), c('a4', 8)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
      [],
      MIN_RNG,
    );
    expect(result.attackerLosses).toEqual(['a1']);
  });

  it('MAX_RNG: swap(0, last) → last element moved to front → selected', () => {
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8), c('a4', 8)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
      [],
      MAX_RNG,
    );
    expect(result.attackerLosses).toEqual(['a4']);
  });

  it('without rng defaults to deterministic slice (picks first element)', () => {
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8), c('a4', 8)],
      [c('d1', 8), c('d2', 8), c('d3', 8)],
      PLAINS,
    );
    expect(result.attackerLosses).toEqual(['a1']); // no RNG → slice(0, 1)
  });

  it('defender casualty selection obeys the same Fisher-Yates logic', () => {
    // Defender wins: 3 cannoneers (str≈41.6) vs 4 cannoneers (str=64)
    // ratio = 41.6/64 ≈ 0.65 → floor(4 × 0.65 × 0.4) = 1 defender casualty
    // MIN_RNG → first defender selected
    const result = resolveAttack(
      [c('a1', 8), c('a2', 8), c('a3', 8)],
      [c('d1', 8), c('d2', 8), c('d3', 8), c('d4', 8)],
      PLAINS,
      [],
      MIN_RNG,
    );
    expect(result.attackerWins).toBe(false);
    expect(result.defenderLosses).toEqual(['d1']);
  });
});

// ── pieceAsCombatant ──────────────────────────────────────────────────────────

describe('pieceAsCombatant', () => {
  it('returns null for a piece with no stats at all', () => {
    expect(pieceAsCombatant({ id: 'gate1', kind: 'gate' })).toBeNull();
  });

  it('returns null for a piece with empty stats', () => {
    expect(pieceAsCombatant({ id: 'farm1', kind: 'farm', stats: {} })).toBeNull();
  });

  it('returns null for a piece whose stats lack an attack key', () => {
    expect(pieceAsCombatant({ id: 'city1', kind: 'city', stats: { foodPerRound: 2, hp: 4 } })).toBeNull();
  });

  it('returns a valid Combatant with the correct id and attack', () => {
    const piece = { id: 'sp1', kind: 'spearman', stats: { attack: 3, foodPerRound: 1 } };
    const combatant = pieceAsCombatant(piece);
    expect(combatant).not.toBeNull();
    expect(combatant!.id).toBe('sp1');
    expect(combatant!.kind).toBe('spearman');
    expect(combatant!.attack).toBe(3);
  });

  it('returns a Combatant even when attack stat is 0 (not undefined)', () => {
    // Explicitly zero attack is a valid stat — the check is `=== undefined`, not falsy
    const piece = { id: 'pacifist', kind: 'noble', stats: { attack: 0 } };
    const combatant = pieceAsCombatant(piece);
    expect(combatant).not.toBeNull();
    expect(combatant!.attack).toBe(0);
  });

  it('ignores non-attack stats that are present alongside attack', () => {
    const piece = { id: 'cn1', kind: 'cannoneer', stats: { attack: 8, defense: 2, hp: 6 } };
    const combatant = pieceAsCombatant(piece);
    expect(combatant!.attack).toBe(8);
  });
});
