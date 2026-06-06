# Adding a New Scenario (Game Variant)

> A **Scenario** is a self-contained game ruleset. Everything specific to one game lives inside its scenario folder under `packages/game-core/src/scenarios/<name>/`. The engine, gateway, and web frontend are scenario-agnostic.

---

## 1. Create the scenario folder

```
packages/game-core/src/scenarios/my-game/
├── scenario.ts    # The Scenario object (entry point)
├── map.ts         # Board layout builder
├── actions.ts     # Validators + executors for each player action
├── victory.ts     # Win conditions
└── index.ts       # Re-export
```

---

## 2. Define the map (`map.ts`)

```ts
import { MapBuilder } from '../../map/map-builder.js';
import type { GameMap } from '../../map/game-map.js';

export function buildMyMap(playerCount: number, seed: string): GameMap {
  const builder = new MapBuilder();
  // Add tiles:
  builder.addHexTile({ id: '0,0', coord: { q: 0, r: 0 }, terrain: 'forest' });
  // ... repeat for all tiles
  return builder.build();
}
```

`tileId({ q, r })` from `../../map/tile.js` generates `"q,r"` strings — use it to keep IDs consistent.

---

## 3. Define actions (`actions.ts`)

Each action needs a **validator** (returns `null` = ok, or `actionError(code, message)`) and an **executor** (mutates state, returns events).

```ts
import { actionError } from '../../actions/action.js';
import type { ActionValidator } from '../../actions/action-validator.js';
import type { ActionExecutor } from '../../actions/action-executor.js';

// ── Example: place-token ─────────────────────────────────────────────────────

export interface PlaceTokenPayload { tileId: string }

export const placeTokenValidator: ActionValidator<PlaceTokenPayload> = {
  type: 'place-token',
  validate(state, action) {
    if (state.rounds.turn().activePlayer !== action.playerId)
      return actionError('not-your-turn', 'Wait for your turn');
    const tile = state.map.tileById(action.payload.tileId);
    if (!tile) return actionError('invalid-tile', 'Tile not found');
    return null; // ok
  },
};

export const placeTokenExecutor: ActionExecutor<PlaceTokenPayload> = {
  type: 'place-token',
  execute(state, action) {
    const { tileId } = action.payload;
    const pieceId = `token-${action.playerId}-${tileId}`;
    state.pieces.set(pieceId, makeUnit({ id: pieceId, kind: 'token', owner: action.playerId!, tileId }));
    return [{ type: 'token-placed', playerId: action.playerId, payload: { tileId } }];
  },
};
```

**Important**: executors receive a mutable `state` — mutations take effect immediately. Return only the events to broadcast.

Dice: use `state.rng.intInRange(1, 6)` — never `Math.random()`.

---

## 4. Define victory conditions (`victory.ts`)

```ts
import type { VictoryCondition } from '../../rules/victory-condition.js';

export const firstTo10VP: VictoryCondition = {
  id: 'first-to-10-vp',
  evaluate(state) {
    for (const [playerId, inv] of state.inventories) {
      if (inv.get('vp') >= 10)
        return { winner: playerId, reason: 'Reached 10 VP', conditionId: 'first-to-10-vp' };
    }
    return null;
  },
};
```

Return `null` if the game is still running. Return `{ winner: playerId | null, reason, conditionId }` when over. `winner: null` = draw.

---

## 5. Assemble the Scenario (`scenario.ts`)

```ts
import type { Scenario } from '../../setup/scenario.js';
import { TerrainRegistry } from '../../map/terrain.js';
import { ResourceRegistry } from '../../resources/resource-type.js';
import { PieceRegistry } from '../../pieces/piece-registry.js';
import { ClockwiseTurnOrder } from '../../rounds/turn-order.js';
import { buildMyMap } from './map.js';
import { placeTokenValidator, placeTokenExecutor } from './actions.js';
import { firstTo10VP } from './victory.js';

export const myScenario: Scenario = {
  id: 'my-game-v1',        // must be unique across all registered scenarios
  name: 'My Game',
  minPlayers: 2,
  maxPlayers: 4,

  terrains: new TerrainRegistry().register({ id: 'forest', name: 'Forest', produces: 'vp', meta: { vp: 2 } }),
  resources: new ResourceRegistry().register({ id: 'vp', name: 'Victory Points', symbol: '★' }),
  pieces: new PieceRegistry().register({ kind: 'token', category: 'unit', displayName: 'Token', limitPerPlayer: 10 }),

  phases: [{ id: 'main', displayName: 'Main Phase', nextPhases: ['main'] }],
  initialPhaseId: 'main',
  turnOrder: new ClockwiseTurnOrder(),

  validators: [placeTokenValidator],
  executors:  [placeTokenExecutor],
  rules: [],
  victoryConditions: [firstTo10VP],

  buildMap: buildMyMap,

  // Optional: called once after createGameState(), before game.start()
  // Use this to pre-place pieces, set extras, assign home tiles, etc.
  onSetup(state, players) {
    state.extras['myKey'] = 'someValue';
  },
};
```

---

## 6. Register the scenario in the engine

Open `apps/game-engine/src/engine/scenario.registry.ts` and add:

```ts
import { myScenario } from '@bgf/game-core';  // or relative path if not re-exported

// Inside ScenarioRegistry constructor or register() calls:
this.register(myScenario);
```

---

## 7. Export from game-core (if needed by the web frontend)

Add to `packages/game-core/src/scenarios/index.ts`:

```ts
export * from './my-game/index.js';
```

And to `packages/game-core/src/index.ts` if the web app imports game-core directly.

---

## 8. Frontend view

The frontend receives a generic `DemoView` shape from the engine's `buildView()` method in `engine.service.ts`. If your scenario needs extra fields in the view (e.g., a "robber position"), extend `DemoView` in `apps/web/src/store/game.ts` and update `buildView()` in `engine.service.ts` to include them.

---

## Checklist

- [ ] `map.ts` — all tiles defined, terrain IDs match the registered terrains
- [ ] `actions.ts` — validator returns `null` on success, executor returns events array
- [ ] `victory.ts` — returns `null` while game is ongoing
- [ ] `scenario.ts` — `id` is unique, `minPlayers`/`maxPlayers` match your scenario
- [ ] Registered in `ScenarioRegistry`
- [ ] `buildView()` in `engine.service.ts` includes any new view fields
- [ ] Frontend `DemoView` type extended if new fields added
- [ ] Rebuild `game-engine` and `web` Docker images
