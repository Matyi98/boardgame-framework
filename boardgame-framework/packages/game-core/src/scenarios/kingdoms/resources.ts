import { ResourceRegistry } from '../../resources/resource-type.js';

/**
 * Four-resource economy. Wood and Iron are scarce by design — players start
 * with some and must manage carefully. Food sustains armies. Gold is flexible.
 */
export const kingdomsResources = new ResourceRegistry()
  .register({ id: 'wood',  name: 'Wood',  symbol: '🪵' })
  .register({ id: 'food',  name: 'Food',  symbol: '🍞' })
  .register({ id: 'iron',  name: 'Iron',  symbol: '⚙️' })
  .register({ id: 'gold',  name: 'Gold',  symbol: '💰' });
