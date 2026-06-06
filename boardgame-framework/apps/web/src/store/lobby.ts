import { create } from 'zustand';
import type { CreateRoomRequest, RoomDetail, RoomSummary } from '@bgf/shared-types';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from './auth.js';

interface LobbyState {
  rooms: ReadonlyArray<RoomSummary>;
  current: RoomDetail | null;
  refresh: () => Promise<void>;
  refreshCurrent: () => Promise<void>;
  create: (req: CreateRoomRequest) => Promise<RoomDetail>;
  join: (roomId: string) => Promise<RoomDetail>;
  setReady: (roomId: string, ready: boolean) => Promise<RoomDetail>;
  start: (roomId: string) => Promise<RoomDetail>;
  leaveRoom: (roomId: string) => Promise<void>;
  closeRoom: (roomId: string) => Promise<void>;
  clearCurrent: () => void;
}

function token(): string {
  const t = useAuth.getState().token;
  if (!t) throw new Error('Not authenticated');
  return t;
}

export const useLobby = create<LobbyState>((set, get) => ({
  rooms: [],
  current: null,

  async refresh() {
    const rooms = await api<ReadonlyArray<RoomSummary>>('GET', '/api/lobby/rooms', { token: token() });
    set({ rooms });
  },

  async refreshCurrent() {
    const { current } = get();
    if (!current) return;
    try {
      const room = await api<RoomDetail>('GET', `/api/lobby/rooms/${current.roomId}`, { token: token() });
      set({ current: room });
    } catch (err) {
      // Room no longer exists on the server — clear stale local state
      if (err instanceof ApiError && err.status === 404) {
        set({ current: null });
      } else {
        throw err;
      }
    }
  },

  async create(req) {
    const room = await api<RoomDetail>('POST', '/api/lobby/rooms', { token: token(), body: req });
    set({ current: room });
    return room;
  },

  async join(roomId) {
    const room = await api<RoomDetail>('POST', '/api/lobby/rooms/join', { token: token(), body: { roomId } });
    set({ current: room });
    return room;
  },

  async setReady(roomId, ready) {
    const room = await api<RoomDetail>('POST', `/api/lobby/rooms/${roomId}/ready`, { token: token(), body: { ready } });
    set({ current: room });
    return room;
  },

  async start(roomId) {
    const room = await api<RoomDetail>('POST', `/api/lobby/rooms/${roomId}/start`, { token: token() });
    set({ current: room });
    return room;
  },

  async leaveRoom(roomId) {
    await api<void>('POST', `/api/lobby/rooms/${roomId}/leave`, { token: token() });
    set((s) => ({
      current: s.current?.roomId === roomId ? null : s.current,
    }));
  },

  async closeRoom(roomId) {
    await api<void>('DELETE', `/api/lobby/rooms/${roomId}`, { token: token() });
    set((s) => ({
      current: s.current?.roomId === roomId ? null : s.current,
      rooms: s.rooms.filter((r) => r.roomId !== roomId),
    }));
  },

  clearCurrent() {
    set({ current: null });
  },
}));
