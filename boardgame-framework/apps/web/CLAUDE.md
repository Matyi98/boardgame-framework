# CLAUDE.md — apps/web

## What this is
React + Vite SPA. Served by nginx in production (Docker).  
All API calls go through the Traefik reverse proxy at `http://localhost` (same origin, no CORS).

## Tech stack
- **React 18** + **TypeScript**
- **Zustand** for state management (with `zustand/middleware/persist` for auth)
- **socket.io-client** for realtime events
- **React Router v6** for routing
- **Vite** for bundling

## Key files
| File | Role |
|------|------|
| `src/store/auth.ts` | Auth state: `userId`, `username`, `token`. Persisted to localStorage |
| `src/store/game.ts` | Game state: `view: DemoView`, `events[]`. Connects WS, applies events |
| `src/store/lobby.ts` | Lobby state: room list + current room |
| `src/lib/api.ts` | Typed fetch wrapper — adds Bearer token, handles JSON errors |
| `src/lib/socket.ts` | Singleton socket.io-client — reused across connects |
| `src/pages/LobbyPage.tsx` | Room list, create/join/ready/start |
| `src/pages/GamePage.tsx` | Active game: board + player list + event log + pass button + rules modal |
| `src/components/Board.tsx` | SVG hex board — tile rendering, claim interaction, dice indicator |
| `src/components/PlayerList.tsx` | VP scoreboard with progress bars |

## Game state flow
```
socket 'game-event'
  → useGame applyEvent(view, event) → new view
      game-started  : view = event.payload (full snapshot)
      tile-claimed  : update tile.claimedBy + player VP
      turn-ended    : update currentActivePlayer + isActive flags
      game-ended    : set status='ended', winner
  → React re-renders Board, PlayerList, GamePage
```

## DemoView type (apps/web/src/store/game.ts)
```ts
interface DemoView {
  status: 'playing' | 'ended';
  tiles: TileView[];           // TileView = { id, q, r, terrain, claimedBy? }
  players: PlayerView[];       // PlayerView = { id, displayName, color, seat, vp, isActive }
  currentActivePlayer: string;
  winner: string | null;
  winReason?: string;
  homeTiles: Record<string, string>;  // playerId → tileId
  round: number;
}
```
**If you add a field in engine's `buildView()`**, add it here too and handle it in `applyEvent()`.

## Board.tsx — hex geometry
- Pointy-top axial hexes: `hexCenter(q,r)` → `[x, y]` SVG coords
- `HEX_SIZE = 50` circumradius
- ViewBox: `"-280 -250 560 510"` — adjust if map grows
- Claimable tiles computed client-side from `coordMap` + `HEX_DIRS` adjacency
- Dice indicator rendered as SVG rect + pip circles on last-claimed tile

## Sending a command
```ts
useGame.getState().send('claim-tile', { tileId });
// → socket.emit('game-command', { gameId, type: 'claim-tile', payload: { tileId } })
```

## Environment / build
```
VITE_API_BASE=/    (relative, proxied by nginx)
```
nginx config in `apps/web/nginx.conf` — all `/api/*` and `/ws` requests are proxied to Traefik.

## Common edits
| Task | File |
|------|------|
| Change board size | `Board.tsx` HEX_SIZE + viewBox |
| Add a new event type to the log | `GamePage.tsx` describeEvent() |
| Add a new field to DemoView | `store/game.ts` DemoView interface + applyEvent() |
| Add a new page | `src/pages/` + wire in `src/App.tsx` router |
| Change win VP display | `PlayerList.tsx` WIN_VP constant |
