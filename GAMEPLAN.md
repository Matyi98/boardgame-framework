Kingdoms of Dominion — Implementation Plan
Guiding principles before step 1
Before any code is written, the team must agree on three architectural rules that will govern every decision:

1. Scenario isolation. All Kingdoms-specific logic lives exclusively in packages/game-core/src/scenarios/kingdoms/. Nothing in Frontier changes. Nothing in the framework is polluted with Kingdoms assumptions. Extensions to the shared framework must be generic and backwards-compatible.

2. Event sourcing is the source of truth. Every state mutation produces one or more domain events. The frontend reconstructs view state purely by replaying events. No direct state polling for game logic. This is already established — every new action must follow this contract.

3. Write the README before the code. Each step produces a README that documents the component's purpose, its data contracts, and the decisions made. Future engineers (and LLMs) scan READMEs, not source files. A component without a README is not done.

Step 1 — Architecture & Domain Design Documents
Objective: Produce the full written design before a single line of implementation is committed. This step is pure documentation and architectural decision-making.

What to produce:

docs/kingdoms/00-overview.md — Game summary, reference to the game concept document, how Kingdoms fits into the existing framework as a second scenario.

docs/kingdoms/01-data-model.md — The complete entity model:

Tile properties: resourceType: 'wood' | 'food' | 'iron' | null, economicValue: number, combatValue: number
Piece types and their stats — structured as a table: name, category (unit/structure), attack, defense, health, movement, food cost per round, gold cost to build/recruit
Resource model: Wood, Food, Iron, Gold — note that Gold is the exchange medium, not produced from a tile type directly but from economic value of all tiles
Army strength formula: document the chosen non-linear model (e.g. strength = units * Math.sqrt(units) * baseAttack)
Connectivity rule: formal definition of "connected territory" via BFS from Capital Base
Elimination: what happens to a player's tiles and units when their Capital Base falls
docs/kingdoms/02-architectural-decisions.md — An ADR (Architecture Decision Record) log:

ADR-001: Tile properties stored as typed metadata in MapBuilder — rationale: keeps the hex-tile abstraction generic, Kingdoms-specific meaning lives in the scenario
ADR-002: Piece stats stored in a meta record on PieceDefinition, not typed fields — rationale: avoids breaking the shared Piece interface; type safety enforced at the scenario boundary
ADR-003: Combat resolution is synchronous and deterministic — no randomness beyond seeded RNG; rationale: reproducible game replays
ADR-004: Economic loop runs as a batch in endTurnExecutor when newRound === true — same pattern as fort income and tile income in Frontier
ADR-005: Frontend renders Kingdoms on a separate React component tree — no shared rendering code with Frontier's Board
docs/kingdoms/03-action-catalogue.md — A full table of every player action: name, actor, inputs, preconditions, resource cost, events emitted.

Acceptance criteria: All team members have reviewed and signed off on the data model and ADRs. No implementation begins until disagreements are resolved.

READMEs written: docs/kingdoms/README.md as an index with links to all design docs.

Step 2 — Framework Extensions in game-core (Domain Types)
Objective: Extend the shared framework types to support the richer data model that Kingdoms requires, without breaking Frontier.

Files to create/modify:

packages/game-core/src/map/tile.ts — Add an optional properties: Record<string, unknown> field to the Tile interface. MapBuilder gains a setTileProperty(tileId, key, value) method. This is the generic hook; Kingdoms will put resourceType, economicValue, combatValue into it. Frontier ignores it.

packages/game-core/src/pieces/piece.ts — Add optional stats: Record<string, number> to the Piece interface. Piece definitions in PieceRegistry gain a defaultStats record. When a piece is created with makeUnit(), the defaults are merged in. Kingdoms uses this for attack, defense, health, movement, foodCostPerRound.

packages/game-core/src/pieces/unit.ts — makeUnit() accepts an optional stats override. This allows a Cannoneer and a Spearman to have different combat stats while sharing the same base factory.

packages/game-core/src/rules/combat.ts — New file. Defines the CombatResult type and the resolveAttack() pure function signature. The function takes attacker units, defender units, tile properties, and structure effects, and returns { attackerLosses, defenderLosses, tileConquered: boolean }. The formula itself is not implemented here — this is the interface contract that Step 8 will implement.

