/**
 * ActionPanel — context-sensitive action panel for Kingdoms of Dominion.
 *
 * Interaction model:
 *  - Non-own tile selected + adjacent own tile has units → attack button
 *  - Own tile selected → Send Troops (bulk move), recruit, build, etc.
 *  - mode === 'attack' → waiting for target click on map
 *  - mode === 'attack-select' → choose which units join the attack
 *    (a surviving Noble in the force erodes the target's loyalty — see the
 *    occupation badge below; this is the ONLY way to capture ANY tile,
 *    unowned or enemy-owned — raw combat alone never transfers ownership,
 *    and movement never does either)
 *  - mode === 'send-troops' + no destination → waiting for destination click
 *  - mode === 'send-troops' + destination → unit count selector + confirm
 */

import { useState } from 'react';
import type { KingdomsView, KingdomsTileView, KingdomsPlayerView } from '@bgf/game-core';
import { KINGDOMS_STRINGS, PIECE_INFO, UNIT_ICONS, ALL_PIECE_ICONS } from './strings.js';
import { Badge, Button, CollapsibleSection, Panel, SectionHeader, Tooltip } from './primitives.js';
import { AttackPreview } from './MilitaryPanel.js';

// ── Cost tables ───────────────────────────────────────────────────────────────

interface ResourceCost {
  gold?: number;
  wood?: number;
  iron?: number;
  food?: number;
}

const UNIT_COSTS: Record<string, ResourceCost> = {
  spearman:  { gold: 10, food: 1 },
  cannoneer: { gold: 20, iron: 2 },
  // noble cost is dynamic — see dynamicNobleCost()
};

const STRUCTURE_COSTS: Record<string, ResourceCost> = {
  farm:    { wood: 2 },
  city:    { wood: 3, iron: 2 },
  castle:  { wood: 4, iron: 3 },
  gate:    { wood: 2, iron: 1 },
};

const DEVELOP_COST = 8; // gold

const RECRUIT_STRUCTURES = new Set(['capital-base', 'city']);

// ── Unit / structure icons — see ./strings.ts (UNIT_ICONS / ALL_PIECE_ICONS) ──

const RESOURCE_CHIP_META: Array<{ key: keyof ResourceCost; icon: string; color: string }> = [
  { key: 'gold', icon: '🪙', color: 'var(--k-resource-gold)' },
  { key: 'wood', icon: '🪵', color: 'var(--k-resource-wood)' },
  { key: 'iron', icon: '⚙️', color: 'var(--k-resource-iron)' },
  { key: 'food', icon: '🌾', color: 'var(--k-resource-food)' },
];

// ── Piece info (for tooltips) — see ./strings.ts for the actual copy ─────────

// ── Dynamic noble cost (mirrors recruit.ts backend formula) ───────────────────

function dynamicNobleCost(currentNobleCount: number): ResourceCost {
  return {
    gold: Math.ceil(8 * Math.pow(1.7, Math.max(0, currentNobleCount - 1))),
    iron: 1,
    food: 1,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function canAfford(player: KingdomsPlayerView, cost: ResourceCost): boolean {
  if ((cost.gold ?? 0) > player.gold) return false;
  if ((cost.wood ?? 0) > player.wood) return false;
  if ((cost.iron ?? 0) > player.iron) return false;
  if ((cost.food ?? 0) > player.food) return false;
  return true;
}

/** Ticket #29: spell out exactly what's short, instead of just graying out the row. */
function missingResourceText(player: KingdomsPlayerView, cost: ResourceCost): string | undefined {
  const missing: string[] = [];
  if ((cost.gold ?? 0) > player.gold) missing.push(`${(cost.gold ?? 0) - player.gold}🪙`);
  if ((cost.wood ?? 0) > player.wood) missing.push(`${(cost.wood ?? 0) - player.wood}🪵`);
  if ((cost.iron ?? 0) > player.iron) missing.push(`${(cost.iron ?? 0) - player.iron}⚙️`);
  if ((cost.food ?? 0) > player.food) missing.push(`${(cost.food ?? 0) - player.food}🌾`);
  return missing.length > 0 ? `need ${missing.join(' ')} more` : undefined;
}

/** Pill chips per resource in a cost — tinted red when the player can't afford that resource. */
function CostChips({ cost, player }: { cost: ResourceCost; player: KingdomsPlayerView }): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {RESOURCE_CHIP_META.filter(({ key }) => cost[key]).map(({ key, icon, color }) => {
        const short = (player[key] ?? 0) < (cost[key] ?? 0);
        return (
          <Badge key={key} color={color} short={short}>
            {cost[key]}{icon}
          </Badge>
        );
      })}
    </span>
  );
}

