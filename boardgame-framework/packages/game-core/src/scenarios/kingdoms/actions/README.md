# Kingdoms of Dominion — Actions

Each file in this directory implements one group of player actions as a
`{type}Validator / {type}Executor` pair, registered in `../scenario.ts`.

Full action catalogue with costs and preconditions: `docs/kingdoms/03-action-catalogue.md`.

---

## File map

| File          | Actions                           | Notes |
|---------------|-----------------------------------|-------|
| `helpers.ts`  | Shared guard functions            | `guardActivePlayer`, `getOwnership`, etc. |
| `recruit.ts`  | `recruit-unit`                    | Spearman / Cannoneer / Noble from capital or city |
| `move.ts`     | `move-unit`                       | BFS within movement stat; Noble triggers occupation |
| `attack.ts`   | `attack-tile`                     | Combat resolution, elimination, ownership transfer |
| `build.ts`    | `build-structure`, `demolish-structure` | Farm / City / Castle / Gate |
| `develop.ts`  | `develop-tile`                    | Spend 8 gold to unlock a tile |
| `end-turn.ts` | `end-turn`                        | Noble pipeline, turn advance, per-round economy |
| `index.ts`    | Barrel re-export                  | Everything consumed by `../scenario.ts` |

---

## Action contracts (summary)

### `recruit-unit`
- **Preconditions**: your turn; target tile is yours and connected; tile has a Capital Base or City; you can afford the unit.
- **Cost**: see `../units.ts` UNIT_DEFS for per-unit costs.
- **Events emitted**: `unit-recruited`

### `move-unit`
- **Preconditions**: your turn; piece is yours; piece is a unit (not structure); piece has not moved this turn; target reachable within `movement` stat hops through own/unowned tiles.
- **Noble special rule**: Nobles may traverse and land on unowned tiles. Landing on an unowned tile emits `noble-occupying` and starts the two-turn occupation pipeline.
- **Events emitted**: `unit-moved`, optionally `noble-occupying`

### `attack-tile`
- **Preconditions**: your turn; from-tile is yours and connected; from-tile has ≥1 combat unit (Nobles alone cannot initiate); tiles are adjacent; to-tile is not yours; from-tile has not attacked this turn.
- **Resolution**: calls `resolveAttack()` from `../../rules/combat.ts`.
  - Attacker wins → all defenders die, tile ownership transfers, structures on tile transfer to attacker.
  - Defender wins → all attackers die, tile unchanged.
  - Capital Base captured → `players.eliminate(defender)`, all their pieces removed, all their tiles neutralised.
- **Events emitted**: `battle-resolved`, optionally `tile-captured`, optionally `player-eliminated`

### `build-structure` / `demolish-structure`
- **Build preconditions**: your turn; tile is yours and connected; tile does not already have that structure (subject to per-player limits); you can afford.
- **Demolish preconditions**: your turn; tile is yours; structure is yours; structure is not the Capital Base.
- **Events emitted**: `structure-built` / `structure-demolished`

### `develop-tile`
- **Preconditions**: your turn; tile is yours and connected; tile not already developed; cost 8 gold.
- **Effect**: marks tile as developed (`k:developed` extras array), increasing its resource yield.
- **Events emitted**: `tile-developed`

### `end-turn`
- **Preconditions**: your turn.
- **Noble occupation pipeline** (runs every turn):
  1. Stage A — Confirmed occupations: Noble still on tile AND tile still unowned → `tile-captured`, ownership transfers.
  2. Stage B — Pending occupations promoted to confirmed (resolves on next end-turn).
- **Per-round economy** (runs once per round, after the last player's turn):
  - Income collection, food consumption, gold exchange, attrition, mortgage, connectivity check.
  - See `../economy-loop/README.md` for the exact ordering and rationale.
- **Events emitted**: `turn-ended`, optionally `tile-captured`, and all events from `processRoundEnd()` when `newRound === true`.

---

## Key invariants

- `k:movedThisTurn` and `k:attackedFrom` are **reset on every `end-turn`**, not on every action. Units can move multiple times per turn if they were moved, then a different unit moved (the restriction is per-piece, not per-tile).
- A tile's ownership is tracked exclusively in `k:ownership` — NOT by piece presence. An empty tile stays owned even if all units leave.
- `k:nextPieceId` increments monotonically and is never reused — executors must read it, increment it, and write it back before returning.
- Validators must call `playerConnectedTiles()` fresh for every check. Never cache connectivity in state (see ADR-005 in `docs/kingdoms/02-adr.md`).