packages/game-core/src/players/player.ts — Add status: 'active' | 'eliminated' to the Player type. RoundManager's endTurn() skips eliminated players. This is a framework-level change because elimination is a cross-cutting concern.

packages/game-core/src/rounds/round-manager.ts — Update endTurn() to filter players.all() to only active players when computing the next player.

README written: packages/game-core/src/CLAUDE.md updated to document new Piece stats and Tile properties sections. New packages/game-core/src/rules/README.md for the combat interface.

Key risk: Touching round-manager.ts and tile.ts could break Frontier. Every change must be additive and optional. Run Frontier end-to-end after this step before proceeding.

Step 3 — Resource & Treasury System
Objective: Define the four Kingdoms resources and implement the Gold exchange mechanism. This is scenario-level, not framework-level.

Files to create:

packages/game-core/src/scenarios/kingdoms/ — Create the directory with a README.md that explains the scenario structure, file map, and resource model.

packages/game-core/src/scenarios/kingdoms/resources.ts — Registers Wood, Food, Iron, Gold with the ResourceRegistry. Documents production rates and exchange rates. Defines the EXCHANGE_RATE constant: how much Gold buys one unit of any resource. Exports a canExchange(inventory, resource, qty) helper and executeExchange(inventory, resource, qty) that deducts gold and adds the resource.

packages/game-core/src/scenarios/kingdoms/economy.ts — Pure functions only, no state mutation:

calculateTileIncome(tile, structures): { gold: number; resource: string | null; amount: number } — given a tile and what's built on it, returns what it produces this round
calculateFoodConsumption(units, cities): number — total food consumed per round
calculateGoldIncome(tiles, structures): number — aggregates gold from all controlled tiles
These are pure calculation functions that the executors and the frontend can both import.

README written: packages/game-core/src/scenarios/kingdoms/README.md — describes the resource cycle: how tiles produce, how gold flows, what exchange costs, what happens when food runs out.

Key architectural decision: Gold is not a tile resource type — it is a universal income derived from economicValue on every tile regardless of terrain. This must be documented clearly to prevent confusion.

Step 4 — Map & Territory System
Objective: Build the Kingdoms map generator and implement the connectivity graph utility.

Files to create:

packages/game-core/src/scenarios/kingdoms/map.ts — Implements buildKingdomsMap(playerCount, seed). The map is significantly larger than Frontier's 37 tiles — plan for 61 tiles (4 rings) or a rectangular grid depending on the final design doc from Step 1. Tiles are assigned:

resourceType: Wood, Food, or Iron, distributed in regional clusters (neighboring tiles tend to share the same resource type — this is more interesting than random distribution)
economicValue: 1–5, higher in the centre
combatValue: 1–3, higher in difficult terrain
Document the coordinate system and the seeded shuffle algorithm in the file header.

packages/game-core/src/utils/connectivity.ts — New framework-level utility. Implements getConnectedTiles(pieces, tiles, capitalTileId): Set<string> using BFS. Given all pieces on the board, all tiles, and the owner's Capital Base tile ID, returns the set of tile IDs reachable from the capital through contiguous owned territory or Gate structures. This function is pure — it takes data, returns data, has no side effects.

packages/game-core/src/utils/connectivity.ts also exports isConnected(tileId, connectedSet): boolean for easy use in validators.

README written: packages/game-core/src/utils/README.md — documents the connectivity algorithm, its time complexity O(tiles), and when to call it (on every validate call that requires connectivity, not stored in state to avoid staleness).

Key risk: Connectivity is recalculated on every validator call. With a 61-tile map and up to 4 players, this is at most ~250 BFS operations per action — acceptable. Document this explicitly to prevent someone from "optimizing" it by caching in state, which would introduce bugs.

Step 5 — Structure System
Objective: Implement all five structure types (Capital Base, Farm, City, Castle, Gate) as buildable pieces with defined economic and defensive effects.

Files to create:

packages/game-core/src/scenarios/kingdoms/structures.ts — Defines structure piece types and their stat blocks:

