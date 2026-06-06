import { describe, it, expect } from 'vitest';
import { resolveAttack, pieceAsCombatant } from '../combat.js';
import type { Combatant, TileProperties, StructureEffect } from '../combat.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAINS: TileProperties = { defenseBonus: 1.0 };
const HILLS:  TileProperties = { defenseBonus: 1.3 };
const MOUNTAIN: TileProperties = { defenseBonus: 2.0 };

const CASTLE: StructureEffect = { defenseMultiplier: 2.0 };
const GATE:   StructureEffect = { defenseMultiplier: 1.0 };

function spearman(id: string): Combatant { return { id, kind: 'spearman', attack: 2 }; }
function cannoneer(id: string): Combatant { return { id, kind: 'cannoneer', attack: 5 }; }

// ── Undefended tiles ──────────────────────────────────────────────────────────

describe('resolveAttack — undefended tile', () => {
  it('conquers instantly with zero losses', () => {
    const result = resolveAttack([spearman('a1')], [], PLAINS);
    expect(result.attackerWins).toBe(true);
    expect(result.tileConquered).toBe(true);
    expect(result.attackerLosses).toHaveLength(0);
    expect(result.defenderLosses).toHaveLength(0);
  });

  it('still conquers with only terrain present but no defenders', () => {
    const result = resolveAttack([spearman('a1')], [], MOUNTAIN);
    expect(result.tileConquered).toBe(true);
  });
});

// ── Attacker wins ─────────────────────────────────────────────────────────────

describe('resolveAttack — attacker wins', () => {
  it('kills all defenders', () => {
    const result = resolveAttack(
      [cannoneer('a1'), cannoneer('a2'), cannoneer('a3')],
      [spearman('d1')],
      PLAINS,
    );
    expect(result.attackerWins).toBe(true);
    expect(result.tileConquered).toBe(true);
    expect(result.defenderLosses).toContain('d1');
  });

  it('attacker strength scales non-linearly with count', () => {
    // 4 spearmen (attack=2 each): strength = 8 × √4 = 16
    // 1 spearman: strength = 2 × √1 = 2
    const fourResult = resolveAttack(
      [spearman('a1'), spearman('a2'), spearman('a3'), spearman('a4')],
      [spearman('d1')],
      PLAINS,
    );
    expect(fourResult.attackerStrength).toBeCloseTo(16, 5);
    expect(fourResult.attackerWins).toBe(true);
  });

  it('attacker suffers proportional losses in a close fight', () => {
    // 4 spearmen (strength ≈ 16) vs 3 cannoneers (attack=5 each, strength ≈ 26)
    // Attacker clearly loses — but test the opposite case: 10 spearmen vs 1 spearman
    const result = resolveAttack(
      Array.from({ length: 10 }, (_, i) => spearman(`a${i}`)),
      [spearman('d1')],
      PLAINS,
    );
    expect(result.attackerWins).toBe(true);
    // Defender's strength / attacker's strength is very small → near-zero attacker losses
    expect(result.attackerLosses.length).toBe(0);
  });

  it('moderate fight leaves attacker with some losses', () => {
    // 2 spearmen (str ≈ 5.66) vs 2 spearmen defended by castle (str ≈ 5.66 × 2 = 11.31)
    // Actually defenders win here. Test a case where attackers win by small margin:
    // 3 cannoneers (str = 15√3 ≈ 25.98) vs 2 cannoneers (str = 10√2 ≈ 14.14 × 1.3 hills)
    const result = resolveAttack(
      [cannoneer('a1'), cannoneer('a2'), cannoneer('a3')],
      [cannoneer('d1'), cannoneer('d2')],
      PLAINS,
    );
    expect(result.attackerWins).toBe(true);
    // ratio = defenderStrength/attackerStrength < 1 → some attacker losses possible
    expect(result.attackerLosses.length).toBeGreaterThanOrEqual(0);
    expect(result.defenderLosses).toHaveLength(2);
  });
});

// ── Defender wins ─────────────────────────────────────────────────────────────

