/**
 * Public API for all Kingdoms of Dominion player actions.
 *
 * scenario.ts imports from here. Each action lives in its own file so that:
 *   - Adding a new action = create one file, add two lines here
 *   - Changing build logic doesn't risk breaking move/attack logic
 *   - Future per-action README files are easy to co-locate
 *
 * Action files: recruit | move | attack | build | develop | end-turn
 */

export { recruitUnitValidator,      recruitUnitExecutor      } from './recruit.js';
export { moveUnitValidator,         moveUnitExecutor         } from './move.js';
export { attackTileValidator,       attackTileExecutor       } from './attack.js';
export { buildStructureValidator,   buildStructureExecutor   } from './build.js';
export { demolishStructureValidator, demolishStructureExecutor } from './build.js';
export { developTileValidator,      developTileExecutor      } from './develop.js';
export { endTurnValidator,          endTurnExecutor          } from './end-turn.js';