function terrainLabel(terrain: string): string {
  return terrain.charAt(0).toUpperCase() + terrain.slice(1);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActionPanelProps {
  view: KingdomsView;
  userId: string | null;
  selectedTile: KingdomsTileView | null;
  mode: 'idle' | 'attack' | 'attack-select' | 'send-troops';
  /** Own tile auto-selected as attack source when a non-own tile is clicked. */
  attackSourceTile: KingdomsTileView | null;
  /** Whether the selected non-own tile is adjacent to any of the player's tiles at all. */
  isAdjacentToTerritory: boolean;
  /** attack-select mode: the staged attack's source and target tiles. */
  attackFromTile: KingdomsTileView | null;
  attackToTile: KingdomsTileView | null;
  /** attack-select mode: pieceId → whether it's included in the attack force. */
  attackUnitIds: Record<string, boolean>;
  /** Adjust how many units of one kind join the attack (+1/-1 per click). */
  onAttackUnitCountChange: (kind: string, delta: number) => void;
  onConfirmAttack: () => void;
  onCancelAttack: () => void;
  sendFromTile: KingdomsTileView | null;
  sendToTile: KingdomsTileView | null;
  sendCounts: Record<string, number>;
  /** Adjust how many units of one kind are sent (+1/-1 per click). */
  onSendUnitCountChange: (kind: string, delta: number) => void;
  /** Enter attack mode from a specific own tile; user then clicks target on map. */
  onStartAttackFromTile: (fromTileId: string) => void;
  /** Auto-selected source + clicked non-own target → stages unit selection. */
  onAttackTarget: (fromTileId: string, toTileId: string) => void;
  /** Enter send-troops mode from an own tile; user then clicks destination. */
  onStartSendTroops: (fromTileId: string) => void;
  onConfirmSend: () => void;
  onCancelSend: () => void;
  onRecruit: (unitKind: string) => void;
  onBuild: (structureKind: string) => void;
  onDemolish: (structureKind: string) => void;
  onDevelop: () => void;
  onCancel: () => void;
}

// ── Tile info badge ───────────────────────────────────────────────────────────

const RESOURCE_TYPE_META: Record<string, { icon: string; color: string }> = {
  wood: { icon: '🪵', color: 'var(--k-resource-wood)' },
  food: { icon: '🌾', color: 'var(--k-resource-food)' },
  iron: { icon: '⚙️', color: 'var(--k-resource-iron)' },
};

function TileInfoBadge({ tile, players }: { tile: KingdomsTileView; players: readonly KingdomsPlayerView[] }): JSX.Element {
  const owner = tile.owner ? players.find((p) => p.id === tile.owner) : null;
  const resMeta = tile.resourceType ? RESOURCE_TYPE_META[tile.resourceType] : undefined;
  return (
    <div style={{ fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ color: 'var(--fg)', fontWeight: 700, fontSize: 12 }}>{terrainLabel(tile.terrain)}</span>
        <Badge color="var(--accent)">eco {tile.economicValue}</Badge>
        {resMeta && (
          <Badge color={resMeta.color}>{resMeta.icon} {tile.resourceType}</Badge>
        )}
        {tile.developed && (
          <Badge color="var(--k-resource-gold)">★ developed</Badge>
        )}
      </div>
      <div>
        {owner ? (
          <>owned by <span style={{ color: 'var(--accent)' }}>{owner.displayName}</span></>
        ) : (
          <span>unclaimed</span>
        )}
      </div>
      {tile.incomePreview && (
        <div style={{ color: '#40b060', marginTop: 2 }}>
          income: +{tile.incomePreview.gold}🪙
          {tile.incomePreview.resource && ` +${tile.incomePreview.resourceAmount} ${tile.incomePreview.resource}`}
        </div>
      )}
    </div>
  );
}

// ── Item row (button + info toggle) ──────────────────────────────────────────

interface ItemRowProps {
  id: string;
  label: string;
  icon?: string;
  cost: ResourceCost;
  player: KingdomsPlayerView;
  disabled: boolean;
  alreadyDone?: boolean;
  /** Ticket #29: why the row is disabled, when it's not just "already done". */
  disabledReason?: string;
  activeInfo: string | null;
  onAction: () => void;
  onToggleInfo: (id: string) => void;
}

function ItemRow({ id, label, icon, cost, player, disabled, alreadyDone, disabledReason, activeInfo, onAction, onToggleInfo }: ItemRowProps): JSX.Element {
  const info = PIECE_INFO[id];
  const isInfoOpen = activeInfo === id;
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        <Button
          variant="ghost"
          style={{
            flex: 1,
            fontSize: 11,
            opacity: disabled ? 0.45 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={onAction}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
            <span>{label}{alreadyDone ? ' ✓' : ''}</span>
          </span>
          <CostChips cost={cost} player={player} />
        </Button>
        {info && (
          <Button
            variant="ghost"
            className="k-info-btn"
            title={`About ${info.label}`}
            onClick={() => onToggleInfo(id)}
          >
            ℹ
          </Button>
        )}
      </div>
      {/* Ticket #29: a disabled row says why, instead of silently graying out
          and leaving the player to click into a server-side rejection. */}
      {disabled && disabledReason && !alreadyDone && (
        <div style={{ fontSize: 9, color: '#e05050', marginTop: 2, paddingLeft: 2 }}>
          {disabledReason}
        </div>
      )}
      {isInfoOpen && info && (
        <Tooltip>
          <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3 }}>{info.label}</div>
          <div style={{ fontSize: 10, lineHeight: 1.5 }}>{info.desc}</div>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 3 }}>{info.stats}</div>
        </Tooltip>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
//
// Ticket #63: there used to be an EndTurnFooter here too, repeating the
// exact same "waiting for X" text the persistent bottom bar (KingdomsPage.tsx)
// already shows in every mode, since that bar lives outside the
// mode-dependent panel content and is always on screen. One canonical
// placement now — the bottom bar.

export function ActionPanel({
  view,
  userId,
  selectedTile,
  mode,
  attackSourceTile,
  isAdjacentToTerritory,
  attackFromTile,
  attackToTile,
  attackUnitIds,
  onAttackUnitCountChange,
  onConfirmAttack,
  onCancelAttack,
  sendFromTile,
  sendToTile,
  sendCounts,
  onSendUnitCountChange,
  onStartAttackFromTile,
  onAttackTarget,
  onStartSendTroops,
  onConfirmSend,
  onCancelSend,
  onRecruit,
  onBuild,
  onDemolish,
  onDevelop,
  onCancel,
}: ActionPanelProps): JSX.Element {
  const [activeInfo, setActiveInfo] = useState<string | null>(null);

  const me = userId ? view.players.find((p) => p.id === userId) : null;
  const isMyTurn = !!userId && view.currentActivePlayer === userId;
  const turnState = view.turnState;

  const myNobleCount = userId
    ? view.tiles.reduce((sum, t) => sum + t.pieces.filter((p) => p.kind === 'noble' && p.owner === userId).length, 0)
    : 0;

  const effectiveUnitCosts: Record<string, ResourceCost> = {
    ...UNIT_COSTS,
    noble: dynamicNobleCost(myNobleCount),
  };

  const toggleInfo = (id: string) => setActiveInfo((prev) => (prev === id ? null : id));

  // ── Mode: attack (waiting for target click on map) ───────────────────────
  if (mode === 'attack') {
    return (
      <Panel>
        <div className="k-action-panel__mode-header k-action-panel__mode-header--attack">
          {KINGDOMS_STRINGS.modeHeaders.attack}
        </div>
        <Button variant="ghost" style={{ width: '100%' }} onClick={onCancel}>
          cancel
        </Button>
      </Panel>
    );
  }

  // ── Attack-select mode: choose which units attack ────────────────────────
  if (mode === 'attack-select' && attackFromTile && attackToTile) {
    const targetIsUnowned = attackToTile.owner === null;
    const candidateUnits = attackFromTile.pieces.filter((p) => p.attack !== null && p.owner === userId);

    // Group by kind so multiple units of the same kind show one row with a counter,
    // instead of a separate toggle button per individual unit.
    const groups = new Map<string, typeof candidateUnits>();
    for (const u of candidateUnits) {
      const list = groups.get(u.kind);
      if (list) list.push(u);
      else groups.set(u.kind, [u]);
    }

    const validSelection = targetIsUnowned
      ? candidateUnits.some((u) => attackUnitIds[u.id])
      : candidateUnits.some((u) => u.kind !== 'noble' && attackUnitIds[u.id]);

    return (
      <Panel>
        <div className="k-action-panel__mode-header k-action-panel__mode-header--attack">
          {KINGDOMS_STRINGS.modeHeaders.attackSelect}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
          {terrainLabel(attackFromTile.terrain)} → {terrainLabel(attackToTile.terrain)}
          <span style={{ marginLeft: 6, color: '#d4a820' }}>
            ({KINGDOMS_STRINGS.attackSelect.loyaltyNote})
          </span>
        </div>

        <SectionHeader>units on this tile</SectionHeader>
        {groups.size === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>{KINGDOMS_STRINGS.attackSelect.noUnitsAvailable}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...groups.entries()].map(([kind, units]) => {
              const selectedCount = units.filter((u) => attackUnitIds[u.id]).length;
              return (
                <div
                  key={kind}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 5,
                    background: selectedCount > 0 ? 'rgba(224,80,80,0.12)' : 'transparent',
                    border: `1px solid ${selectedCount > 0 ? '#e05050' : 'var(--rule)'}`,
                    fontSize: 11,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {UNIT_ICONS[kind] ?? '•'} {PIECE_INFO[kind]?.label ?? kind}
                  </span>
                  <Button
                    variant="ghost"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    disabled={selectedCount === 0}
                    onClick={() => onAttackUnitCountChange(kind, -1)}
                    ariaLabel={`Remove one ${kind} from the attack`}
                  >
                    −
                  </Button>
                  <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>
                    {selectedCount}/{units.length}
                  </span>
                  <Button
                    variant="ghost"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    disabled={selectedCount >= units.length}
                    onClick={() => onAttackUnitCountChange(kind, 1)}
                    ariaLabel={`Add one ${kind} to the attack`}
                  >
                    +
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {/* Ticket #54: strength preview sits between the steppers and the
            confirm buttons — it's the single most important input to the
            decision, so it can't be the thing you have to scroll past. */}
        <AttackPreview
          selectedTile={attackFromTile}
          attackingTile={attackToTile}
          players={view.players}
          view={view}
          attackUnitIds={attackUnitIds}
        />

        {!validSelection && (
          <div style={{ fontSize: 10, color: '#e05050', marginTop: 4 }}>
            {targetIsUnowned ? KINGDOMS_STRINGS.attackSelect.noSelectionUnowned : KINGDOMS_STRINGS.attackSelect.noSelectionEnemy}
          </div>
        )}

        {/* Ticket #55: sticky footer — these buttons used to just flow with
            the rest of the panel and could end up clipped below the fold
            depending on how much content (steppers, preview) preceded them. */}
        <div className="k-action-panel__sticky-footer" style={{ display: 'flex', gap: 6 }}>
          <Button variant="danger" style={{ flex: 1 }} disabled={!validSelection} onClick={onConfirmAttack}>
            {KINGDOMS_STRINGS.attackSelect.confirmButton}
          </Button>
          <Button variant="ghost" style={{ flex: 1 }} onClick={onCancelAttack}>
            cancel
          </Button>
        </div>
      </Panel>
    );
  }

  // ── Send-troops mode: waiting for destination click ──────────────────────
  if (mode === 'send-troops' && sendFromTile && !sendToTile) {
    return (
      <Panel>
        <div className="k-action-panel__mode-header k-action-panel__mode-header--move">
          {KINGDOMS_STRINGS.modeHeaders.sendTroopsWaiting}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>
          From: {terrainLabel(sendFromTile.terrain)} tile
        </div>
        <Button variant="ghost" style={{ width: '100%' }} onClick={onCancelSend}>
          cancel
        </Button>
      </Panel>
    );
  }

  // ── Send-troops mode: destination chosen — show unit selector ────────────
  if (mode === 'send-troops' && sendFromTile && sendToTile) {
    const movableUnits = sendFromTile.pieces.filter(
      (p) => p.attack !== null && !turnState.movedThisTurn.includes(p.id) && p.owner === userId,
    );
    const anySelected = movableUnits.some((p) => (sendCounts[p.id] ?? 0) > 0);

    // Group by kind so multiple units of the same kind show one row with a
    // counter, instead of a separate toggle button per individual unit.
    const groups = new Map<string, typeof movableUnits>();
    for (const u of movableUnits) {
      const list = groups.get(u.kind);
      if (list) list.push(u);
      else groups.set(u.kind, [u]);
    }

    // Ticket #33: a one-line confirm summary so committing to "Send" never
    // requires re-checking every stepper to remember what was actually staged.
    const sendSummary = [...groups.entries()]
      .map(([kind, units]) => ({ kind, count: units.filter((u) => (sendCounts[u.id] ?? 0) > 0).length }))
      .filter(({ count }) => count > 0)
      .map(({ kind, count }) => `${count}${UNIT_ICONS[kind] ?? ''}`)
      .join(' ');

    return (
      <Panel>
        <div className="k-action-panel__mode-header k-action-panel__mode-header--move">
          {KINGDOMS_STRINGS.modeHeaders.sendTroopsSelect}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
          {terrainLabel(sendFromTile.terrain)} → {terrainLabel(sendToTile.terrain)}
        </div>

        <SectionHeader>select units to send</SectionHeader>
        {groups.size === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>
            {KINGDOMS_STRINGS.sendTroops.noMovableUnits}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...groups.entries()].map(([kind, units]) => {
              const selectedCount = units.filter((u) => (sendCounts[u.id] ?? 0) > 0).length;
              return (
                <div
                  key={kind}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 5,
                    background: selectedCount > 0 ? 'rgba(64,144,208,0.12)' : 'transparent',
                    border: `1px solid ${selectedCount > 0 ? '#4090d0' : 'var(--rule)'}`,
                    fontSize: 11,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {UNIT_ICONS[kind] ?? '•'} {PIECE_INFO[kind]?.label ?? kind}
                  </span>
                  <Button
                    variant="ghost"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    disabled={selectedCount === 0}
                    onClick={() => onSendUnitCountChange(kind, -1)}
                    ariaLabel={`Remove one ${kind} from the troops being sent`}
                  >
                    −
                  </Button>
                  <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>
                    {selectedCount}/{units.length}
                  </span>
                  <Button
                    variant="ghost"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    disabled={selectedCount >= units.length}
                    onClick={() => onSendUnitCountChange(kind, 1)}
                    ariaLabel={`Add one ${kind} to the troops being sent`}
                  >
                    +
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {anySelected && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 8, textAlign: 'center' }}>
            Sending {sendSummary} → {terrainLabel(sendToTile.terrain)} tile
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Button
            style={{ flex: 1 }}
            disabled={!anySelected}
            onClick={onConfirmSend}
          >
            Send →
          </Button>
          <Button variant="ghost" style={{ flex: 1 }} onClick={onCancelSend}>
            cancel
          </Button>
        </div>
      </Panel>
    );
  }

  // ── Idle — derive per-tile state ──────────────────────────────────────────
  const isOwnTile = !!userId && selectedTile?.owner === userId;
  const isConnected = isOwnTile && selectedTile?.incomePreview !== null;

  const hasBulkMovableUnits = !!selectedTile && selectedTile.pieces.some(
    (p) => p.attack !== null && !turnState.movedThisTurn.includes(p.id) && p.owner === userId,
  );

  const hasRecruitStructure = selectedTile
    ? selectedTile.pieces.some((p) => p.defenseMultiplier !== null && RECRUIT_STRUCTURES.has(p.kind))
    : false;

  const existingStructures = selectedTile
    ? selectedTile.pieces.filter((p) => p.defenseMultiplier !== null).map((p) => p.kind)
    : [];

  // Only one attack is allowed per player per turn, globally — not per source
  // tile. (findAttackSource already excludes any tile in attackedFrom, so by
  // the time attackSourceTile comes back non-null it can never itself be the
  // tile that already attacked — checking attackedFrom against attackSourceTile
  // specifically would always read false and never explain the real reason.)
  const hasAttackedThisTurn = turnState.attackedFrom.length > 0;

  // Attack: from own tile that hasn't attacked yet. Any attack-capable unit
  // counts here (including a lone Noble) — the per-target validator decides
  // whether that force is actually sufficient (Noble alone is fine vs an
  // unowned tile, but not vs an enemy-owned one).
  const attackUnitsOnOwnTile = isOwnTile && selectedTile
    ? selectedTile.pieces.filter((p) => p.attack !== null && p.owner === userId)
    : [];

  // Attack: non-own tile auto-sourced from adjacent own tile
  const isAttackableTile = !!selectedTile && selectedTile.owner !== userId && attackSourceTile !== null && !hasAttackedThisTurn;

  // Loyalty/occupation progress on the selected non-own tile
  const occupation = selectedTile ? turnState.tileLoyalty[selectedTile.id] : undefined;
  const capturedPct = occupation ? 100 - occupation.loyalty : 0;

  return (
    <Panel>
      {/* Tile info */}
      {selectedTile ? (
        <div>
          <SectionHeader>selected tile</SectionHeader>
          <TileInfoBadge tile={selectedTile} players={view.players} />
        </div>
      ) : (
        <div style={{ color: 'var(--fg-dim)', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
          Click a tile to select it
        </div>
      )}

      {/* Loyalty/occupation badge on non-own tiles */}
      {selectedTile && !isOwnTile && occupation && (
        <div style={{ fontSize: 11, color: '#d4a820', marginTop: 4 }}>
          {KINGDOMS_STRINGS.occupation.badge(capturedPct, occupation.loyalty)}
        </div>
      )}

      {selectedTile && <div className="k-action-panel__divider" />}

      {/* ── Non-own tile: attack button ── */}
      {isMyTurn && isAttackableTile && selectedTile && attackSourceTile && (
        <div>
          <SectionHeader>combat</SectionHeader>
          <Button
            variant="danger"
            style={{ width: '100%', marginBottom: 4 }}
            onClick={() => onAttackTarget(attackSourceTile.id, selectedTile.id)}
          >
            ⚔ Choose units to attack
          </Button>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', textAlign: 'center' }}>
            from: {terrainLabel(attackSourceTile.terrain)} tile
          </div>
        </div>
      )}
      {/* Explain why no attack button shows, instead of silently showing nothing.
          "Already attacked" takes priority — it's the most common reason and
          the only one that's never wrong (unlike adjacency, which is auto-found
          and can look surprising if it's the unit-availability, not geometry). */}
      {isMyTurn && selectedTile && !isOwnTile && !isAttackableTile && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center', padding: '4px 0' }}>
          {hasAttackedThisTurn
            ? KINGDOMS_STRINGS.attackUnavailable.alreadyAttacked
            : isAdjacentToTerritory
              ? (selectedTile.owner === null
                  ? KINGDOMS_STRINGS.attackUnavailable.noUnitUnowned
                  : KINGDOMS_STRINGS.attackUnavailable.noUnitEnemy)
              : KINGDOMS_STRINGS.attackUnavailable.notAdjacent}
        </div>
      )}

      {/* ── Own tile: attack from here → enter attack mode ── */}
      {isMyTurn && isOwnTile && attackUnitsOnOwnTile.length > 0 && !hasAttackedThisTurn && selectedTile && (
        <div>
          <SectionHeader>combat</SectionHeader>
          <Button
            variant="danger"
            style={{ width: '100%' }}
            onClick={() => onStartAttackFromTile(selectedTile.id)}
          >
            ⚔ Attack from here
          </Button>
        </div>
      )}
      {isMyTurn && isOwnTile && attackUnitsOnOwnTile.length > 0 && hasAttackedThisTurn && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>
          {KINGDOMS_STRINGS.attackUnavailable.alreadyAttacked}
        </div>
      )}

      {/* ── Own tile: send troops (bulk move to own tiles) ── */}
      {isMyTurn && isOwnTile && hasBulkMovableUnits && selectedTile && (
        <div>
          <SectionHeader>movement</SectionHeader>
          <Button
            variant="blue"
            style={{ width: '100%' }}
            onClick={() => onStartSendTroops(selectedTile.id)}
          >
            📦 Send Troops
          </Button>
        </div>
      )}

      {/* ── Own tile: recruit (ticket #27: collapsed by default — this and
          Build were the biggest contributors to the panel's "long scroll
          with no clear priority" problem) ── */}
      {isMyTurn && isOwnTile && hasRecruitStructure && me && (
        <CollapsibleSection title="recruit">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(effectiveUnitCosts).map(([kind, cost]) => {
              const affordable = canAfford(me, cost);
              const info = PIECE_INFO[kind];
              return (
                <ItemRow
                  key={kind}
                  id={kind}
                  label={info?.label ?? kind}
                  icon={ALL_PIECE_ICONS[kind]}
                  cost={cost}
                  player={me}
                  disabled={!affordable}
                  disabledReason={missingResourceText(me, cost)}
                  activeInfo={activeInfo}
                  onAction={() => onRecruit(kind)}
                  onToggleInfo={toggleInfo}
                />
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Build structure ── */}
      {isMyTurn && isConnected && me && (
        <CollapsibleSection title="build structure">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(STRUCTURE_COSTS).map(([kind, cost]) => {
              const affordable = canAfford(me, cost);
              const alreadyBuilt = existingStructures.includes(kind);
              // Ticket #29 / real bug: §6 allows exactly one structure per
              // tile, period — not one of each kind. This used to only check
              // for a duplicate of the SAME kind, so a tile with a Farm could
              // still show "Build City" as enabled and let the player click
              // straight into the server's "structure already exists" reject.
              const tileOccupied = existingStructures.length > 0;
              const disabled = !affordable || tileOccupied;
              const info = PIECE_INFO[kind];
              return (
                <ItemRow
                  key={kind}
                  id={kind}
                  label={info?.label ?? kind}
                  icon={ALL_PIECE_ICONS[kind]}
                  cost={cost}
                  player={me}
                  disabled={disabled}
                  alreadyDone={alreadyBuilt}
                  disabledReason={!affordable ? missingResourceText(me, cost) : tileOccupied ? 'tile already has a structure' : undefined}
                  activeInfo={activeInfo}
                  onAction={() => onBuild(kind)}
                  onToggleInfo={toggleInfo}
                />
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Demolish structure ── */}
      {isMyTurn && isOwnTile && existingStructures.filter((s) => s !== 'capital-base').length > 0 && (
        <div>
          <SectionHeader>demolish</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {existingStructures
              .filter((s) => s !== 'capital-base')
              .map((kind) => (
                <Button
                  key={kind}
                  variant="ghost"
                  style={{ width: '100%', fontSize: 11, color: '#e05050', borderColor: '#e05050', opacity: 0.7 }}
                  onClick={() => onDemolish(kind)}
                >
                  demolish {ALL_PIECE_ICONS[kind] ?? ''} {PIECE_INFO[kind]?.label ?? kind}
                </Button>
              ))}
          </div>
        </div>
      )}

      {/* ── Develop tile ── */}
      {isMyTurn && isConnected && !selectedTile?.developed && me && (
        <div>
          <ItemRow
            id="develop"
            label="Develop tile"
            icon="🏗"
            cost={{ gold: DEVELOP_COST }}
            player={me}
            disabled={me.gold < DEVELOP_COST}
            disabledReason={missingResourceText(me, { gold: DEVELOP_COST })}
            activeInfo={activeInfo}
            onAction={onDevelop}
            onToggleInfo={toggleInfo}
          />
        </div>
      )}
    </Panel>
  );
}
