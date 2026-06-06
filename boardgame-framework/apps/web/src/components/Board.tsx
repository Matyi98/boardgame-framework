import { useState } from 'react';
import { useGame, type PlayerView } from '../store/game.js';
import { useAuth } from '../store/auth.js';
import { hexCenter, hexCorners, HEX_DIRS, HEX_SIZE, BOARD_VIEWBOX } from './board/hex-geometry.js';
import { DicePanel } from './board/DicePanel.js';

// ── Terrain definitions ───────────────────────────────────────────────────────

const TERRAIN_FILL: Record<string, string> = {
  grass:    'url(#grad-grass)',
  forest:   'url(#grad-forest)',
  mountain: 'url(#grad-mountain)',
};

const TERRAIN_FILL_FALLBACK: Record<string, string> = {
  grass:    '#4d8c55',
  forest:   '#1d5c28',
  mountain: '#7a6347',
};

const TERRAIN_VP: Record<string, number> = {
  grass: 1, forest: 2, mountain: 3,
};

const TERRAIN_LABEL: Record<string, string> = {
  grass: 'Plains', forest: 'Forest', mountain: 'Mountain',
};

// ── Player colours ────────────────────────────────────────────────────────────

const PLAYER_COLOR_CSS: Record<string, string> = {
  red:    '#e74c3c',
  blue:   '#3498db',
  green:  '#2ecc71',
  yellow: '#f1c40f',
  orange: '#e67e22',
  purple: '#9b59b6',
};

// ── SVG gradient defs ─────────────────────────────────────────────────────────