Structure	Build Cost	Defense Mult	Income Effect	Food Cost
Capital Base	(starting)	4×	all resources	0
Farm	2 Wood	—	+50% food production	0
City	50 Gold	—	2× gold income	2 Food/round
Castle	3 Iron	2×	—	0
Gate	2 Wood + 1 Iron	—	re-connects tile	0
Exports STRUCTURE_DEFS: Record<StructureKind, StructureDef> where StructureDef has buildCost, defenseMult, incomeMultiplier, foodCostPerRound.

packages/game-core/src/scenarios/kingdoms/actions/build.ts — buildValidator and buildExecutor for placing any structure. The validator checks: it's your turn, you own the tile, the tile is connected, no conflicting structure already present, you have the resources. The executor deducts resources, places the structure piece, emits a structure-built event with the structure kind and tile ID.

packages/game-core/src/scenarios/kingdoms/actions/develop.ts — Separate action for the "develop barren land" mechanic (spending gold to unlock an otherwise unproductive tile). Keeps the concern separate from general building.

README written: packages/game-core/src/scenarios/kingdoms/structures/README.md — table of all structures, their effects, and the validation rules. Include a note on why structure effects are applied in economy.ts pure functions rather than being event-driven, to avoid order-of-operations bugs.

Step 6 — Military Unit System
Objective: Implement the three unit types, recruitment, and unit movement between adjacent tiles.

Files to create:

packages/game-core/src/scenarios/kingdoms/units.ts — Defines the three unit type piece definitions:

Unit	Recruit Cost	Attack	Defense	Health	Movement	Food/round
Spearman	10 Gold + 1 Food	3	5	10	1	1
Cannoneer	20 Gold + 2 Iron	8	2	6	1	2
Noble	30 Gold + 1 Iron + 1 Food	1	3	8	2	1
The stats are seeded from ADR-001 in the design doc. These are the values to balance in Step 11 — they are parameterized here, not hardcoded throughout the codebase.

packages/game-core/src/scenarios/kingdoms/actions/recruit.ts — recruitValidator / recruitExecutor. Preconditions: your turn, target tile is yours, tile is connected, tile has a structure that enables recruitment (Capital Base or City), you have the cost. Emits unit-recruited event.

packages/game-core/src/scenarios/kingdoms/actions/move.ts — moveValidator / moveExecutor. A unit can move up to its movement stat in steps, only through connected own territory or unclaimed tiles. The Noble's movement of 2 enables its capture mechanic. Emits unit-moved events (one per step, or one combined event with path).

packages/game-core/src/scenarios/kingdoms/actions/noble-capture.ts — Separate file because the Noble capture is a distinct mechanic. A Noble that moves onto an unowned tile and ends its turn there triggers noble-occupying. If the Noble is still there at the start of the player's next turn, tile-captured fires and the tile changes owner. This requires tracking occupyingNoble in state.extras.

README written: packages/game-core/src/scenarios/kingdoms/units/README.md — all unit stats, the recruitment preconditions, the movement rules, and the Noble capture sequence with a turn-by-turn example.

Step 7 — Economic Loop (Per-Round Processing)
Objective: Implement the full economic tick that runs at the end of every round, covering income, food consumption, attrition, and mortgaging.

Files to create/modify:

packages/game-core/src/scenarios/kingdoms/economy-loop.ts — A single function processRoundEnd(state): GameEvent[] that is called from endTurnExecutor when newRound === true. It runs in this strict order to avoid ordering bugs:

Income collection: For each owned tile, call calculateTileIncome(). Add resources and gold to inventories. Emit income-collected events batched by player.
Food consumption: Call calculateFoodConsumption(). Attempt to deduct food from each player's inventory. If they lack food, try gold exchange. Emit food-consumed events.
Attrition: If a player still cannot cover food after gold exchange, kill units in reverse recruitment order (LIFO) until food is balanced. Emit unit-attrition events.
Mortgage: If a player's gold is negative after all the above (this should not happen given the system, but is a safeguard), deactivate their cities. Emit city-mortgaged events.
Connectivity check: Recalculate connected tiles for each player. Any tile that has become disconnected and lacks a Gate is flagged. Emit territory-disconnected events for UI feedback.
Why this order matters: Income before consumption means a player benefits from the tiles they hold at round start — not mid-round acquisitions. Document this explicitly.

