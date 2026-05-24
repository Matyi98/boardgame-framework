import { create } from 'zustand';
import type { CreateRoomRequest, RoomDetail, RoomSummary } from '@bgf/shared-types';
import { api } from '../lib/api.js';
import { useAuth } from './auth.js';

interface LobbyState {
  rooms: ReadonlyArray<RoomSummary>;
  current: RoomDetail | null;
  refresh: () => Promise<void>;
  create: (req: CreateRoomRequest) => Promise<RoomDetail>;
  join: (roomId: string) => Promise<RoomDetail>;
  setReady: (roomId: string, ready: boolean) => Promise<RoomDetail>;
  start: (roomId: string) => Promise<RoomDetail>;
}

function token(): string {
  const t = useAuth.getState().token;
  if (!t) throw new Error('Not authenticated');
  return t;
}

export const useLobby = create<LobbyState>((set) => ({
  rooms: [],
  current: null,
  async refresh() {
    const rooms = await api<ReadonlyArray<RoomSummary>>('GET', '/api/lobby/rooms', { token: token() });
    set({ rooms });
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
}));
