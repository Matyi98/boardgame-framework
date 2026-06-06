# rules/ — Framework Combat and Victory

Pure, framework-level rule utilities. Nothing here imports a scenario; scenarios import this.

## Files

| File | Purpose |
|------|---------|
| `combat.ts` | `resolveAttack()` — pure combat resolver |
| `victory-condition.ts` | `VictoryCondition` interface |
| `rule-engine.ts` | `RuleEngine` — runs active rules each turn |
| `rule.ts` | `Rule` interface |
| `index.ts` | Re-exports everything |

---

## Combat (`combat.ts`)

### Types

```typescript
interface Combatant      { id: string; kind: string; attack: number; }
interface TileProperties { defenseBonus: number; }
interface StructureEffect { defenseMultiplier: number; }
interface CombatResult {
  attackerWins: boolean;
  attackerStrength: number;
  defenderStrength: number;
  attackerLosses: ReadonlyArray<string>;   // piece IDs
  defenderLosses: ReadonlyArray<string>;
  tileConquered: boolean;
}
```

### Formula

```
strength = Σ(attack) × √(unitCount)
```

Defenders receive additional multipliers:

```
defenderStrength × tile.defenseBonus × Π(structure.defenseMultiplier)
```

The winner is whoever has higher strength. Losers lose all units; winners keep
all units (no attrition — scenarios can layer attrition on top if needed).

### Usage

```typescript
import { resolveAttack, pieceAsCombatant } from '../rules/combat.js';

// Build combatant lists from pieces
const attackers = attackingPieces
  .map(pieceAsCombatant)
  .filter((c): c is Combatant => c !== null);

const defenders = defendingPieces
  .map(pieceAsCombatant)
  .filter((c): c is Combatant => c !== null);

// Resolve
const result = resolveAttack(
  attackers,
  defenders,
  { defenseBonus: tile.terrain.meta.defenseBonus },
  structures.map(s => ({ defenseMultiplier: s.stats?.['defenseMultiplier'] ?? 1.0 })),
);

if (result.attackerWins) { /* transfer ownership */ }
```

### `pieceAsCombatant(piece)`

Extracts a `Combatant` from a `Piece`. Returns `null` if `piece.stats?.['attack']`
is absent (e.g. structures that don't fight). This means scenarios never need
custom attack-value accessors — the value flows from
`PieceKindDefinition.defaultStats` → `makeUnitFromRegistry()` → `Piece.stats` →
`pieceAsCombatant()` automatically.

---

## Victory Conditions (`victory-condition.ts`)

```typescript
interface VictoryCondition {
  id: string;
  evaluate(state: GameState): VictoryResult | null;
}
```

`evaluate()` is called after every action executor. Return `null` if the game
continues; return a `VictoryResult` to end the game.

---

## Extending combat for a scenario

Scenarios should **re-export** from this module rather than reimplementing:

```typescript
// scenarios/my-game/combat.ts
export type { Combatant, TileProperties, StructureEffect, CombatResult } from '../../rules/combat.js';
export { resolveAttack, pieceAsCombatant } from '../../rules/combat.js';
// Add scenario-specific helpers below (siege, capture, etc.)
```

This keeps the framework layer generic and the scenario layer thin.
