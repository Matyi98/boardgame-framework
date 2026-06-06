import { actionError } from '../../actions/action.js';
import type { ActionValidator } from '../../actions/action-validator.js';
import type { ActionExecutor } from '../../actions/action-executor.js';
import type { GameState } from '../../state/game-state.js';
import type { GameEvent } from '../../events/game-event.js';
import { makeUnit } from '../../pieces/unit.js';

export const TERRAIN_VP: Readonly<Record<string, number>> = {
  grass:    1,
  forest:   2,
  mountain: 3,
};

export const TERRAIN_RESOURCE: Readonly<Record<string, string | null>> = {
  grass:    null,
  forest:   'wood',
  mountain: 'stone',
};

const HEX_DIRS = [
  { q:  1, r:  0 }, { q: -1, r:  0 },
  { q:  0, r:  1 }, { q:  0, r: -1 },
  { q:  1, r: -1 }, { q: -1, r:  1 },
] as const;

// ── Shared trade-offer type (mirrored in web/src/store/game.ts) ────────────────
export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  giveWood: number;
  giveStone: number;
  wantWood: number;
  wantStone: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function ownedTileCoords(state: GameState, playerId: string): Array<{ q: number; r: number }> {
  const coords: Array<{ q: number; r: number }> = [];
  for (const [, piece] of state.pieces) {
    if (piece.owner === playerId && piece.location.kind === 'tile') {
      const t = state.map.tileById((piece.location as { kind: 'tile'; tileId: string }).tileId);
      if (t) coords.push(t.coord);
    }
  }
  return coords;
}

function isTileOccupied(state: GameState, tileId: string): boolean {
  return [...state.pieces.values()].some(
    (p) => p.location.kind === 'tile' && (p.location as { kind: 'tile'; tileId: string }).tileId === tileId,
  );
}

function tileOwner(state: GameState, tileId: string): string | null {
  for (const piece of state.pieces.values()) {
    if (piece.location.kind === 'tile' && (piece.location as { kind: 'tile'; tileId: string }).tileId === tileId) {
      return piece.owner;
    }
  }
  return null;
}

function getOffers(state: GameState): TradeOffer[] {
  return (state.extras['tradeOffers'] as TradeOffer[] | undefined) ?? [];
}

// ─── claim-tile ──────────────────────────────────────────────────────────────

export interface ClaimTilePayload { readonly tileId: string; }

export const claimTileValidator: ActionValidator<ClaimTilePayload> = {
  type: 'claim-tile',
  validate(state, action) {
    const { playerId } = action;
    if (!playerId) return actionError('no-player', 'System actions cannot claim tiles');

    const turn = state.rounds.turn();
    if (turn.activePlayer !== playerId) return actionError('not-your-turn', 'It is not your turn');
    if (turn.currentPhaseId !== 'turn') return actionError('wrong-phase', 'Tiles can only be claimed during the turn phase');
    if (turn.flags['claimedThisTurn']) return actionError('already-claimed', 'You already claimed a tile this turn — pass or trade');

    const tile = state.map.tileById(action.payload.tileId);
    if (!tile) return actionError('invalid-tile', `Tile "${action.payload.tileId}" does not exist`);
    if (isTileOccupied(state, action.payload.tileId)) return actionError('tile-occupied', 'That tile is already claimed');

    if (!turn.flags['stoneLeap']) {
      const ownedCoords = ownedTileCoords(state, playerId);
      if (ownedCoords.length === 0) return actionError('no-territory', 'You have no territory to expand from');
      const { q: tq, r: tr } = tile.coord;
      const adjacent = HEX_DIRS.some(({ q: dq, r: dr }) =>
        ownedCoords.some((c) => c.q === tq - dq && c.r === tr - dr),
      );
      if (!adjacent) return actionError('not-adjacent', 'You can only claim tiles adjacent to your territory (or spend 2 stone to leap)');
    }
    return null;
  },
};

