# Kingdoms of Dominion — Action Catalogue

All actions are sent via the game socket as:
```typescript
socket.emit('game-command', { gameId, type: '<action-type>', payload: { ... } });
```

---

## recruit-unit

**Payload:** `{ tileId: string; unitKind: 'spearman' | 'cannoneer' | 'noble' }`

**Validates:**
- Player is the active player
- Player is not eliminated
- Player owns `tileId`
- `unitKind` is a valid military unit
- Player's inventory has the required resources (from `PIECE_STATS[unitKind].cost`)
- Player's count of this unit kind is below `limitPerPlayer`

**Executes:**
- Deducts resources from player inventory
- Adds a new piece to `state.pieces` with a unique ID from `k:nextPieceId`
- Emits: `unit-recruited`

---

## move-unit

**Payload:** `{ pieceId: string; targetTileId: string }`

**Validates:**
- Player is the active player
- Player owns the piece
- Piece has not moved this turn (not in `k:movedThisTurn`)
- Target tile is adjacent to piece's current tile
- Player owns the target tile (can only move within own territory)

**Executes:**
- Updates piece location to target tile
- Adds `pieceId` to `k:movedThisTurn`
- Emits: `unit-moved`

---

## attack-tile

**Payload:** `{ fromTileId: string; toTileId: string }`

**Validates:**
- Player is the active player
- Player owns `fromTileId`
- Player has at least one unit on `fromTileId`
- `toTileId` is adjacent to `fromTileId`
- Player does NOT own `toTileId`
- `fromTileId` is not in `k:attackedFrom` (each tile attacks once per turn)

**Executes:**
1. Gather attacker units (pieces on fromTileId owned by active player)
2. Gather defender units (pieces on toTileId not owned by active player)
3. Compute defense bonus: terrain.defenseBonus × (2.0 if castle present, else 1.0)
4. Call `resolveAttack(attackers, defenders, defenseBonus)`
5. Apply casualties (remove pieces from state.pieces)
6. If attacker wins:
   - Transfer tile ownership in `k:ownership`
   - If tile had the defender's capital-base: eliminate that player
7. Add `fromTileId` to `k:attackedFrom`
8. Emits: `battle-resolved`, optionally `tile-captured`, `player-eliminated`

**Notes:**
- Attacking an empty neutral tile succeeds trivially (defenderStrength = 0)
- Attackers lose a fraction of units even in victory (proportional to defenderStrength / attackerStrength)

---

## build-structure

**Payload:** `{ tileId: string; structureKind: 'farm' | 'city' | 'castle' | 'gate' }`

**Validates:**
- Player is the active player
- Player owns `tileId`
- No structure currently exists on `tileId`
- `structureKind` is not `capital-base` (can't be manually built)
- Player's inventory has required resources
- Player's count of this structure kind is below `limitPerPlayer`

**Executes:**
- Deducts resources
- Adds building piece to `state.pieces`
- Emits: `structure-built`

---

## demolish-structure

**Payload:** `{ tileId: string }`

**Validates:**
- Player is the active player
- Player owns `tileId`
- A non-capital structure exists on `tileId`

**Executes:**
- Removes the structure piece from `state.pieces`
- Refunds 50% of the structure's build cost (rounded down per resource)
- Emits: `structure-demolished`

---

## end-turn

**Payload:** `{}`

**Validates:**
- Player is the active player

**Executes (in order):**
1. Collect income for active player (structures × connectivity → inventory additions) → `income-collected`
2. Deduct food for each unit the player has → `food-consumed`
3. If food would go negative: disband units (spearmen first, then cannoneers) until food ≥ 0 → `attrition-applied`
4. Clear `k:movedThisTurn` and `k:attackedFrom`
5. Call `state.rounds.endTurn()` → `turn-ended`
6. Check victory conditions (last-player-standing)
