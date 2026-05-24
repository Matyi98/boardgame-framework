import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { GameBusEvent } from '@bgf/shared-types';
import { getSocket } from '../lib/socket.js';
import { useAuth } from './auth.js';

interface GameState {
  gameId: string | null;
  events: ReadonlyArray<GameBusEvent>;
  /** Scenario-specific reduced state — render however the scenario likes. */
  view: unknown;
  socket: Socket | null;
  connect: (gameId: string) => void;
  disconnect: () => void;
  send: (type: string, payload: unknown) => void;
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
      set((s) => ({ events: [...s.events, event] }));
      // TODO: scenario-specific reducer maintains `view` from events.
    });
    set({ gameId, socket });
  },

  disconnect() {
    const { socket, gameId } = get();
    if (socket && gameId) socket.emit('unsubscribe-game', { gameId });
    socket?.off('game-event');
    set({ gameId: null, events: [], view: null, socket: null });
  },

  send(type, payload) {
    const { socket, gameId } = get();
    if (!socket || !gameId) throw new Error('Not connected to a game');
    socket.emit('game-command', { gameId, type, payload });
  },
}));