export const claimTileExecutor: ActionExecutor<ClaimTilePayload> = {
  type: 'claim-tile',
  execute(state, action) {
    const { tileId } = action.payload;
    const playerId = action.playerId!;
    const tile = state.map.tileById(tileId)!;
    const baseVp = TERRAIN_VP[tile.terrain] ?? 1;

    const die1 = state.rng.intInRange(1, 6);
    const die2 = state.rng.intInRange(1, 6);
    const diceRoll = die1 + die2;
    const bonusVp = diceRoll >= 10 ? 2 : diceRoll >= 7 ? 1 : 0;
    const vp = baseVp + bonusVp;

    const resource = TERRAIN_RESOURCE[tile.terrain];
    const inv = state.inventories.get(playerId)!;
    inv.add('vp', vp);
    if (resource) inv.add(resource, 1);

    const pieceId = `flag-${playerId}-${tileId}`;
    state.pieces.set(pieceId, makeUnit({ id: pieceId, kind: 'flag', owner: playerId, tileId }));

    state.rounds.setFlag('claimedThisTurn', true);
    state.rounds.setFlag('stoneLeap', false);

    return [{
      type: 'tile-claimed',
      playerId,
      payload: { tileId, terrain: tile.terrain, vp, claimedBy: playerId, diceRoll, die1, die2, bonusVp, resource },
    }];
  },
};

// ─── end-turn ────────────────────────────────────────────────────────────────

export const endTurnValidator: ActionValidator<Record<string, never>> = {
  type: 'end-turn',
  validate(state, action) {
    if (!action.playerId) return actionError('no-player', 'System actions cannot end turns');
    if (state.rounds.turn().activePlayer !== action.playerId) return actionError('not-your-turn', 'It is not your turn');
    return null;
  },
};

export const endTurnExecutor: ActionExecutor<Record<string, never>> = {
  type: 'end-turn',
  execute(state, action) {
    const prevRound = state.rounds.round();
    const { newActivePlayer, newRound } = state.rounds.endTurn(state.players.all(), 'turn');
    const events: GameEvent[] = [
      { type: 'turn-ended', playerId: action.playerId, payload: { newActivePlayer } },
    ];

    if (newRound) {
      events.push({ type: 'round-ended', payload: { round: prevRound } });

      // ── Fort income: +1 VP per fortified tile ──────────────────────────────
      const forts = (state.extras['fortifications'] as Record<string, string> | undefined) ?? {};
      for (const [tileId, ownerId] of Object.entries(forts)) {
        const inv = state.inventories.get(ownerId);
        if (inv) {
          inv.add('vp', 1);
          events.push({ type: 'fort-income', playerId: ownerId, payload: { tileId, vp: 1 } });
        }
      }

      // ── Tile passive income: forest→wood, mountain→stone per owned tile ────
      const tileIncome: Record<string, { wood: number; stone: number }> = {};
      for (const [, piece] of state.pieces) {
        if (piece.location.kind !== 'tile') continue;
        const locTileId = (piece.location as { kind: 'tile'; tileId: string }).tileId;
        const tile = state.map.tileById(locTileId);
        if (!tile) continue;
        const resource = TERRAIN_RESOURCE[tile.terrain];
        if (!resource) continue;
        const entry = tileIncome[piece.owner] ?? { wood: 0, stone: 0 };
        if (resource === 'wood') entry.wood += 1;
        if (resource === 'stone') entry.stone += 1;
        tileIncome[piece.owner] = entry;
      }
      for (const [ownerId, income] of Object.entries(tileIncome)) {
        const inv = state.inventories.get(ownerId);
        if (!inv) continue;
        if (income.wood > 0) inv.add('wood', income.wood);
        if (income.stone > 0) inv.add('stone', income.stone);
        events.push({ type: 'tile-income', playerId: ownerId, payload: { wood: income.wood, stone: income.stone } });
      }
    }

    return events;
  },
};

// ─── trade (resource conversion) ─────────────────────────────────────────────

export interface TradePayload { readonly resource: 'wood' | 'stone'; }

export const tradeValidator: ActionValidator<TradePayload> = {
  type: 'trade',
  validate(state, action) {
    const { playerId } = action;
    if (!playerId) return actionError('no-player', 'No player');
    if (state.rounds.turn().activePlayer !== playerId) return actionError('not-your-turn', 'Not your turn');

    const { resource } = action.payload;
    if (resource !== 'wood' && resource !== 'stone') return actionError('invalid-resource', 'Trade wood or stone');

    const inv = state.inventories.get(playerId)!;
    if (inv.get(resource) < 2) return actionError('insufficient', `Need 2 ${resource} to trade (have ${inv.get(resource)})`);
    if (resource === 'stone' && state.rounds.turn().flags['stoneLeap']) {
      return actionError('already-leaping', 'Stone leap is already active this turn');
    }
    return null;
  },
};