function TerrainDefs(): JSX.Element {
  return (
    <defs>
      <radialGradient id="grad-grass" cx="50%" cy="40%" r="65%">
        <stop offset="0%" stopColor="#6aaf6e" />
        <stop offset="100%" stopColor="#2e6b36" />
      </radialGradient>
      <radialGradient id="grad-forest" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#2d8040" />
        <stop offset="100%" stopColor="#0e3a1a" />
      </radialGradient>
      <radialGradient id="grad-mountain" cx="50%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#a08870" />
        <stop offset="100%" stopColor="#4a3520" />
      </radialGradient>
      <radialGradient id="grad-claimed" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
      </radialGradient>
      <filter id="glow-orange" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

// ── Terrain icon illustrations (SVG paths relative to tile center) ────────────

function TerrainIcon({ terrain, cx, cy }: { terrain: string; cx: number; cy: number }): JSX.Element | null {
  const s = HEX_SIZE * 0.38;

  if (terrain === 'forest') {
    return (
      <g transform={`translate(${cx},${cy - s * 0.1})`} style={{ pointerEvents: 'none' }} opacity={0.75}>
        <polygon points={`${-s * 0.52},${s * 0.48} ${-s * 0.15},${-s * 0.52} ${s * 0.22},${s * 0.48}`} fill="#5aaa60" />
        <polygon points={`${-s * 0.38},${s * 0.18} ${-s * 0.1},${-s * 0.72} ${s * 0.18},${s * 0.18}`} fill="#4a9a50" />
        <rect x={`${-s * 0.1}`} y={`${s * 0.48}`} width={`${s * 0.2}`} height={`${s * 0.3}`} fill="#7a5530" />
        <polygon points={`${s * 0.08},${s * 0.48} ${s * 0.42},${-s * 0.38} ${s * 0.72},${s * 0.48}`} fill="#3e8a44" />
        <polygon points={`${s * 0.18},${s * 0.2} ${s * 0.42},${-s * 0.6} ${s * 0.65},${s * 0.2}`} fill="#2e7a34" />
        <rect x={`${s * 0.36}`} y={`${s * 0.48}`} width={`${s * 0.18}`} height={`${s * 0.25}`} fill="#6a4520" />
      </g>
    );
  }

  if (terrain === 'mountain') {
    return (
      <g transform={`translate(${cx},${cy + s * 0.05})`} style={{ pointerEvents: 'none' }} opacity={0.7}>
        <polygon points={`${-s * 0.7},${s * 0.55} ${-s * 0.05},${-s * 0.65} ${s * 0.6},${s * 0.55}`} fill="#907862" />
        <polygon points={`${-s * 0.22},${-s * 0.42} ${-s * 0.05},${-s * 0.65} ${s * 0.12},${-s * 0.42}`} fill="#ddd5c5" />
        <polygon points={`${-s * 0.35},${s * 0.55} ${s * 0.12},${-s * 0.25} ${s * 0.68},${s * 0.55}`} fill="#6a5038" />
        <polygon points={`${s * 0.08},${-s * 0.1} ${s * 0.12},${-s * 0.25} ${s * 0.28},${-s * 0.1}`} fill="#c8bfb0" />
      </g>
    );
  }

  if (terrain === 'grass') {
    return (
      <g transform={`translate(${cx},${cy + s * 0.15})`} style={{ pointerEvents: 'none' }} opacity={0.65}>
        <path d={`M${-s * 0.35},${s * 0.3} C${-s * 0.38},${s * 0.05} ${-s * 0.42},${-s * 0.2} ${-s * 0.28},${-s * 0.45} C${-s * 0.18},${-s * 0.6} ${-s * 0.12},${-s * 0.6} ${-s * 0.15},${-s * 0.45} C${-s * 0.1},${-s * 0.2} ${-s * 0.18},${s * 0.05} ${-s * 0.15},${s * 0.3}`}
          stroke="#82c882" strokeWidth={s * 0.08} fill="none" strokeLinecap="round" />
        <path d={`M${-s * 0.02},${s * 0.3} C${-s * 0.04},${s * 0.02} ${-s * 0.06},${-s * 0.28} ${s * 0.06},${-s * 0.55} C${s * 0.14},${-s * 0.72} ${s * 0.2},${-s * 0.72} ${s * 0.18},${-s * 0.55} C${s * 0.14},${-s * 0.3} ${s * 0.04},${s * 0.02} ${s * 0.06},${s * 0.3}`}
          stroke="#78be78" strokeWidth={s * 0.1} fill="none" strokeLinecap="round" />
        <path d={`M${s * 0.3},${s * 0.3} C${s * 0.28},${s * 0.08} ${s * 0.25},${-s * 0.15} ${s * 0.38},${-s * 0.38} C${s * 0.46},${-s * 0.52} ${s * 0.52},${-s * 0.5} ${s * 0.5},${-s * 0.38} C${s * 0.46},${-s * 0.15} ${s * 0.38},${s * 0.08} ${s * 0.38},${s * 0.3}`}
          stroke="#82c882" strokeWidth={s * 0.08} fill="none" strokeLinecap="round" />
      </g>
    );
  }

  return null;
}

// ── Fort marker ───────────────────────────────────────────────────────────────

function FortMarker({ cx, cy, color }: { cx: number; cy: number; color: string }): JSX.Element {
  const s = HEX_SIZE * 0.22;
  const tx = cx - s * 1.9;
  const ty = cy - s * 1.9;
  return (
    <g transform={`translate(${tx},${ty})`} style={{ pointerEvents: 'none' }}>
      {/* Tower body */}
      <rect x={-s * 0.9} y={-s * 0.5} width={s * 1.8} height={s * 1.4} rx={s * 0.15}
        fill={color} fillOpacity={0.9} stroke="#0f1115" strokeWidth={1} />
      {/* Battlements (3 merlons) */}
      {[-0.55, -0.1, 0.35].map((bx, i) => (
        <rect key={i} x={bx * s} y={-s * 0.85} width={s * 0.35} height={s * 0.42}
          fill={color} fillOpacity={0.9} stroke="#0f1115" strokeWidth={0.8} />
      ))}
      {/* Gate */}
      <path d={`M${-s * 0.22},${s * 0.9} L${-s * 0.22},${s * 0.18} A${s * 0.22},${s * 0.22} 0 0 1 ${s * 0.22},${s * 0.18} L${s * 0.22},${s * 0.9}`}
        fill="#0f1115" fillOpacity={0.7} />
    </g>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BoardProps {
  onClaimTile?: (tileId: string) => void;
  onFortifyTile?: (tileId: string) => void;
  isMyTurn?: boolean;
  fortifyMode?: boolean;
}

export function Board({ onClaimTile, onFortifyTile, isMyTurn, fortifyMode = false }: BoardProps): JSX.Element {
  const view = useGame((s) => s.view);
  const events = useGame((s) => s.events);
  const { userId } = useAuth();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const lastClaim = [...events].reverse().find((e) => e.type === 'tile-claimed')?.payload as
    | { tileId: string; diceRoll?: number; die1?: number; die2?: number; bonusVp?: number; claimedBy?: string; terrain?: string; vp?: number; resource?: string | null }
    | undefined;

  if (!view) {
    return (
      <div className="panel" style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }}>
        <svg viewBox="-50 -50 100 100" style={{ width: '60%', maxWidth: 240, opacity: 0.35 }} xmlns="http://www.w3.org/2000/svg">
          <polygon points="0,-40 34.6,-20 34.6,20 0,40 -34.6,20 -34.6,-20"
            fill="none" stroke="var(--accent)" strokeWidth="0.6" />
          <text x="0" y="5" textAnchor="middle" fontSize="5.5" fill="var(--fg-dim)" fontFamily="var(--font-mono)">
            waiting for game…
          </text>
        </svg>
      </div>
    );
  }

  const tiles = view.tiles;
  const playerMap: Record<string, PlayerView> = {};
  for (const p of view.players) playerMap[p.id] = p;

  const coordMap = new Map<string, typeof tiles[number]>();
  for (const tile of tiles) coordMap.set(`${tile.q},${tile.r}`, tile);

  const myTiles = userId ? tiles.filter((t) => t.claimedBy === userId) : [];

  // Tiles adjacent to my territory that are unclaimed
  const claimableIds = new Set<string>();
  if (isMyTurn && userId && !fortifyMode) {
    for (const mine of myTiles) {
      for (const dir of HEX_DIRS) {
        const neighbor = coordMap.get(`${mine.q + dir.q},${mine.r + dir.r}`);
        if (neighbor && neighbor.claimedBy == null) claimableIds.add(neighbor.id);
      }
    }
  }

  const homeTiles = view.homeTiles ?? {};
  const homeTileSet = new Set(Object.values(homeTiles));
  const myHomeTileId = userId ? (homeTiles[userId] ?? null) : null;

  const forts = view.fortifications ?? {};

  // Tiles I own that can be fortified
  const fortifiableIds = new Set<string>();
  if (fortifyMode && isMyTurn && userId) {
    for (const tile of myTiles) {
      if (!forts[tile.id]) fortifiableIds.add(tile.id);
    }
  }

  return (
    <div className="panel" style={{ padding: 10 }}>
      <svg
        viewBox={BOARD_VIEWBOX}
        style={{ width: '100%', display: 'block', margin: '0 auto' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <TerrainDefs />

        {tiles.map((tile) => {
          const [cx, cy] = hexCenter(tile.q, tile.r);
          const claimed = tile.claimedBy != null;
          const claimer = claimed ? (playerMap[tile.claimedBy!] ?? null) : null;
          const claimerColor = claimer ? (PLAYER_COLOR_CSS[claimer.color] ?? '#aaa') : null;
          const isHome = homeTileSet.has(tile.id);
          const isMyHome = tile.id === myHomeTileId;
          const canClaim = claimableIds.has(tile.id);
          const canFortify = fortifiableIds.has(tile.id);
          const isForted = !!forts[tile.id];
          const isInteractable = canClaim || canFortify;
          const isHovered = hoveredId === tile.id;

          const fill = TERRAIN_FILL[tile.terrain] ?? TERRAIN_FILL_FALLBACK[tile.terrain] ?? '#444';

          let stroke = '#1a1c22';
          let strokeWidth = 1;
          if (canClaim) {
            stroke = isHovered ? '#ffa040' : '#d97e3a';
            strokeWidth = isHovered ? 3 : 2.5;
          } else if (canFortify) {
            stroke = isHovered ? '#a0c8ff' : '#5595d0';
            strokeWidth = isHovered ? 3 : 2.5;
          } else if (claimed && claimerColor) {
            stroke = claimerColor;
            strokeWidth = 1.8;
          }

          return (
            <g
              key={tile.id}
              style={{ cursor: isInteractable ? 'pointer' : 'default' }}
              onClick={() => {
                if (canClaim) onClaimTile?.(tile.id);
                else if (canFortify) onFortifyTile?.(tile.id);
              }}
              onMouseEnter={() => setHoveredId(tile.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Base hex with gradient */}
              <polygon
                points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />

              {/* Claimed overlay — darkens tile and tints with player color */}
              {claimed && (
                <polygon
                  points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                  fill="url(#grad-claimed)"
                  stroke="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Hover glow */}
              {isInteractable && isHovered && (
                <polygon
                  points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                  fill="white"
                  fillOpacity={0.12}
                  stroke="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Terrain illustration */}
              <TerrainIcon terrain={tile.terrain} cx={cx} cy={cy} />

              {/* VP badge — top-right corner */}
              <circle
                cx={cx + HEX_SIZE * 0.52}
                cy={cy - HEX_SIZE * 0.62}
                r={10}
                fill={claimed ? '#0f1115' : '#1e2128'}
                stroke={claimed ? (claimerColor ?? '#333') : '#444'}
                strokeWidth={1}
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={cx + HEX_SIZE * 0.52}
                y={cy - HEX_SIZE * 0.62 + 4}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={claimed ? (claimerColor ?? '#aaa') : '#ece8df'}
                fillOpacity={0.9}
                fontFamily="var(--font-mono)"
                style={{ pointerEvents: 'none' }}
              >
                {TERRAIN_VP[tile.terrain] ?? '?'}
              </text>

              {/* Terrain label */}
              <text
                x={cx}
                y={cy + HEX_SIZE * 0.72}
                textAnchor="middle"
                fontSize="9"
                fill="#ece8df"
                fillOpacity={claimed ? 0.35 : 0.55}
                fontFamily="var(--font-mono)"
                style={{ pointerEvents: 'none' }}
              >
                {TERRAIN_LABEL[tile.terrain] ?? tile.terrain}
              </text>

              {/* Claimed: player color stripe at bottom */}
              {claimed && claimerColor && (
                <>
                  <polygon
                    points={hexCorners(cx, cy + HEX_SIZE * 0.58, HEX_SIZE * 0.3)}
                    fill={claimerColor}
                    fillOpacity={0.85}
                    stroke="#0f1115"
                    strokeWidth={1}
                    style={{ pointerEvents: 'none' }}
                  />
                  <text
                    x={cx}
                    y={cy + HEX_SIZE * 0.58 + 4}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="#fff"
                    fontFamily="var(--font-mono)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {claimer?.displayName.charAt(0).toUpperCase() ?? '?'}
                  </text>
                </>
              )}

              {/* Fort marker */}
              {isForted && (
                <FortMarker
                  cx={cx}
                  cy={cy}
                  color={claimerColor ?? '#aaa'}
                />
              )}

              {/* Home tile star */}
              {isHome && (
                <text
                  x={cx - HEX_SIZE * 0.52}
                  y={cy - HEX_SIZE * 0.55}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isMyHome ? '#f1c40f' : (claimerColor ?? '#888')}
                  fillOpacity={0.9}
                  style={{ pointerEvents: 'none' }}
                >
                  ★
                </text>
              )}

              {/* Claimable pulse ring */}
              {canClaim && !isHovered && (
                <polygon
                  points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                  fill="none"
                  stroke="#d97e3a"
                  strokeWidth={1}
                  strokeOpacity={0.45}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Fortifiable highlight ring */}
              {canFortify && !isHovered && (
                <polygon
                  points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                  fill="none"
                  stroke="#5595d0"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--fg-dim)', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span>Plains · 1 vp</span>
        <span>Forest · 2 vp · 🪵</span>
        <span>Mountain · 3 vp · 🪨</span>
        <span>★ home tile</span>
        {Object.keys(forts).length > 0 && <span>🏰 fort · +1 vp/round</span>}
      </div>

      <DicePanel lastClaim={lastClaim} players={view.players} />
    </div>
  );
}
