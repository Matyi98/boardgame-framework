# How to Play — Kingdoms of Dominion

A turn-based military conquest game for 2–4 players on a 61-tile hex map.
**Goal: be the last kingdom standing** by capturing every other player's Capital Base.

This guide describes the game exactly as currently implemented — every number below is pulled directly from the rules engine, not aspirational design.

---

## 1. The board

- **61 hex tiles** arranged in 4 rings around a center tile (pointy-top axial grid).
- **Terrain** (fixed mix, shuffled randomly per game):

  | Terrain | Count | Defense bonus | Natural resource |
  |---|---|---|---|
  | Plains | 25 | ×1.0 | Food |
  | Forest | 15 | ×1.5 | Wood |
  | Hills | 12 | ×1.3 | Iron |
  | Mountain | 9 | ×2.0 | Iron |

  Defense bonus multiplies the *defender's* combat strength on that tile — mountains are nearly impossible to take by force alone.

- **Economic value** (1–5): every tile has a gold-income weight, highest near the center (ring 0–1) and lowest at the edges (ring 4) — so the middle of the map is the richest territory, but also the most exposed.
- **Starting positions**: each player begins on one of the four outermost ring-4 corners, as far from each other as the map allows.

---

## 2. Setup

Each player starts with, all stacked on their home tile:

- 1 **Capital Base** (your only one — losing it eliminates you)
- 2 **Spearmen**
- 1 **Noble**
- **10 🪵 Wood, 8 🌾 Food, 6 ⚙️ Iron, 30 🪙 Gold**

Your home tile is automatically owned by you and is your Capital.

---

## 3. Turns and rounds

- Turn order is clockwise. On your turn you may perform **any number of actions, in any order** — recruit, build, move, attack, develop, demolish — then end your turn.
- A **round** completes once every player has taken a turn. Income, food upkeep, and connectivity checks are resolved **once per round**, right after the last player ends their turn — not every individual turn.
- Two hard limits per turn:
  - **One attack per turn**, no matter which tile you attack from.
  - **Each individual unit can move once per turn** (attacking and moving are separate — a unit that moved can still fight if it was already positioned to attack from elsewhere, but a unit can't move *and* be the one that attacks in the same action since attacking doesn't require — or consume — movement).

---

## 4. Resources

| Resource | Used for |
|---|---|
| 🪙 Gold | Universal currency — produced by every connected tile based on economic value; spent on everything |
| 🪵 Wood | Building structures |
| 🌾 Food | Recruiting and feeding units; City upkeep |
| ⚙️ Iron | Cannoneers, Castles, Cities, Gates |

**Gold exchange**: 3 gold can be converted into 1 unit of Wood, Food, or Iron. This happens **automatically** during the round-end economy step if you're short on food — it never triggers for Wood/Iron shortfalls (there's no upkeep for those).

---

## 5. Units

| Unit | Cost | ATK | DEF | HP | Food/round | Max owned | Can attack? |
|---|---|---|---|---|---|---|---|
| 🗡 Spearman | 10🪙 + 1🌾 | 3 | 5 | 10 | 1 | 20 | Yes |
| 💣 Cannoneer | 20🪙 + 2⚙️ | 8 | 2 | 6 | 2 | 8 | Yes |
| ♛ Noble | 8🪙 + 1⚙️ + 1🌾 (rises sharply per Noble owned) | 1 | 3 | 8 | 1 | 10 | No — see §8 |

