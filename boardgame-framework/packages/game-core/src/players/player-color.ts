/** Standard player colors. Games may add or replace these. */
export const PlayerColors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'white', 'black'] as const;
export type PlayerColor = typeof PlayerColors[number];
