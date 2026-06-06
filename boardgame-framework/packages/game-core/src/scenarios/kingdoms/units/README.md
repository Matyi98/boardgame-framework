# Kingdoms of Dominion — Military Unit System

All unit data is defined in a single canonical table:
[`../units.ts`](../units.ts).

## Unit table

| Unit      | Recruit cost         | ATK | DEF | HP | Move | Food/round | Limit |
|-----------|----------------------|:---:|:---:|:--:|:----:|:----------:|:-----:|
| Spearman  | 10 Gold + 1 Food     |  3  |  5  | 10 |  1   |     1      |  20   |
| Cannoneer | 20 Gold + 2 Iron     |  8  |  2  |  6 |  1   |     2      |   8   |
| Noble     | 30 Gold + 1 Iron + 1 Food |  1  |  3  |  8 |  2   |     1      |   2   |

All values are balance knobs. **To change them: edit `units.ts` only.**

## Recruitment preconditions

A player may recruit a unit on a tile if ALL of the following hold:

1. It is the player's turn.
2. The player owns the target tile.
3. The tile is **connected** to the player's capital (BFS via `playerConnectedTiles`).
4. The tile has a **Capital Base** or a **City** (armies need a command structure).
5. The player has not exceeded the per-kind unit limit.
6. The player has sufficient resources.

## Movement rules

Each unit may move **once per turn**, spending up to `movement` steps (hops to
adjacent tiles). `k:movedThisTurn` tracks which piece IDs have moved.

### Traversal rules

| Tile type           | Spearman / Cannoneer | Noble |
|---------------------|:--------------------:|:-----:|
| Own tile            | ✅                   | ✅    |
| Unowned tile        | ❌                   | ✅    |
| Enemy-owned tile    | ❌ (use attack-tile) | ❌    |

Movement is validated via BFS from the unit's current tile; if the target
tile is not reachable within `movement` steps under the traversal rules above,
the action is rejected.

## Noble — territory capture

The Noble is the only way to claim unowned tiles without combat. The mechanic
is intentionally delayed to prevent instant territory swapping.

### Turn-by-turn sequence

```
Turn N (Player A)
  └─ move-unit: Noble → unowned tile X
     ├─ unit-moved event
     └─ noble-occupying event
        k:pendingOccupations[X] = { nobleId, playerId: A }

End of Turn N (Player A calls end-turn)
  └─ Stage B: promote pending → confirmed
     k:confirmedOccupations[X] = { nobleId, playerId: A }
     k:pendingOccupations[X]   deleted

Turn N+1 (other players' turns, combats may happen)
  └─ If Noble is killed or tile X is captured by an enemy:
       occupation will simply not resolve (guard checks in Stage A)

End of Turn N+1 (Player A calls end-turn again)
  └─ Stage A: resolve confirmed occupations for Player A
     - Noble still on tile X? AND tile X still unowned?
       → ownership[X] = A; tile-captured event
     - Otherwise? → silently cancelled
     k:confirmedOccupations[X] deleted
```

### Cancellation cases

| Cause | Effect |
|-------|--------|
| Noble moves away from tile X | `cancelOccupationByNoble()` removes pending/confirmed entry |
| Noble is killed in combat     | Stage A guard (`stillOnTile`) fails → silently cancelled |
| Enemy captures tile X         | Stage A guard (`stillUnowned`) fails → silently cancelled |
| Noble moves to a second tile Y after holding X | Old X entry cancelled, new Y pending starts |

## Why two-turn occupation?

A single-turn capture would let a Noble instantly claim territory during the
player's own turn, which is too powerful in open maps. The two-turn rule:

- Creates counterplay (opponent has a full round to respond)
- Adds a meaningful decision (commit Noble to occupation vs. withdraw)
- Mirrors real conquest: planting a flag takes time to consolidate

The delay is purely turn-based — it does not depend on round number tracking,
making it simple to audit in the extras snapshot.

## Attrition priority

When a player cannot afford food for their army (unit food cost > food available
after gold-for-food exchange), units are disbanded in this order:

1. Spearmen first (most expendable)
2. Nobles second
3. Cannoneers last (hardest to replace)

Change `ATTRITION_PRIORITY` in `economy.ts` to reprioritize.
