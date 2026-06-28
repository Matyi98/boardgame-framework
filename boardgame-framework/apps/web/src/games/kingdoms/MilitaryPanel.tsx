/**
 * MilitaryPanel — shows units on the selected tile and combat strength preview.
 *
 * Displays:
 *  - All units on the selected tile with attack / defense / HP stats
 *  - When in attack mode: a side-by-side strength comparison bar
 */

import type { KingdomsTileView, KingdomsPlayerView, KingdomsView } from '@bgf/game-core';
import { UNIT_ICONS } from './strings.js';
import { playerColor } from './player-visuals.js';

// ── Combat formula constants ──────────────────────────────────────────────────

const TERRAIN_DEFENSE_BONUS: Record<string, number> = {
  plains:   1.0,
  hills:    1.3,
  forest:   1.5,
  mountain: 2.0,
};

const STRUCTURE_DEFENSE_MULT: Record<string, number> = {
  'capital-base': 2.0,
  castle:         2.0,
};

// Mirrors actions/attack.ts LOYALTY_DAMAGE_PER_ATTACK / MAX_LOYALTY exactly —
// ticket #32 wants loyalty impact shown before the player commits, so this
// has to match the engine's own numbers, not an approximation.
const LOYALTY_DAMAGE_PER_ATTACK = 45;
const MAX_LOYALTY = 100;

// ── Strength calculation ──────────────────────────────────────────────────────

export interface StrengthBreakdown {
  totalAtk: number;
  count: number;
  terrainBonus: number;
  structDefMult: number;
  strength: number;
}

/**
 * @param unitFilter When provided, only pieces whose id is in this set count
 * — used for the attack-select preview so the math reflects exactly the
 * units the player has toggled on, not the whole tile's garrison (the
 * preview used to silently assume every combat-capable unit on the source
 * tile was attacking, which overstated strength the moment a player left
 * any units behind).
 *
 * Ticket #49 bug fix: this used to additionally filter by
 * COMBAT_UNIT_KINDS (spearman/cannoneer only), excluding Nobles entirely.
 * "A Noble can't attack" (§5) means it can't *initiate* a solo attack on an
 * enemy tile — attack.ts's validator is what enforces that, on the action
 * as a whole. It does NOT mean a Noble's ATK is excluded from the force
 * once a battle happens: attackTileExecutor builds combatants from every
 * piece with a non-null attack stat via pieceAsCombatant(), Noble included,
 * and combat.ts's computeStrength() sums all of them under the same √count
 * with no kind filtering at all. The fix is just `p.attack !== null` — the
 * same criterion the engine itself uses.
 */
function computeStrength(
  tile: KingdomsTileView,
  ownerId: string,
  asDefender: boolean,
  unitFilter?: ReadonlySet<string>,
): StrengthBreakdown {
  const combatUnits = tile.pieces.filter(
    (p) => p.attack !== null && p.owner === ownerId
      && (unitFilter === undefined || unitFilter.has(p.id)),
  );
  const totalAtk = combatUnits.reduce((sum, u) => sum + (u.attack ?? 0), 0);
  const count = combatUnits.length;

  const terrainBonus = asDefender ? (TERRAIN_DEFENSE_BONUS[tile.terrain] ?? 1.0) : 1.0;

  const structDefMult = asDefender
    ? tile.pieces
        .filter((p) => p.defenseMultiplier !== null)
        .reduce((max, s) => {
          const m = STRUCTURE_DEFENSE_MULT[s.kind] ?? 1.0;
          return Math.max(max, m);
        }, 1.0)
    : 1.0;

  const strength = count === 0 ? 0 : totalAtk * Math.sqrt(count) * terrainBonus * structDefMult;
  return { totalAtk, count, terrainBonus, structDefMult, strength };
}