packages/game-core/src/scenarios/kingdoms/actions/end-turn.ts — endTurnExecutor calls processRoundEnd() and appends its events to the turn-ended + round-ended events.

README written: packages/game-core/src/scenarios/kingdoms/economy-loop/README.md — the full processing sequence as a numbered list with the rationale for each ordering decision. This is the most critical document in the whole system — any engineer changing the economic loop must update it.

Key risk: This is the most complex function in the game. It must be pure (no side effects outside of state mutation through passed-in state object). Write unit tests before the implementation: given a state fixture, assert exact events produced.

Step 8 — Combat System
Objective: Implement the attack action, the non-linear army strength formula, and player elimination.

Files to create:

packages/game-core/src/rules/combat.ts — (Scaffold from Step 2, now implemented.) The resolveAttack() function:


Army strength = Σ(unitAttack) × √(unitCount) × terrainModifier × structureDefenseMultiplier
The square-root scaling means 4 Spearmen are not 4× as strong as 1 — they're 2× as strong. Larger armies get a bonus but it diminishes. This formula is documented and parameterizable. resolveAttack() returns { attackerCasualties: Piece[], defenderCasualties: Piece[], tileConquered: boolean }. It uses the seeded RNG for any probabilistic elements so combat is reproducible.

packages/game-core/src/scenarios/kingdoms/actions/attack.ts — attackValidator / attackExecutor:

Validator checks: your turn, attacking units are yours and on an adjacent tile, target tile is enemy or neutral, you have at least one non-Noble unit in the attack, your attacking tile is connected.

Executor: calls resolveAttack(), removes casualties from both sides, transfers tile ownership if tileConquered, checks if the defender's Capital Base was on that tile. If Capital Base falls: sets state.players.get(ownerId).status = 'eliminated', removes all their pending trade offers, emits player-eliminated event. Emits attack-resolved event with full combat details.

packages/game-core/src/scenarios/kingdoms/victory.ts — lastPlayerStanding victory condition: evaluate after every attack. Returns a winner when only one player has status === 'active'.

README written: packages/game-core/src/rules/README.md — documents the combat formula, the rationale for non-linear scaling, how to tune the formula parameters, and what events attack produces.

Step 9 — Kingdoms Scenario Wiring & Engine Registration
Objective: Assemble all the pieces into a complete kingdomsScenario object and register it with the engine. Verify the full action catalogue works end-to-end.

Files to create/modify:

packages/game-core/src/scenarios/kingdoms/scenario.ts — Assembles kingdomsScenario: Scenario with all validators and executors registered in the correct order. Includes onSetup() which places each player's Capital Base on their starting tile and initializes all extra state keys (occupyingNoble: {}, mortgagedCities: [], etc.).

packages/game-core/src/scenarios/kingdoms/index.ts — Clean re-export.

apps/game-engine/src/engine/scenario.registry.ts — Register kingdomsScenario alongside demoScenario.

apps/game-engine/src/engine/engine.service.ts — buildView() must be extended for the Kingdoms view: includes unit positions, structure positions, food/gold/resource counts, connectivity status, elimination status. Consider factoring out a buildKingdomsView() helper — the function is already getting complex.

apps/lobby-service/src/lobby/lobby.service.ts — The createRoom endpoint accepts a scenarioId. Verify kingdoms-v1 is accepted and forwarded correctly to the engine.

README written: Each action file (build.ts, recruit.ts, attack.ts, etc.) gets a JSDoc block at the top describing the action, its cost, its preconditions, and the events it emits — not inline comments explaining what the code does, but the contract that callers depend on.

docs/kingdoms/04-action-catalogue.md updated with any changes discovered during implementation.

Step 10 — Frontend: Kingdoms UI
Objective: Build the React frontend for Kingdoms without modifying any Frontier components.

Architectural decision: Kingdoms gets its own component tree under apps/web/src/games/kingdoms/. The shared Board.tsx is not modified. A new KingdomsBoard.tsx is created that handles the larger map, unit icons, structure icons, and attack interactions.

New files:

apps/web/src/games/kingdoms/ — Directory with its own README.md describing the component structure.

