export interface SubmitActionRequest {
  gameId: string;
  type: string;
  payload: unknown;
  clientSeq?: number;
}

export interface SubmitActionResponse {
  ok: boolean;
  error?: { code: string; message: string };
  /** Echoed monotonic event seq the engine assigned. */
  lastEventSeq?: number;
}

export interface GameSnapshot {
  gameId: string;
  scenarioId: string;
  status: 'lobby' | 'setup' | 'playing' | 'ended';
  lastEventSeq: number;
  /** Opaque, scenario-specific JSON. Clients render it per-scenario. */
  state: unknown;
}