/** Mirrors rules/combat.ts resolveAttack() casualty formula exactly. */
function estimateCasualties(attackerCount: number, defenderCount: number, attackerStr: number, defenderStr: number): { attackerWins: boolean; casualties: number } {
  if (defenderCount === 0) return { attackerWins: true, casualties: 0 };
  if (attackerStr > defenderStr) {
    const ratio = defenderStr / attackerStr;
    return { attackerWins: true, casualties: Math.floor(attackerCount * ratio * 0.5) };
  }
  const ratio = attackerStr / defenderStr;
  return { attackerWins: false, casualties: Math.floor(defenderCount * ratio * 0.4) };
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MilitaryPanelProps {
  selectedTile: KingdomsTileView | null;
  attackingTile: KingdomsTileView | null;
  players: readonly KingdomsPlayerView[];
  view: KingdomsView;
  /** attack-select mode: pieceId → whether it's staged to join the attack. */
  attackUnitIds?: Record<string, boolean>;
  /** Ticket #53: true while ActionPanel is composing an attack — it owns the unit list + preview itself then. */
  hideContent?: boolean;
}

// ── Unit grouping ─────────────────────────────────────────────────────────────
//
// Stacks of a dozen+ units on one tile used to render one row per individual
// piece — confusing and unreadable. Group by (owner, kind) and show a count
// plus total remaining HP for the stack instead.

interface UnitGroup {
  kind: string;
  owner: string;
  count: number;
  attack: number | null;
  defense: number | null;
  totalHp: number;
  hasHp: boolean;
}

function groupUnits(units: ReadonlyArray<{ id: string; kind: string; owner: string; attack: number | null; defense: number | null; hp: number | null }>): UnitGroup[] {
  const map = new Map<string, UnitGroup>();
  for (const u of units) {
    const key = `${u.owner}:${u.kind}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (u.hp !== null) { existing.totalHp += u.hp; existing.hasHp = true; }
    } else {
      map.set(key, {
        kind: u.kind,
        owner: u.owner,
        count: 1,
        attack: u.attack,
        defense: u.defense,
        totalHp: u.hp ?? 0,
        hasHp: u.hp !== null,
      });
    }
  }
  return [...map.values()];
}

// ── Unit row (one per kind+owner group, not one per piece) ───────────────────

interface UnitRowProps {
  kind: string;
  count: number;
  attack: number | null;
  defense: number | null;
  totalHp: number;
  hasHp: boolean;
  ownerName: string;
  ownerColor: string;
}

// Ticket #56: #28's fix (⚔/⛨/♥ + tooltip) replaced one undocumented glyph
// (a bare "×" reused for two different meanings in the same row) with three
// new ones — better, but still asks a new player to learn icon-to-stat
// mapping by hovering. Explicit ATK/DEF/HP text labels need no tooltip to
// parse at a glance; tooltips stay only to spell out per-unit vs stack-total,
// which genuinely isn't obvious from the row alone.
function UnitRow({ kind, count, attack, defense, totalHp, hasHp, ownerName, ownerColor }: UnitRowProps): JSX.Element {
  return (
    <div style={{ padding: '4px 0', borderBottom: '1px solid var(--rule)', fontSize: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{UNIT_ICONS[kind] ?? '?'}</span>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: ownerColor,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, fontWeight: 600 }}>{kind} ×{count}</span>
        <span style={{ color: 'var(--fg-dim)', fontSize: 10 }}>{ownerName}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 2, paddingLeft: 19, fontSize: 10 }}>
        <span
          style={{ color: '#e05050' }}
          title={count > 1 ? `${attack ?? 0} attack per unit · ${(attack ?? 0) * count} total for this stack of ${count}` : 'attack (per unit)'}
        >
          ATK {attack ?? '–'}{count > 1 && <span style={{ color: 'var(--fg-dim)' }}> ({(attack ?? 0) * count})</span>}
        </span>
        <span
          style={{ color: '#4090d0' }}
          title={count > 1 ? `${defense ?? 0} defense per unit · ${(defense ?? 0) * count} total for this stack of ${count}` : 'defense (per unit)'}
        >
          DEF {defense ?? '–'}{count > 1 && <span style={{ color: 'var(--fg-dim)' }}> ({(defense ?? 0) * count})</span>}
        </span>
        {hasHp && (
          <span style={{ color: '#40b060' }} title="total HP remaining in this stack">
            HP {totalHp}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Strength bar ──────────────────────────────────────────────────────────────

interface StrengthBarProps {
  attackerStrength: number;
  defenderStrength: number;
  attackerLabel: string;
  defenderLabel: string;
}

function StrengthBar({
  attackerStrength,
  defenderStrength,
  attackerLabel,
  defenderLabel,
}: StrengthBarProps): JSX.Element {
  const total = attackerStrength + defenderStrength;
  const aPct = total === 0 ? 50 : (attackerStrength / total) * 100;
  const attackerWins = attackerStrength > defenderStrength;
  const attackerColor = attackerWins ? '#40b060' : '#e05050';
  const defenderColor = attackerWins ? '#e05050' : '#40b060';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          marginBottom: 4,
          color: 'var(--fg-dim)',
        }}
      >
        <span style={{ color: attackerColor }}>Attacker: {attackerStrength.toFixed(1)}</span>
        <span style={{ color: defenderColor }}>Defender: {defenderStrength.toFixed(1)}</span>
      </div>
      {/* Bar */}
      <div
        style={{
          height: 9,
          borderRadius: 999,
          background: defenderColor,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${aPct}%`,
            background: `linear-gradient(180deg, ${attackerColor}, ${attackerColor}cc)`,
            boxShadow: `0 0 8px ${attackerColor}88`,
            borderRadius: 999,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          marginTop: 3,
          color: 'var(--fg-dim)',
        }}
      >
        <span>{attackerLabel}</span>
        <span>{defenderLabel}</span>
      </div>
    </div>
  );
}