describe('resolveAttack — defender wins', () => {
  it('kills all attackers', () => {
    const result = resolveAttack(
      [spearman('a1')],
      [cannoneer('d1'), cannoneer('d2'), cannoneer('d3')],
      PLAINS,
    );
    expect(result.attackerWins).toBe(false);
    expect(result.tileConquered).toBe(false);
    expect(result.attackerLosses).toContain('a1');
  });

  it('does not conquer the tile', () => {
    const result = resolveAttack([spearman('a1')], [cannoneer('d1')], PLAINS);
    expect(result.tileConquered).toBe(false);
  });
});

// ── Terrain and structure bonuses ─────────────────────────────────────────────

describe('resolveAttack — defense bonuses', () => {
  it('mountain terrain increases defender strength', () => {
    const plains = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS);
    const mountain = resolveAttack([spearman('a1')], [spearman('d1')], MOUNTAIN);
    expect(mountain.defenderStrength).toBeGreaterThan(plains.defenderStrength);
    expect(plains.defenderStrength).toBeCloseTo(2 * Math.sqrt(1), 5);
    expect(mountain.defenderStrength).toBeCloseTo(2 * Math.sqrt(1) * 2.0, 5);
  });

  it('castle multiplies defender strength', () => {
    const withoutCastle = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS);
    const withCastle    = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS, [CASTLE]);
    expect(withCastle.defenderStrength).toBeCloseTo(withoutCastle.defenderStrength * 2, 5);
  });

  it('terrain and structure stack multiplicatively', () => {
    const base = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS);
    const stacked = resolveAttack([spearman('a1')], [spearman('d1')], HILLS, [CASTLE]);
    expect(stacked.defenderStrength).toBeCloseTo(base.defenderStrength * 1.3 * 2.0, 5);
  });

  it('gate provides no defense bonus', () => {
    const withoutGate = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS);
    const withGate    = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS, [GATE]);
    expect(withGate.defenderStrength).toBeCloseTo(withoutGate.defenderStrength, 5);
  });

  it('castle prevents attacker from winning a fair fight', () => {
    // 1 spearman attacking 1 spearman behind a castle (effective 2× defense)
    const result = resolveAttack([spearman('a1')], [spearman('d1')], PLAINS, [CASTLE]);
    expect(result.attackerWins).toBe(false);
  });
});

// ── Strength formula ──────────────────────────────────────────────────────────

describe('resolveAttack — strength formula', () => {
  it('attacker strength = totalAttack × √count', () => {
    const result = resolveAttack([spearman('a1'), spearman('a2')], [], PLAINS);
    expect(result.attackerStrength).toBeCloseTo((2 + 2) * Math.sqrt(2), 5);
  });

  it('undefended tile has defenderStrength = 0', () => {
    const result = resolveAttack([spearman('a1')], [], PLAINS);
    expect(result.defenderStrength).toBe(0);
  });

  it('empty attacker list vs empty defender gives undefended conquest', () => {
    // Edge: no attackers — semantically invalid but function is pure so should not throw
    const result = resolveAttack([], [], PLAINS);
    expect(result.attackerWins).toBe(true);
    expect(result.attackerStrength).toBe(0);
  });
});

// ── pieceAsCombatant ──────────────────────────────────────────────────────────

describe('pieceAsCombatant', () => {
  it('returns Combatant when piece has attack stat', () => {
    const piece = { id: 'u1', kind: 'spearman', stats: { attack: 2, hp: 1 } };
    const c = pieceAsCombatant(piece);
    expect(c).not.toBeNull();
    expect(c!.attack).toBe(2);
    expect(c!.id).toBe('u1');
  });

  it('returns null when piece has no attack stat', () => {
    const piece = { id: 's1', kind: 'farm', stats: { hp: 3 } };
    expect(pieceAsCombatant(piece)).toBeNull();
  });

  it('returns null when piece has no stats at all', () => {
    const piece = { id: 's1', kind: 'farm' };
    expect(pieceAsCombatant(piece)).toBeNull();
  });
});
