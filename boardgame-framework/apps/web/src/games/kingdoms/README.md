# Kingdoms of Dominion — Frontend Component Tree

This directory contains all React components for the `kingdoms-v1` scenario.
It is entirely isolated from Frontier's component tree — nothing here imports
from `../../components/Board.tsx` or `../../pages/GamePage.tsx`.

---

## Directory layout

```
src/games/kingdoms/
  kingdoms.css          CSS custom properties, keyframes, and utility classes
  KingdomsBoard.tsx     SVG hex board — renders the 61-tile map
  ActionPanel.tsx       Context-sensitive action sidebar
  MilitaryPanel.tsx     Unit list + combat strength preview
  CombatLog.tsx         Battle result card + event feed
  EconomyPanel.tsx      Resource stockpiles + income preview
  store/
    kingdoms-game.ts    Zustand store — game state, socket, tile effects
```

---

## Component responsibilities

### `KingdomsBoard.tsx`
Renders the 61-tile SVG board. Each hex tile is a `<HexTile>` sub-component that
displays:
- Terrain fill colour (plains / hills / forest / mountain)
- Owner colour overlay (20% tint + 3 px border stroke)
- Mode-aware interaction highlights:
  - Move mode: blue overlay on reachable tiles
  - Attack mode: red overlay on attackable tiles
  - Selected tile: orange pulsing border (`k-pulse-selected`)
- Unit bubbles (S/C/N per owner, top area of the hex)
- Structure label (★=capital, F=farm, C=city, K=castle, G=gate)
- Resource dot (bottom-left corner)
- Economic value text (top-right corner)
- Noble occupation ring (gold pulse — slow when pending, fast when confirmed)
- Combat flash / capture sweep animations driven by `tileEffects` from the store

**Props**: `KingdomsBoardProps` — see the interface in the file header.

### `ActionPanel.tsx`
Context-sensitive sidebar that changes based on `mode` and `selectedTileId`:
- **Idle, no tile selected**: End Turn only
- **Idle, own tile selected**: tile info, Attack button, per-unit Move buttons,
  Recruit section (spearman / cannoneer / noble with costs), Build section (farm /
  city / castle / gate with costs), Demolish section, Develop tile
- **Move mode active**: header + Cancel button
- **Attack mode active**: red header + Cancel button
- **End Turn** always visible at the bottom

### `MilitaryPanel.tsx`
Shows all units on the map, grouped by owner. Each unit entry shows kind, attack,
defense, and HP. When the player has selected a tile for attack (`attackingTile` is
set), displays relative strength bars (attacker green / defender red) using the same
formula as the backend: `Σ(attack) × √(count) × terrainBonus × structureDef`.

Terrain bonuses used for the preview: plains×1.0, hills×1.3, forest×1.5, mountain×2.0.
Structure bonuses: capital-base and castle each ×2.0.

### `CombatLog.tsx`
Two sections:
1. **Last battle card** — dismissable overlay showing attacker STR, defender STR,
   and casualties on each side. Auto-sourced from `useKingdomsGame().lastCombat`.
2. **Event feed** — last 20 events, newest first. Unicode icon per event type:
   `⚔`=battle, `✦`=capture, `★`=victory, `→`=move, `↺`=turn/round, `⊕`=recruit/build.

### `EconomyPanel.tsx`
Reads the `KingdomsView.players` array to show the active player's:
- Gold / wood / food / iron stockpile
- Income per round (totalled from connected tiles)
- Food balance warning when consumption exceeds production
- Round number

### `store/kingdoms-game.ts` (Zustand store)
Single source of truth for all Kingdoms client state.

```typescript
interface KingdomsGameStore {
  view: KingdomsView | null;          // full game snapshot from backend
  tileEffects: Record<string, TileEffect>; // { combat | capture | noble }
  lastCombat: LastCombat | null;      // most recent battle details for the overlay
  connect(gameId): void;              // subscribe to WS + fetch init snapshot
  disconnect(): void;
  send(type, payload): void;          // emit game-command via socket
  fetchInit(gameId): Promise<void>;   // re-fetch /api/games/:id/init
  addTileEffect(tileId, kind): void;
  clearTileEffect(tileId): void;
  clearLastCombat(): void;
}
```

**Event handling:**
| WS event type      | Store action                                            |
|--------------------|---------------------------------------------------------|
| `game-started`     | `view = payload` (full snapshot), reset effects         |
| `battle-resolved`  | set `lastCombat`, `addTileEffect` combat on both tiles  |
| `tile-captured`    | `addTileEffect` capture                                 |
| `noble-occupying`  | `addTileEffect` noble                                   |
| (all others)       | `fetchInit()` to pull authoritative Redis snapshot      |

---

## Mode state machine (`KingdomsPage.tsx`)

```
idle
  │ player clicks own tile with combat unit
  └─► attack
        │ player clicks target tile
        └─► idle (executor fires → WS → re-fetch)
        │ player clicks Cancel
        └─► idle

  │ player clicks Move on a unit
  └─► move
        │ player clicks target tile
        └─► idle (executor fires)
        │ player clicks Cancel
        └─► idle

  │ player clicks Recruit / Build / Develop
  └─► idle (executor fires immediately, no second click needed)
```

State variables owned by `KingdomsPage`:
```typescript
mode: 'idle' | 'move' | 'attack' | 'recruit' | 'build'
selectedTileId: string | null      // tile clicked for context panel
movingUnitId: string | null        // pieceId being moved
reachableTiles: ReadonlySet<string>  // BFS result for move mode
attackableTiles: ReadonlySet<string> // adjacent enemy tiles for attack mode
```

BFS for `reachableTiles` runs client-side using the tile ownership map from
`KingdomsView`. It matches the backend validator's logic: own tiles + unowned tiles
for nobles only, up to unit movement stat hops. This is a preview only — the backend
re-validates on every command.

---

## CSS (`kingdoms.css`)

All game-specific CSS lives here; no global styles are modified.

| Keyframe            | Trigger               | Effect                                              |
|---------------------|-----------------------|-----------------------------------------------------|
| `k-combat-flash`    | `battle-resolved`     | Red flash fades over 1.5 s on both participating tiles |
| `k-capture-sweep`   | `tile-captured`       | Purple sweep with border highlight over 0.8 s       |
| `k-noble-ring`      | pending occupation    | Gold pulsing border ring, 1.6 s, slow               |
| `k-noble-ring-fast` | confirmed occupation  | Gold pulsing border ring, 0.8 s, fast               |
| `k-pulse-selected`  | tile selected         | Orange pulsing border on selected tile              |
| `k-turn-banner`     | turn starts           | "YOUR TURN" banner slides in from top               |
| `k-income-float`    | income collected      | Gold amount floats upward                           |
| `k-slide-in-log`    | new log entry         | Entry slides in from right                         |
| `k-shake`           | validation error      | Panel shakes horizontally                           |

---

## Adding a new action button

1. Add the socket command string to the appropriate section of `ActionPanel.tsx`.
2. Wire it to `useKingdomsGame().send(type, payload)`.
3. If the action needs a two-click flow (select source → select target), add a
   mode to the `mode` type union in `KingdomsPage.tsx` and handle BFS there.
4. If the action produces a visual tile effect, handle the new WS event type in
   `store/kingdoms-game.ts` under the `socket.on('game-event', ...)` handler.