apps/web/src/games/kingdoms/KingdomsBoard.tsx — Renders the Kingdoms map. Hex geometry is imported from the existing board/hex-geometry.ts (shared utility — this is fine). Tile rendering includes: resource type badge, economic value, unit count bubbles per player, structure icons. Click interactions depend on the current mode (claim, build, recruit, attack, move).

apps/web/src/games/kingdoms/store/kingdoms-game.ts — A separate Zustand store for Kingdoms view state. Does not share state with Frontier's useGame. Handles the richer KingdomsView type with units, structures, connectivity, elimination status.

apps/web/src/games/kingdoms/EconomyPanel.tsx — Right sidebar panel showing: current round income preview, food balance (production − consumption), gold treasury, resource stockpiles.

apps/web/src/games/kingdoms/MilitaryPanel.tsx — Shows units per tile, provides recruit and move buttons, shows army strength preview before an attack.

apps/web/src/games/kingdoms/CombatLog.tsx — Shows the last combat result with a breakdown of attacker vs defender strength and casualties.

apps/web/src/pages/KingdomsPage.tsx — Top-level page registered in the router at /games/:gameId/kingdoms.

README written: apps/web/src/games/kingdoms/README.md — describes the component tree, the mode state machine (normal → attack-select → attack-target → confirm), and which store slice owns which piece of state.

Step 11 — Testing, Balancing & Documentation Hardening
Objective: This step is not an afterthought — it is a full sprint dedicated to quality.

Testing:

Unit tests for every pure function:

resolveAttack() — fixture-based tests for edge cases: zero units, equal armies, structure bonuses, elimination trigger
processRoundEnd() — fixtures for: normal income, food shortage with gold exchange, attrition, mortgage
getConnectedTiles() — fixtures for: fully connected map, territory split by enemy conquest, Gate reconnection
calculateTileIncome() and calculateFoodConsumption() — table-driven tests against the economy spreadsheet from Step 1
Integration tests:

Full game flow: 2 players, one player eliminated through Capital Base destruction
Food attrition: player over-extends, loses units across multiple rounds
Noble capture: full two-turn sequence for tile acquisition
Balance review:
Create docs/kingdoms/05-balance-worksheet.md — a spreadsheet-style document showing the expected game length in rounds for each player count, the gold income needed to sustain various army sizes, and the payback period for each structure. The ADR log should record which parameters were tuned and why.

Documentation audit:
Every directory under packages/game-core/src/scenarios/kingdoms/ and apps/web/src/games/kingdoms/ must have a README. Every public function that is part of an action contract must have a JSDoc @param and @returns comment. Run a documentation checklist before this step is considered done.

Summary table
Step	Area	Main Output	Depends On
1	Architecture	Design docs, ADRs, action catalogue	—
2	game-core framework	Extended Tile, Piece, Player, RoundManager	1
3	Resources	Wood/Food/Iron/Gold, exchange logic	2
4	Map & connectivity	Kingdoms map builder, BFS utility	2
5	Structures	5 structure types, build action	3, 4
6	Military units	3 unit types, recruit, move, Noble capture	3, 4, 5
7	Economic loop	Per-round income/consumption/attrition	3, 5, 6
8	Combat	resolveAttack(), attack action, elimination	6, 7
9	Scenario wiring	kingdomsScenario registered in engine	3–8
10	Frontend	Full Kingdoms UI	9
11	Testing & balance	Tests, balance doc, documentation audit	10
What NOT to do (anti-patterns to prohibit explicitly)
Do not modify Frontier code to accommodate Kingdoms. If a framework extension is needed, it must be generic and additive.
Do not put game balance numbers in validators or executors. All costs, multipliers, and stats go in units.ts, structures.ts, or economy.ts constants. Tuning balance should require changing one file.
Do not store derived facts in state. Connectivity is derived from pieces + tile layout — compute it, don't cache it. Army strength is derived from units — compute it on demand.
Do not build the frontend before Step 9 is smoke-tested. Building UI against an unstable backend action contract doubles the debugging surface.
Do not skip the README for any new directory. The README is the entry point for the next engineer (or the next LLM session). Without it, every session restarts cold.