export const tradeExecutor: ActionExecutor<TradePayload> = {
  type: 'trade',
  execute(state, action) {
    const playerId = action.playerId!;
    const { resource } = action.payload;
    const inv = state.inventories.get(playerId)!;
    inv.remove(resource, 2);

    if (resource === 'wood') {
      inv.add('vp', 1);
      return [{ type: 'trade', playerId, payload: { resource, effect: 'vp', amount: 1 } }];
    } else {
      state.rounds.setFlag('stoneLeap', true);
      return [{ type: 'trade', playerId, payload: { resource, effect: 'stone-leap' } }];
    }
  },
};

// ─── fortify ─────────────────────────────────────────────────────────────────

export interface FortifyPayload { readonly tileId: string; }

export const fortifyValidator: ActionValidator<FortifyPayload> = {
  type: 'fortify',
  validate(state, action) {
    const { playerId } = action;
    if (!playerId) return actionError('no-player', 'No player');
    if (state.rounds.turn().activePlayer !== playerId) return actionError('not-your-turn', 'Not your turn');

    const inv = state.inventories.get(playerId)!;
    if (inv.get('wood') < 2) return actionError('insufficient', `Need 2 wood to fortify (have ${inv.get('wood')})`);
    if (inv.get('stone') < 1) return actionError('insufficient', `Need 1 stone to fortify (have ${inv.get('stone')})`);

    const { tileId } = action.payload;
    const tile = state.map.tileById(tileId);
    if (!tile) return actionError('invalid-tile', 'Tile does not exist');
    if (tileOwner(state, tileId) !== playerId) return actionError('not-yours', 'You can only fortify tiles you own');

    const forts = (state.extras['fortifications'] as Record<string, string> | undefined) ?? {};
    if (forts[tileId]) return actionError('already-fortified', 'That tile is already fortified');
    return null;
  },
};

export const fortifyExecutor: ActionExecutor<FortifyPayload> = {
  type: 'fortify',
  execute(state, action) {
    const playerId = action.playerId!;
    const { tileId } = action.payload;
    const inv = state.inventories.get(playerId)!;
    inv.remove('wood', 2);
    inv.remove('stone', 1);

    const forts = ((state.extras['fortifications'] as Record<string, string> | undefined) ?? {});
    forts[tileId] = playerId;
    state.extras['fortifications'] = forts;

    return [{ type: 'fortify', playerId, payload: { tileId, woodSpent: 2, stoneSpent: 1 } }];
  },
};

// ─── post-offer ──────────────────────────────────────────────────────────────
// Post a trade offer that any other player can accept on their turn.
// Resources are reserved immediately (deducted from inventory).

export interface PostOfferPayload {
  readonly giveWood: number;
  readonly giveStone: number;
  readonly wantWood: number;
  readonly wantStone: number;
}

export const postOfferValidator: ActionValidator<PostOfferPayload> = {
  type: 'post-offer',
  validate(state, action) {
    const { playerId } = action;
    if (!playerId) return actionError('no-player', 'No player');
    if (state.rounds.turn().activePlayer !== playerId) return actionError('not-your-turn', 'Not your turn');

    const { giveWood, giveStone, wantWood, wantStone } = action.payload;
    if (giveWood < 0 || giveStone < 0 || wantWood < 0 || wantStone < 0)
      return actionError('invalid', 'Quantities cannot be negative');
    if (giveWood + giveStone === 0) return actionError('invalid', 'Must offer at least one resource');
    if (wantWood + wantStone === 0) return actionError('invalid', 'Must request at least one resource');

    const inv = state.inventories.get(playerId)!;
    if (inv.get('wood') < giveWood) return actionError('insufficient', `Need ${giveWood} wood (have ${inv.get('wood')})`);
    if (inv.get('stone') < giveStone) return actionError('insufficient', `Need ${giveStone} stone (have ${inv.get('stone')})`);

    const myOffers = getOffers(state).filter((o) => o.fromPlayerId === playerId);
    if (myOffers.length >= 3) return actionError('too-many-offers', 'You already have 3 active offers');

    return null;
  },
};

