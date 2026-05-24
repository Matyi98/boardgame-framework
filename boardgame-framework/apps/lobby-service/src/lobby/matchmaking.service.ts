import { Injectable } from '@nestjs/common';

/**
 * Stub for future quick-match / skill-based pairing. The lobby controller
 * exposes hand-rolled rooms today; this service will own auto-pairing.
 *
 * TODO: implement a queue keyed by `scenarioId` + player count, with a simple
 * MMR bucket. Persist queue state in Redis so multiple lobby-service replicas
 * can share it.
 */
@Injectable()
export class MatchmakingService {
  enqueue(_userId: string, _scenarioId: string): Promise<{ ticketId: string }> {
    throw new Error('Not implemented');
  }

  cancel(_ticketId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}