- **Recruiting** requires a connected tile with a Capital Base or City on it.
- **Noble cost scales steeply**: the formula is `8 × 1.7^(current Noble count − 1)` gold, rounded up. Your 2nd Noble costs 8g, your 3rd ~14g, your 5th ~67g, your 10th ~660g. Iron/Food cost for a Noble always stays 1 each.
- **Movement**: any unit can move to **any tile you own that's connected to your Capital**, regardless of distance — there's no adjacency or movement-range limit. Units can never move onto a tile they don't own; the only way onto an unowned or enemy tile is to *attack* it (§7–8).
- A Noble **cannot start an attack alone against an enemy-owned tile** — you need at least one Spearman or Cannoneer in the attacking force for that. A Noble *can* solo-attack an unowned tile (that's the occupation mechanic).

---

## 6. Structures

| Structure | Cost | Defense ×| Income effect | Food/round | Max per player |
|---|---|---|---|---|---|
| 🏛 Capital Base | free (placed at setup) | ×2.0 | +1 gold flat | 0 | 1 |
| 🌾 Farm | 2🪵 | ×1.0 | +50% resource yield on this tile | 0 | 5 |
| ⛪ City | 3🪵 + 2⚙️ | ×1.0 | ×2 gold on this tile; **enables recruiting** | 2 | 3 |
| 🏰 Castle | 4🪵 + 3⚙️ | ×2.0 | — | 0 | 3 |
| ⛩ Gate | 2🪵 + 1⚙️ | ×1.0 | extends supply lines (see §7) | 0 | unlimited |

- Build on any tile you own that's connected to your Capital. One structure per tile.
- **Demolishing** a structure refunds half its build cost (rounded down) and removes it. The Capital Base can never be demolished.
- Defense multipliers from a structure and from terrain **stack multiplicatively** — a Castle (×2.0) on a Mountain (×2.0) means defenders fight at **4×** their normal strength.

---

## 7. Territory and supply lines

- **Owning a tile is permanent** until someone captures it — moving your units off a tile does *not* give it up.
- Only tiles **connected** to your Capital (via an unbroken chain of your own tiles) actually produce income, and only connected tiles can be built on, recruited from, or developed. Disconnected tiles stay yours but go economically dormant.
- A **Gate** lets your supply line bridge exactly one hop through an adjacent unowned or enemy tile — useful for reconnecting territory that's been cut off, or projecting supply past a chokepoint without needing to own it outright.

---

## 8. Combat and conquest

### Declaring an attack
- Attack from a tile you own (connected to your Capital) to an **adjacent** tile — enemy-owned or unowned.
- You **choose exactly which units** on the source tile join the attack; the rest stay behind. Defenders are always *every* unit present on the target tile — you can't pick and choose as the defender.
- Only one attack total per turn, regardless of which tile it comes from.

### Resolving the battle
Strength isn't just "sum of attack values" — unit *count* matters less than unit *quality*:

```
force strength = (sum of attack stats) × √(number of units)
```

Four Spearmen aren't 4× as strong as one — they're about 2× (√4), so a handful of strong units usually beats a horde of weak ones. The defender's strength is then multiplied by the tile's terrain defense bonus and any structure's defense multiplier (§3, §6).

- **Higher strength wins.** The losing side is entirely wiped out.
- The winning side still takes **some** casualties if the fight was close — the ratio of the two strengths determines how many losses scale in (capped at 50% of the winning force). A total mismatch costs the winner nothing.
- Attacking an **undefended** tile (no units there) is always an automatic win with zero casualties.

### Capturing a tile — the part that surprises people
**Winning the battle does not capture the tile.** Wiping out defenders just clears them out; ownership never changes from combat alone. The only way to actually take territory — whether it's unowned land or an enemy's tile, including their Capital — is the **loyalty/occupation mechanic**:

- Every tile you don't own has a hidden **loyalty** value, starting at **100**.
- If your attacking force includes a **Noble who survives the battle**, that tile's loyalty drops by **45**.
- Loyalty hitting **0 or below captures the tile for you immediately** — in practice this takes **3 successful Noble-led attacks** (100 → 55 → 10 → captured), though attacks from *different* players all count toward the same counter (whoever lands the 3rd hit gets it).
- If the Noble **dies** in that battle, loyalty is untouched that attack — bring backup combat units to keep your Noble alive.
- Loyalty **recovers +10 automatically at the end of every round**, whether or not it was attacked that round — so a slow trickle of occasional attacks can stall out indefinitely against a defender that's also building up forces. You need sustained pressure.
- Capturing an enemy's **Capital Base** eliminates that player on the spot: all their remaining pieces are removed and every other tile they owned reverts to unowned.
- Capturing a non-capital enemy tile transfers any structure standing on it to you intact.

---

## 9. Developing tiles

For **8 gold**, you can permanently develop any tile you own that's connected to your Capital (once per tile, ever):

- A tile that already produces a resource gets a **permanent +2/round bonus** on top of any Farm multiplier.
- A barren tile (no natural resource) **unlocks** its terrain's natural resource at 2/round (Plains→Food, Forest→Wood, Hills/Mountain→Iron).

---

## 10. The economy, step by step (once per round)

After the last player ends their turn each round, for every player in turn order:

1. **Income** — every connected tile pays out gold (based on economic value, doubled by a City) and its resource type if any (boosted ×1.5 by a Farm, or unlocked/boosted by developing). Capital Base adds a flat +1 gold.
2. **Food upkeep** — every unit and every City consumes food. If you're short, the game automatically converts gold to food (3 gold per food) to cover as much of the gap as it can.
3. **Unmet deficit** — anything still short after that is simply unmet for the round. **No units starve or get disbanded.** The only consequence: while your food stockpile sits at 0, you **cannot recruit any new unit that has ongoing food upkeep** (i.e., anything except a food-free unit, which doesn't currently exist — so a 0-food stockpile blocks all recruiting until it recovers).
4. **Connectivity check** — purely informational; flags territory that's become disconnected so you know it's not producing.

---

## 11. Winning

The game ends the moment only one player still has a surviving Capital — **last kingdom standing wins**. (In the vanishingly rare case everyone is eliminated in the same instant, it's recorded as a draw.)

---

## 12. Quick interface reference

- **Click any tile** to select it; the side panel shows whatever's relevant — recruit/build options on your own tiles, an attack option on adjacent unowned/enemy tiles, or just info if it's out of reach.
- **Send Troops**: select your tile → "Send Troops" → click a destination (any tile you own) → choose how many of each unit kind to send → confirm.
- **Attacking**: either click a non-own adjacent tile directly (the game auto-picks your best bordering tile to attack from), or select your own tile → "Attack from here" → click the target on the map. Either way, you then pick exactly which units join the assault before it fires.
- **Siege indicator**: any tile currently being contested shows a colored ring and percentage badge on the board — that's how much loyalty has been stripped away, and whose color is doing the stripping.
