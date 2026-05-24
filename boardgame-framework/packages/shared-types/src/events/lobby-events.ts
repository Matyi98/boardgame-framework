/**
 * Messages published on the `lobby.events` topic exchange.
 * Routing key pattern: `lobby.<roomId>.<eventName>`
 */
export type LobbyEvent =
  | RoomCreatedEvent
  | RoomUpdatedEvent
  | RoomClosedEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | PlayerReadyEvent
  | GameStartingEvent;

export interface RoomCreatedEvent {
  type: 'room-created';
  roomId: string;
  hostId: string;
  at: number;
}
export interface RoomUpdatedEvent {
  type: 'room-updated';
  roomId: string;
  at: number;
}
export interface RoomClosedEvent {
  type: 'room-closed';
  roomId: string;
  reason: string;
  at: number;
}
export interface PlayerJoinedEvent {
  type: 'player-joined';
  roomId: string;
  userId: string;
  at: number;
}
export interface PlayerLeftEvent {
  type: 'player-left';
  roomId: string;
  userId: string;
  at: number;
}
export interface PlayerReadyEvent {
  type: 'player-ready';
  roomId: string;
  userId: string;
  ready: boolean;
  at: number;
}
export interface GameStartingEvent {
  type: 'game-starting';
  roomId: string;
  gameId: string;
  at: number;
}
