export type RoomStatus = 'open' | 'starting' | 'in-game' | 'closed';

export interface RoomSummary {
  roomId: string;
  name: string;
  scenarioId: string;
  hostId: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  createdAt: string;
}

export interface RoomDetail extends RoomSummary {
  players: ReadonlyArray<{ userId: string; username: string; ready: boolean }>;
  gameId?: string;
}

export interface CreateRoomRequest {
  name: string;
  scenarioId: string;
  maxPlayers: number;
  isPrivate?: boolean;
}

export interface JoinRoomRequest {
  roomId: string;
}

export interface SetReadyRequest {
  ready: boolean;
}