export const postOfferExecutor: ActionExecutor<PostOfferPayload> = {
  type: 'post-offer',
  execute(state, action) {
    const playerId = action.playerId!;
    const { giveWood, giveStone, wantWood, wantStone } = action.payload;
    const inv = state.inventories.get(playerId)!;

    if (giveWood > 0) inv.remove('wood', giveWood);
    if (giveStone > 0) inv.remove('stone', giveStone);

    const nextId = ((state.extras['nextOfferId'] as number | undefined) ?? 0) + 1;
    state.extras['nextOfferId'] = nextId;

    const offer: TradeOffer = { id: String(nextId), fromPlayerId: playerId, giveWood, giveStone, wantWood, wantStone };
    state.extras['tradeOffers'] = [...getOffers(state), offer];

    return [{ type: 'post-offer', playerId, payload: { offer } }];
  },
};

// ─── accept-offer ────────────────────────────────────────────────────────────

export interface AcceptOfferPayload { readonly offerId: string; }

export const acceptOfferValidator: ActionValidator<AcceptOfferPayload> = {
  type: 'accept-offer',
  validate(state, action) {
    const { playerId } = action;
    if (!playerId) return actionError('no-player', 'No player');
    if (state.rounds.turn().activePlayer !== playerId) return actionError('not-your-turn', 'Not your turn');

    const offer = getOffers(state).find((o) => o.id === action.payload.offerId);
    if (!offer) return actionError('no-offer', 'Offer not found');
    if (offer.fromPlayerId === playerId) return actionError('own-offer', 'Cannot accept your own offer');

    const inv = state.inventories.get(playerId)!;
    if (inv.get('wood') < offer.wantWood) return actionError('insufficient', `Need ${offer.wantWood} wood`);
    if (inv.get('stone') < offer.wantStone) return actionError('insufficient', `Need ${offer.wantStone} stone`);

    return null;
  },
};

export const acceptOfferExecutor: ActionExecutor<AcceptOfferPayload> = {
  type: 'accept-offer',
  execute(state, action) {
    const accepterId = action.playerId!;
    const offers = getOffers(state);
    const offer = offers.find((o) => o.id === action.payload.offerId)!;

    const accepterInv = state.inventories.get(accepterId)!;
    const offererInv = state.inventories.get(offer.fromPlayerId)!;

    // Accepter pays what was requested, receives what was reserved
    if (offer.wantWood > 0) accepterInv.remove('wood', offer.wantWood);
    if (offer.wantStone > 0) accepterInv.remove('stone', offer.wantStone);
    if (offer.giveWood > 0) accepterInv.add('wood', offer.giveWood);
    if (offer.giveStone > 0) accepterInv.add('stone', offer.giveStone);

    // Offerer receives what was wanted (reserved give was already deducted when posting)
    if (offer.wantWood > 0) offererInv.add('wood', offer.wantWood);
    if (offer.wantStone > 0) offererInv.add('stone', offer.wantStone);

    state.extras['tradeOffers'] = offers.filter((o) => o.id !== offer.id);

    return [{ type: 'accept-offer', playerId: accepterId, payload: { offerId: offer.id, offer, acceptedBy: accepterId } }];
  },
};

// ─── cancel-offer ────────────────────────────────────────────────────────────
// Any player may cancel their own offer on their turn (refunds reserved resources).

export interface CancelOfferPayload { readonly offerId: string; }

export const cancelOfferValidator: ActionValidator<CancelOfferPayload> = {
  type: 'cancel-offer',
  validate(state, action) {
    const { playerId } = action;
    if (!playerId) return actionError('no-player', 'No player');
    if (state.rounds.turn().activePlayer !== playerId) return actionError('not-your-turn', 'Not your turn');

    const offer = getOffers(state).find((o) => o.id === action.payload.offerId);
    if (!offer) return actionError('no-offer', 'Offer not found');
    if (offer.fromPlayerId !== playerId) return actionError('not-yours', "Cannot cancel someone else's offer");

    return null;
  },
};

export const cancelOfferExecutor: ActionExecutor<CancelOfferPayload> = {
  type: 'cancel-offer',
  execute(state, action) {
    const playerId = action.playerId!;
    const offers = getOffers(state);
    const offer = offers.find((o) => o.id === action.payload.offerId)!;

    const inv = state.inventories.get(playerId)!;
    if (offer.giveWood > 0) inv.add('wood', offer.giveWood);
    if (offer.giveStone > 0) inv.add('stone', offer.giveStone);

    state.extras['tradeOffers'] = offers.filter((o) => o.id !== offer.id);

    return [{ type: 'cancel-offer', playerId, payload: { offerId: offer.id, offer } }];
  },
};
