/**
 * Single source of truth for exchange names and routing-key shapes. Mirrors
 * `infra/rabbitmq/definitions.json`.
 */
export const Exchange = {
  GameCommands: 'game.commands',
  GameEvents: 'game.events',
  LobbyEvents: 'lobby.events',
} as const;

export const RoutingKey = {
  gameCommand: (gameId: string): string => `game.${gameId}.command`,
  gameEvent: (gameId: string, eventType: string): string => `game.${gameId}.${eventType}`,
  lobbyEvent: (roomId: string, eventType: string): string => `lobby.${roomId}.${eventType}`,
};
