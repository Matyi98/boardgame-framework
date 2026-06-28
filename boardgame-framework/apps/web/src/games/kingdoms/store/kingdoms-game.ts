/**
 * Zustand store for Kingdoms of Dominion game state.
 *
 * Step 10 enhancements over Step 9:
 * - tileEffects: per-tile visual effect tracking (combat flash, capture sweep, noble ring)
 * - lastCombat: last battle-resolved event for the combat overlay
 * - Event handler logic sets these fields when specific events arrive
 * - Re-fetch strategy retained (fetch after every non-game-started event)
 */

import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { GameBusEvent } from '@bgf/shared-types';
import type { KingdomsView } from '@bgf/game-core';
import { api } from '../../../lib/api.js';
import { disconnectSocket, getSocket } from '../../../lib/socket.js';
import { useAuth } from '../../../store/auth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TileEffect {
  kind: 'combat' | 'capture' | 'loyalty' | 'built';
  startsAt: number;
}

export interface LastCombat {
  fromTileId: string;
  toTileId: string;
  attackerId: string;
  defenderId: string | null;
  attackerWins: boolean;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerStrength: number;
  defenderStrength: number;
}

// Ticket #47: there was no disconnect/reconnect feedback at all — a dropped
// WebSocket mid-game looked identical to a frozen, working one.
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface KingdomsGameStore {
  gameId: string | null;
  events: ReadonlyArray<GameBusEvent>;
  view: KingdomsView | null;
  socket: Socket | null;
  tileEffects: Record<string, TileEffect>;
  lastCombat: LastCombat | null;
  connectionStatus: ConnectionStatus;
  connect: (gameId: string) => void;
  disconnect: () => void;
  send: (type: string, payload: unknown) => void;
  fetchInit: (gameId: string) => Promise<void>;
  addTileEffect: (tileId: string, kind: TileEffect['kind']) => void;
  clearTileEffect: (tileId: string) => void;
  clearLastCombat: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useKingdomsGame = create<KingdomsGameStore>((set, get) => ({
  gameId: null,
  events: [],
  view: null,
  socket: null,
  tileEffects: {},
  lastCombat: null,
  connectionStatus: 'connected',

  addTileEffect(tileId, kind) {
    set((s) => ({
      tileEffects: {
        ...s.tileEffects,
        [tileId]: { kind, startsAt: Date.now() },
      },
    }));
  },

  clearTileEffect(tileId) {
    set((s) => {
      const next = { ...s.tileEffects };
      delete next[tileId];
      return { tileEffects: next };
    });
  },

  clearLastCombat() {
    set({ lastCombat: null });
  },

  connect(gameId) {
    const token = useAuth.getState().token;
    if (!token) throw new Error('Not authenticated');
    const socket = getSocket(token);
    socket.emit('subscribe-game', { gameId });

    // Ticket #47: surface disconnects instead of leaving a frozen board with
    // no explanation. Re-subscribe and re-sync the authoritative snapshot on
    // reconnect in case anything was missed while offline.
    socket.on('disconnect', () => set({ connectionStatus: 'disconnected' }));
    socket.io.on('reconnect_attempt', () => set({ connectionStatus: 'reconnecting' }));
    socket.on('connect', () => {
      if (get().connectionStatus !== 'connected') {
        socket.emit('subscribe-game', { gameId });
        void get().fetchInit(gameId);
      }
      set({ connectionStatus: 'connected' });
    });

    socket.on('game-event', (event: GameBusEvent) => {
      set((s) => ({ events: [...s.events, event] }));

      if (event.type === 'game-started') {
        // Full snapshot is in the payload — use it directly; reset effects
        set({ view: event.payload as KingdomsView, tileEffects: {}, lastCombat: null });
      } else {
        // Handle specific events for visual effects
        const store = get();

        if (event.type === 'battle-resolved') {
          const p = event.payload as {
            fromTileId: string;
            toTileId: string;
            defenderOwner: string | null;
            attackerWins: boolean;
            attackerCasualties: number;
            defenderCasualties: number;
            attackerStrength: number;
            defenderStrength: number;
          };
          set({
            lastCombat: {
              fromTileId: p.fromTileId,
              toTileId: p.toTileId,
              attackerId: event.playerId ?? '',
              defenderId: p.defenderOwner,
              attackerWins: p.attackerWins,
              attackerCasualties: p.attackerCasualties,
              defenderCasualties: p.defenderCasualties,
              attackerStrength: p.attackerStrength,
              defenderStrength: p.defenderStrength,
            },
          });
          store.addTileEffect(p.fromTileId, 'combat');
          store.addTileEffect(p.toTileId, 'combat');
        }

        if (event.type === 'tile-captured') {
          const p = event.payload as { tileId: string };
          store.addTileEffect(p.tileId, 'capture');
        }

        if (event.type === 'tile-loyalty-reduced') {
          const p = event.payload as { tileId: string };
          store.addTileEffect(p.tileId, 'loyalty');
        }

        // Ticket #35: every successful recruit/build/develop gets a visible
        // result on the board, not just a silently-updated piece list.
        if (event.type === 'unit-recruited' || event.type === 'structure-built' || event.type === 'tile-developed') {
          const p = event.payload as { tileId: string };
          store.addTileEffect(p.tileId, 'built');
        }

        // Re-fetch the authoritative Redis snapshot after any mutation
        void get().fetchInit(gameId);
      }
    });
    set({ gameId, socket });
  },

  disconnect() {
    const { socket, gameId } = get();
    if (socket && gameId) socket.emit('unsubscribe-game', { gameId });
    socket?.off('game-event');
    socket?.off('connect');
    socket?.off('disconnect');
    socket?.io.off('reconnect_attempt');
    disconnectSocket();
    set({ gameId: null, events: [], view: null, socket: null, tileEffects: {}, lastCombat: null, connectionStatus: 'connected' });
  },

  send(type, payload) {
    const { socket, gameId } = get();
    if (!socket || !gameId) throw new Error('Not connected to a game');
    socket.emit('game-command', { gameId, type, payload });
  },

  async fetchInit(gameId) {
    const token = useAuth.getState().token;
    try {
      const snapshot = await api<KingdomsView>('GET', `/api/games/${gameId}/init`, { token });
      set({ view: snapshot });
    } catch {
      // Engine not ready yet — the game-started WS event will arrive and set the view
    }
  },
}));