// ── Attack strength preview ───────────────────────────────────────────────────
//
// Extracted to its own export (ticket #53/#54): while composing an attack,
// ActionPanel renders this directly between the unit steppers and the
// confirm/cancel buttons, instead of it only existing inside MilitaryPanel —
// which used to mean the preview sat at the very bottom of a second, stacked
// panel, and MilitaryPanel's own read-only unit list duplicated the
// composer's stepper list above it.

export interface AttackPreviewProps {
  selectedTile: KingdomsTileView;
  attackingTile: KingdomsTileView;
  players: readonly KingdomsPlayerView[];
  view: KingdomsView;
  attackUnitIds?: Record<string, boolean>;
}

export function AttackPreview({ selectedTile, attackingTile, players, view, attackUnitIds }: AttackPreviewProps): JSX.Element {
  const attackerOwner = selectedTile.owner ?? view.currentActivePlayer;
  const defenderOwner = attackingTile.owner;

  // Only filter to the staged subset once the player is actually choosing
  // units (attack-select) — otherwise (e.g. hovering a target before
  // staging) there's no selection yet, so fall back to the whole tile as
  // a rough preview instead of reporting a misleading zero.
  const unitFilter = attackUnitIds
    ? new Set(Object.entries(attackUnitIds).filter(([, v]) => v).map(([id]) => id))
    : undefined;

  const atk = computeStrength(selectedTile, attackerOwner, false, unitFilter);
  const def = defenderOwner
    ? computeStrength(attackingTile, defenderOwner, true)
    : { totalAtk: 0, count: 0, terrainBonus: 1, structDefMult: 1, strength: 0 };

  const attackerPlayer = players.find((p) => p.id === attackerOwner);
  const defenderPlayer = defenderOwner ? players.find((p) => p.id === defenderOwner) : null;

  const { attackerWins, casualties } = estimateCasualties(atk.count, def.count, atk.strength, def.strength);

  // Loyalty impact: only meaningful if a staged Noble could survive a win.
  // Casualty selection is random server-side (see rules/combat.ts
  // pickRandom), so this is honestly conditional, not a guarantee.
  const hasNoble = unitFilter
    ? selectedTile.pieces.some((p) => p.kind === 'noble' && p.owner === attackerOwner && unitFilter.has(p.id))
    : selectedTile.pieces.some((p) => p.kind === 'noble' && p.owner === attackerOwner);
  const currentLoyalty = view.turnState.tileLoyalty[attackingTile.id]?.loyalty ?? MAX_LOYALTY;
  const nextLoyalty = currentLoyalty - LOYALTY_DAMAGE_PER_ATTACK;

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-dim)',
          marginBottom: 6,
        }}
      >
        strength preview
      </div>
      <StrengthBar
        attackerStrength={atk.strength}
        defenderStrength={def.strength}
        attackerLabel={attackerPlayer?.displayName ?? 'attacker'}
        defenderLabel={defenderPlayer?.displayName ?? 'defender'}
      />
      {/* Multiplier breakdown — the formula (§8) broken into its actual
          factors instead of just the final number. */}
      <div style={{ fontSize: 9.5, color: 'var(--fg-dim)', marginTop: 6, lineHeight: 1.6 }}>
        <div>
          atk: Σ{atk.totalAtk} × √{atk.count} ({Math.sqrt(atk.count).toFixed(2)})
          {atk.terrainBonus !== 1 && ` × terrain ${atk.terrainBonus.toFixed(1)}`}
          {atk.structDefMult !== 1 && ` × structure ${atk.structDefMult.toFixed(1)}`}
          {' = '}{atk.strength.toFixed(1)}
        </div>
        <div>
          def: Σ{def.totalAtk} × √{def.count} ({Math.sqrt(def.count || 1).toFixed(2)})
          {def.terrainBonus !== 1 && ` × terrain ${def.terrainBonus.toFixed(1)}`}
          {def.structDefMult !== 1 && ` × structure ${def.structDefMult.toFixed(1)}`}
          {' = '}{def.strength.toFixed(1)}
        </div>
      </div>
      {/* Expected outcome + casualties — mirrors resolveAttack() exactly. */}
      {atk.count > 0 && (
        <div style={{ fontSize: 10, marginTop: 6, color: attackerWins ? '#40b060' : '#e05050' }}>
          {def.count === 0
            ? 'Undefended — automatic win, zero casualties'
            : attackerWins
              ? `Likely win — ~${casualties} casualt${casualties === 1 ? 'y' : 'ies'} on your side`
              : `Likely repelled — you'd lose the whole attacking force`}
        </div>
      )}
      {/* Loyalty impact — erosion only ever happens on a successful attack
          (the Noble can't survive a loss, since the losing side is wiped
          out entirely — §8), and even then only conditionally since
          casualty selection is randomized server-side. Applies on an
          automatic win against an undefended tile too. */}
      {hasNoble && atk.count > 0 && attackerWins && (
        <div style={{ fontSize: 10, marginTop: 3, color: '#d4a820' }}>
          ♛ if your Noble survives: loyalty {currentLoyalty}% → {Math.max(0, nextLoyalty)}%
          {nextLoyalty <= 0 ? ' — captures the tile!' : ''}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MilitaryPanel({
  selectedTile,
  attackingTile,
  players,
  view,
  attackUnitIds,
  hideContent,
}: MilitaryPanelProps): JSX.Element | null {
  // Ticket #53: while composing an attack, ActionPanel renders the unit
  // steppers AND the AttackPreview itself (see above) — this panel showing
  // its own read-only unit list and a second strength preview at the same
  // time was the literal duplication the review screenshot caught.
  if (hideContent) return null;
  if (!selectedTile) return null;

  const units = selectedTile.pieces.filter((p) => p.attack !== null);
  if (units.length === 0 && !attackingTile) return null;

  return (
    <div
      className="k-panel"
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-dim)',
          marginBottom: 8,
        }}
      >
        units on tile
      </div>

      {units.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>no units</div>
      )}

      {groupUnits(units).map((group) => {
        const ownerPlayer = players.find((p) => p.id === group.owner);
        return (
          <UnitRow
            key={`${group.owner}:${group.kind}`}
            kind={group.kind}
            count={group.count}
            attack={group.attack}
            defense={group.defense}
            totalHp={group.totalHp}
            hasHp={group.hasHp}
            ownerName={ownerPlayer?.displayName ?? group.owner.slice(0, 6)}
            ownerColor={playerColor(ownerPlayer?.color ?? '')}
          />
        );
      })}

      {attackingTile && (
        <div style={{ marginTop: 10 }}>
          <AttackPreview
            selectedTile={selectedTile}
            attackingTile={attackingTile}
            players={players}
            view={view}
            attackUnitIds={attackUnitIds}
          />
        </div>
      )}
    </div>
  );
}
