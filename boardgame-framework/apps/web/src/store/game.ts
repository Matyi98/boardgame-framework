import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { GameBusEvent } from '@bgf/shared-types';
import { api } from '../lib/api.js';
import { disconnectSocket, getSocket } from '../lib/socket.js';
import { useAuth } from './auth.js';

// ── View types ───────────────────────────────────────────────────────────────

export interface TileView {
  id: string;
  q: number;
  r: number;
  terrain: string;
  claimedBy?: string;
}

export interface PlayerView {
  id: string;
  displayName: string;
  color: string;
  seat: number;
  vp: number;
  wood: number;
  stone: number;
  isActive: boolean;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  giveWood: number;
  giveStone: number;
  wantWood: number;
  wantStone: number;
}

export interface DemoView {
  status: 'playing' | 'ended';
  tiles: TileView[];
  players: PlayerView[];
  currentActivePlayer: string;
  winner: string | null;
  winReason?: string;
  homeTiles: Record<string, string>;
  fortifications: Record<string, string>;
  tradeOffers: TradeOffer[];
  round: number;
}

// ── Event payload shapes ──────────────────────────────────────────────────────

interface TileClaimedPayload {
  tileId: string;
  terrain: string;
  vp: number;
  claimedBy: string;
  diceRoll?: number;
  die1?: number;
  die2?: number;
  bonusVp?: number;
  resource?: string | null;
}

interface TurnEndedPayload { newActivePlayer: string; }
interface GameEndedPayload { winner: string | null; reason: string; conditionId: string; }

// ── Event reducer ────────────────────────────────────────────────────────────

