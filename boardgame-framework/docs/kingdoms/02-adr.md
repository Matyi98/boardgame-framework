# Kingdoms of Dominion — Architectural Decisions

## ADR-001: Scenario-owned buildView()

**Status:** Accepted

**Context:** The engine service (`engine.service.ts`) originally had a hardcoded `buildView()`
method that built a Frontier-shaped JSON blob. Adding Kingdoms would have required an
if/else branch (or scenario-id switch) for each new game's view format.

**Decision:** Added an optional `buildView(state, players, victory)` method to the
`Scenario` interface. The engine calls it when available; otherwise falls back to the
old Frontier-compatible logic. This makes the engine fully scenario-agnostic.

**Consequences:**
- Each scenario is self-contained: terrain, actions, view format, all in one directory.
- Adding a third game requires zero engine changes — only registering the new scenario.
- The Frontier scenario was not modified (backward compatible); it still uses the engine fallback.

---

## ADR-002: `k:` prefix for Kingdoms extras

**Status:** Accepted

**Context:** `GameState.extras` is a shared `Record<string, unknown>` used by all scenarios.
Without namespacing, a future scenario could accidentally shadow Kingdoms keys.

**Decision:** All Kingdoms keys use the `k:` prefix (e.g. `k:ownership`, `k:capitals`).
Frontier uses unprefixed keys (`homeTiles`, `fortifications`, etc.) since it predated
this convention — that's fine as long as Kingdoms doesn't touch them.

**Consequences:** If a third scenario is added, it should use its own prefix (e.g. `m:` for a maritime scenario).

---

## ADR-003: Tile ownership stored separately from pieces

**Status:** Accepted

**Context:** In Frontier, a tile's "claimed" state is inferred from whether a `flag` piece
exists on it. Kingdoms needs tiles to stay owned even when all military units leave (armies
march away to attack). If ownership were inferred from pieces, an empty tile would appear neutral.

**Decision:** `k:ownership` is an explicit `Record<tileId, playerId>` that persists independently
of unit positions. A tile becomes neutral only when explicitly captured via `attack-tile`.

**Consequences:**
- `buildView()` reads `k:ownership` directly — O(1) per tile, no piece scan needed.
- The validator for `attack-tile` checks `k:ownership` (not piece presence) to determine
  whether the target is enemy/neutral.
- A tile can be owned but empty — units can safely leave to reinforce elsewhere.

---

## ADR-004: Combat as a pure function in combat.ts

**Status:** Accepted

**Context:** Combat logic is the most balance-sensitive part of the game and will change
frequently. If embedded directly in `attackTileExecutor`, it's harder to unit-test and
harder to tweak.

**Decision:** `resolveAttack(attackers, defenders, defenseBonus)` is a pure function with
no imports from the framework. It takes plain data and returns a `CombatResult`. The executor
handles state mutation from that result.

**Consequences:**
- Combat can be tested with zero framework scaffolding.
- The formula can be changed in one place and the executor automatically picks it up.
- Future: can be exposed in the frontend for "preview combat" UX without server round-trip.

---

## ADR-005: Income computed at end-of-turn, never cached

**Status:** Accepted

**Context:** Income could be pre-computed (cached per-tile or per-player) and updated
incrementally on each state change. This would be faster but introduces cache-invalidation
bugs.

**Decision:** `computeIncome()` runs the full BFS connectivity check and structure scan
every time `end-turn` fires. At current map scales (61 tiles, ≤4 players), this is well
under 1ms and correctness outweighs micro-optimization.

**Consequences:**
- No stale income bugs when tiles change ownership mid-round.
- If map size grows to thousands of tiles (unlikely for a board game), cache can be added
  in `income.ts` without touching the executors.

---

## ADR-006: Balance numbers in constants, never in validators

**Status:** Accepted

**Context:** Balance numbers (HP values, attack values, food costs, resource yields) will
change weekly. Validators that contain these numbers break this goal — every change
requires reading the validator logic, not just updating a config table.

**Decision:** All balance numbers live in:
- `pieces.ts` — `PIECE_STATS` constant (attack, food cost, HP per kind)
- `terrain.ts` — `TerrainRegistry` meta (defenseBonus, moveCost)
- `income.ts` — `STRUCTURE_INCOME` constant

Validators and executors import from these sources. Changing a balance number is a
single-line edit with zero risk of breaking validation logic.
