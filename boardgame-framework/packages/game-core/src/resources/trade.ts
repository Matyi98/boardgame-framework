import { PlayerId } from '../players/player.js';
import { ResourceType } from './resource-type.js';

export interface ResourceBundle {
  readonly [resourceType: string]: number;
}

export interface TradeOffer {
  readonly id: string;
  readonly from: PlayerId;
  readonly to: PlayerId | 'any'; // 'any' = bank / open market
  readonly give: ResourceBundle;
  readonly want: ResourceBundle;
  readonly expiresAt?: number; // epoch ms
}

export interface TradeResult {
  readonly offerId: string;
  readonly accepted: boolean;
  readonly counterparty: PlayerId;
}

/** Adjust the framework's exchange rules here (bank ratios, port discounts, ...). */
export interface TradeRules {
  bankRate(give: ResourceType, want: ResourceType): number;
}