function applyEvent(view: DemoView | null, event: GameBusEvent): DemoView | null {
  if (event.type === 'game-started') {
    const snap = event.payload as DemoView;
    return { ...snap, tradeOffers: snap.tradeOffers ?? [], fortifications: snap.fortifications ?? {} };
  }

  if (!view) return null;

  if (event.type === 'tile-claimed') {
    const p = event.payload as TileClaimedPayload;
    return {
      ...view,
      tiles: view.tiles.map((t) => t.id === p.tileId ? { ...t, claimedBy: p.claimedBy } : t),
      players: view.players.map((pl) => {
        if (pl.id !== p.claimedBy) return pl;
        return {
          ...pl,
          vp: pl.vp + p.vp,
          wood:  pl.wood  + (p.resource === 'wood'  ? 1 : 0),
          stone: pl.stone + (p.resource === 'stone' ? 1 : 0),
        };
      }),
    };
  }

  if (event.type === 'tile-income') {
    const p = event.payload as { wood: number; stone: number };
    return {
      ...view,
      players: view.players.map((pl) =>
        pl.id !== event.playerId ? pl : { ...pl, wood: pl.wood + p.wood, stone: pl.stone + p.stone }
      ),
    };
  }

  if (event.type === 'trade') {
    const p = event.payload as { resource: string; effect: string; amount?: number };
    return {
      ...view,
      players: view.players.map((pl) => {
        if (pl.id !== event.playerId) return pl;
        if (p.effect === 'vp') {
          return { ...pl, vp: pl.vp + (p.amount ?? 1), [p.resource]: Math.max(0, (pl[p.resource as keyof PlayerView] as number) - 2) };
        }
        if (p.effect === 'stone-leap') return { ...pl, stone: Math.max(0, pl.stone - 2) };
        return pl;
      }),
    };
  }

  if (event.type === 'fortify') {
    const p = event.payload as { tileId: string; woodSpent: number; stoneSpent: number };
    return {
      ...view,
      fortifications: { ...view.fortifications, [p.tileId]: event.playerId! },
      players: view.players.map((pl) =>
        pl.id !== event.playerId ? pl : {
          ...pl,
          wood:  Math.max(0, pl.wood  - p.woodSpent),
          stone: Math.max(0, pl.stone - p.stoneSpent),
        }
      ),
    };
  }

  if (event.type === 'fort-income') {
    const p = event.payload as { tileId: string; vp: number };
    return {
      ...view,
      players: view.players.map((pl) =>
        pl.id === event.playerId ? { ...pl, vp: pl.vp + p.vp } : pl
      ),
    };
  }

  if (event.type === 'post-offer') {
    const p = event.payload as { offer: TradeOffer };
    return {
      ...view,
      tradeOffers: [...view.tradeOffers, p.offer],
      players: view.players.map((pl) =>
        pl.id !== event.playerId ? pl : {
          ...pl,
          wood:  Math.max(0, pl.wood  - p.offer.giveWood),
          stone: Math.max(0, pl.stone - p.offer.giveStone),
        }
      ),
    };
  }

  if (event.type === 'accept-offer') {
    const p = event.payload as { offerId: string; offer: TradeOffer; acceptedBy: string };
    return {
      ...view,
      tradeOffers: view.tradeOffers.filter((o) => o.id !== p.offerId),
      players: view.players.map((pl) => {
        if (pl.id === p.acceptedBy) {
          return {
            ...pl,
            wood:  pl.wood  - p.offer.wantWood  + p.offer.giveWood,
            stone: pl.stone - p.offer.wantStone + p.offer.giveStone,
          };
        }
        if (pl.id === p.offer.fromPlayerId) {
          return { ...pl, wood: pl.wood + p.offer.wantWood, stone: pl.stone + p.offer.wantStone };
        }
        return pl;
      }),
    };
  }

  if (event.type === 'cancel-offer') {
    const p = event.payload as { offerId: string; offer: TradeOffer };
    return {
      ...view,
      tradeOffers: view.tradeOffers.filter((o) => o.id !== p.offerId),
      players: view.players.map((pl) =>
        pl.id !== event.playerId ? pl : {
          ...pl,
          wood:  pl.wood  + p.offer.giveWood,
          stone: pl.stone + p.offer.giveStone,
        }
      ),
    };
  }

  if (event.type === 'turn-ended') {
    const p = event.payload as TurnEndedPayload;
    return {
      ...view,
      currentActivePlayer: p.newActivePlayer,
      players: view.players.map((pl) => ({ ...pl, isActive: pl.id === p.newActivePlayer })),
    };
  }

  if (event.type === 'game-ended') {
    const p = event.payload as GameEndedPayload;
    return { ...view, status: 'ended', winner: p.winner, winReason: p.reason };
  }

  return view;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface GameState {
  gameId: string | null;
  events: ReadonlyArray<GameBusEvent>;
  view: DemoView | null;
  socket: Socket | null;
  connect: (gameId: string) => void;
  disconnect: () => void;
  send: (type: string, payload: unknown) => void;
  fetchInit: (gameId: string) => Promise<void>;
}

export const useGame = create<GameState>((set, get) => ({
  gameId: null,
  events: [],
  view: null,
  socket: null,

  connect(gameId) {
    const token = useAuth.getState().token;
    if (!token) throw new Error('Not authenticated');
    const socket = getSocket(token);
    socket.emit('subscribe-game', { gameId });
    socket.on('game-event', (event: GameBusEvent) => {
      set((s) => ({
        events: [...s.events, event],
        view: applyEvent(s.view, event),
      }));
    });
    set({ gameId, socket });
  },

  disconnect() {
    const { socket, gameId } = get();
    if (socket && gameId) socket.emit('unsubscribe-game', { gameId });
    socket?.off('game-event');
    disconnectSocket();
    set({ gameId: null, events: [], view: null, socket: null });
  },

  send(type, payload) {
    const { socket, gameId } = get();
    if (!socket || !gameId) throw new Error('Not connected to a game');
    socket.emit('game-command', { gameId, type, payload });
  },

  async fetchInit(gameId) {
    const token = useAuth.getState().token;
    try {
      const snapshot = await api<DemoView>('GET', `/api/games/${gameId}/init`, { token });
      set((s) => ({ view: s.view ?? snapshot }));
    } catch {
      // Game not initialised yet — let the WS game-started event handle it
    }
  },
}));
