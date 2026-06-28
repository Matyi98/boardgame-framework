import React, { useState, useRef, useEffect, useMemo, memo } from 'react';
import type { KingdomsTileView, KingdomsPlayerView, KingdomsTurnState } from '@bgf/game-core';
import type { TileEffect } from './store/kingdoms-game.js';
import {
  hexCenterAt,
  hexCorners,
  KINGDOMS_HEX_SIZE,
} from '../../components/board/hex-geometry.js';
import { playerColor, playerPattern } from './player-visuals.js';

// ── Visual constants ─────────────────────────────────────────────────────────

const INITIAL_VB = { x: -380, y: -330, w: 760, h: 660 };
const MIN_VB_W = 200;
const MAX_VB_W = 1100;

// Top-face fill: a per-terrain gradient (defined in TerrainDefs) for a soft
// lit-from-above look instead of a flat 2000s-era solid color.
const TERRAIN_FILL: Record<string, string> = {
  plains:   'url(#k-grad-plains)',
  hills:    'url(#k-grad-hills)',
  forest:   'url(#k-grad-forest)',
  mountain: 'url(#k-grad-mountain)',
};

// Darker shade of each terrain, used for the low-poly "base lip" that peeks
// out beneath the top face — gives tiles a subtle extruded-block feel.
const TERRAIN_DARK: Record<string, string> = {
  plains:   '#3d6620',
  hills:    '#7a5a28',
  forest:   '#0a3327',
  mountain: '#3f3b37',
};

const RESOURCE_COLOR: Record<string, string> = {
  wood: '#c07830',
  food: '#50b050',
  iron: '#7090c0',
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface KingdomsBoardProps {
  tiles: readonly KingdomsTileView[];
  players: readonly KingdomsPlayerView[];
  turnState: KingdomsTurnState;
  userId: string | null;
  mode: 'idle' | 'move' | 'attack' | 'recruit' | 'build';
  selectedTileId: string | null;
  reachableTiles: ReadonlySet<string>;
  attackableTiles: ReadonlySet<string>;
  tileEffects: Record<string, TileEffect>;
  onTileClick: (tileId: string) => void;
}

// ── Terrain texture patterns (SVG defs, rendered once per board) ─────────────

function TerrainDefs(): JSX.Element {
  return (
    <defs>
      {/* Subtle per-tile elevation — cheap drop shadow so hexes read as raised tokens */}
      <filter id="k-tile-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodColor="#000000" floodOpacity="0.45" />
      </filter>

      {/* Glow halo — used on selection rings, capital stars, and occupation badges */}
      <filter id="k-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Glossy sheen overlay for unit tokens / capital star — gives volume without per-color gradients */}
      <radialGradient id="k-sheen" cx="32%" cy="28%" r="75%">
        <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.6" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>

      {/* Per-terrain top-face gradients — lit from above, replaces flat 2000s-era fills.
          Ticket #9: hues are deliberately spread apart (yellow-green / teal-green /
          warm tan / cool gray-blue) instead of four near-identical green-browns —
          a new player should be able to name all four terrains without the legend. */}
      <linearGradient id="k-grad-plains" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#8cc152" />
        <stop offset="100%" stopColor="#5a8f2e" />
      </linearGradient>
      <linearGradient id="k-grad-hills" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#d4ad6a" />
        <stop offset="100%" stopColor="#9c7438" />
      </linearGradient>
      <linearGradient id="k-grad-forest" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#1f8a6e" />
        <stop offset="100%" stopColor="#0e4536" />
      </linearGradient>
      {/* Ticket #59: was #8d96a8→#4d5566, a fairly saturated blue-gray that
          flirted with reading as water (this game has no water terrain) and
          sat close to neutral/unclaimed gray. Desaturated and shifted toward
          a neutral stone tone — still cool enough to stay distinct from
          Hills' warm tan, no longer blue enough to suggest "lake." */}
      <linearGradient id="k-grad-mountain" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#9a958f" />
        <stop offset="100%" stopColor="#56514c" />
      </linearGradient>

      {/* Edge vignette (ticket #25) — darkens the viewport edges so the
          high-value center of the map (§1: economic value peaks at the
          center ring) reads as the composition's focal point. */}
      <radialGradient id="k-vignette" cx="50%" cy="50%" r="70%">
        <stop offset="55%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
      </radialGradient>

      {/* Plains: faint grass-tuft texture, low opacity so the gradient carries the look */}
      <pattern id="k-tex-plains" patternUnits="userSpaceOnUse" width="20" height="18">
        <g stroke="#a8e088" strokeWidth="1.1" fill="none" strokeLinecap="round">
          <line x1="4"  y1="14" x2="4"  y2="10" />
          <line x1="2.5" y1="11" x2="4" y2="8.5" /><line x1="4" y1="8.5" x2="5.5" y2="11" />
          <line x1="13" y1="15" x2="13" y2="11" />
          <line x1="11.5" y1="11.5" x2="13" y2="9" /><line x1="13" y1="9" x2="14.5" y2="11.5" />
        </g>
      </pattern>

      {/* Hills: soft rolling contour lines */}
      <pattern id="k-tex-hills" patternUnits="userSpaceOnUse" width="26" height="18">
        <g fill="none" strokeLinecap="round">
          <path d="M -2,14 Q 6,5 14,14"   stroke="#e8cf9a" strokeWidth="1.1" strokeOpacity="0.7" />
          <path d="M 10,14 Q 18,5 26,14"  stroke="#e8cf9a" strokeWidth="1.1" strokeOpacity="0.7" />
        </g>
      </pattern>

      {/* Forest: simplified pine silhouettes, softened */}
      <pattern id="k-tex-forest" patternUnits="userSpaceOnUse" width="24" height="22">
        <g fill="#5ad030" fillOpacity="0.45">
          <polygon points="8,16 12,7 16,16" />
          <polygon points="18,17 21,12 24,17" />
          <polygon points="-2,17 1,12 4,17"  />
        </g>
      </pattern>

      {/* Mountain: layered rocky peaks with snow caps, softened */}
      <pattern id="k-tex-mountain" patternUnits="userSpaceOnUse" width="30" height="20">
        <g fill="#c0b0a0" fillOpacity="0.4">
          <polygon points="11,16 16,6 21,16" />
          <polygon points="0,16 5,9 10,16"   />
          <polygon points="22,16 26,10 30,16" />
        </g>
        <g fill="#ffffff" fillOpacity="0.25">
          <polygon points="13.5,12 16,6 18.5,12" />
        </g>
      </pattern>
    </defs>
  );
}

// ── Per-tile unit bubble data ────────────────────────────────────────────────

interface UnitBubble {
  ownerId: string;
  kind: string;
  color: string;
  count: number;
}

function buildUnitBubbles(
  tile: KingdomsTileView,
  players: readonly KingdomsPlayerView[],
): UnitBubble[] {
  const eliminatedIds = new Set(players.filter((p) => p.isEliminated).map((p) => p.id));
  const kindOwnerMap = new Map<string, UnitBubble>();

  for (const piece of tile.pieces) {
    if (piece.attack === null) continue; // structures don't bubble
    if (eliminatedIds.has(piece.owner)) continue;
    const pView = players.find((p) => p.id === piece.owner);
    if (!pView) continue;
    const key = `${piece.owner}:${piece.kind}`;
    const entry = kindOwnerMap.get(key);
    if (entry) {
      entry.count++;
    } else {
      kindOwnerMap.set(key, {
        ownerId: piece.owner,
        kind: piece.kind,
        color: playerColor(pView.color),
        count: 1,
      });
    }
  }

  return [...kindOwnerMap.values()].slice(0, 3);
}

// ── Unit icons (rendered inside player-colored bubbles, centered at 0,0) ─────

function UnitIcon({ kind }: { kind: string }): JSX.Element {
  const f = 'rgba(255,255,255,0.97)';
  switch (kind) {
    case 'spearman':
      // Diagonal spear (shaft top-left to bottom-right + arrowhead tip)
      return (
        <g stroke={f} strokeWidth="2" strokeLinecap="round" fill="none">
          <line x1="-5" y1="-6" x2="5" y2="6" />
          <polyline points="-5,-6 -5,-1 0,-6" fill={f} stroke={f} strokeWidth="1.2" />
        </g>
      );
    case 'cannoneer':
      return (
        <g fill={f} stroke="none">
          {/* Fat barrel */}
          <rect x="-6" y="-2.5" width="12" height="5" rx="2.5" />
          {/* Cannonball */}
          <circle cx="0" cy="5.5" r="3.5" />
        </g>
      );
    case 'noble':
      // Crown: base band + 3 points
      return (
        <g fill={f} stroke="none">
          <rect x="-6" y="1" width="12" height="4" />
          <polygon points="-6,1 -6,-5 -3,0 0,-6 3,0 6,-5 6,1" />
        </g>
      );
    default:
      return (
        <text fontSize={10} fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="800">
          {kind[0]?.toUpperCase() ?? '?'}
        </text>
      );
  }
}

// ── Structure icons (rendered at hex center area) ─────────────────────────────

function StructureIcon({
  kind,
  isCapital,
  cx,
  cy,
  HS,
  ownerColor,
}: {
  kind: string;
  isCapital: boolean;
  cx: number;
  cy: number;
  HS: number;
  ownerColor: string | null;
}): JSX.Element | null {
  const ptr = { style: { userSelect: 'none' as const, pointerEvents: 'none' as const } };
  const f = '#ffffffdd';

  if (isCapital) {
    // 5-pointed star — large, owner-colored
    const Ro = 12, Ri = 5;
    const pts = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 === 0 ? Ro : Ri;
      const a = (i * 36 - 90) * Math.PI / 180;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + 2 + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    return (
      <g {...ptr} filter="url(#k-glow)">
        <polygon points={pts} fill={ownerColor ?? '#d4a820'} stroke="#000" strokeWidth={0.8} strokeOpacity={0.4} />
        <polygon points={pts} fill="url(#k-sheen)" stroke="none" />
      </g>
    );
  }

  // Non-capital: compact icons in the lower-center area
  const ox = cx;
  const oy = cy + HS * 0.35; // vertical anchor (~cy+7.7 for HS=22)

  switch (kind) {
    case 'farm':
      // Wheat sheaf: three oval grain heads + converging stalks + binding band
      return (
        <g {...ptr}>
          <ellipse cx={ox}   cy={oy - 9.5} rx={2.5} ry={4}   fill={f} />
          <ellipse cx={ox-5} cy={oy - 7.5} rx={2}   ry={3.2} fill={f} />
          <ellipse cx={ox+5} cy={oy - 7.5} rx={2}   ry={3.2} fill={f} />
          <line x1={ox}   y1={oy - 5.5} x2={ox}   y2={oy - 0.5} stroke={f} strokeWidth="1.5" />
          <line x1={ox-4} y1={oy - 4.5} x2={ox-1} y2={oy - 0.5} stroke={f} strokeWidth="1.3" />
          <line x1={ox+4} y1={oy - 4.5} x2={ox+1} y2={oy - 0.5} stroke={f} strokeWidth="1.3" />
          <rect x={ox - 6} y={oy - 0.5} width={12} height={3.5} rx={1.5} fill={f} />
        </g>
      );
    case 'city':
      // Gabled market-hall: triangular roof + wide body + arched door + side windows
      return (
        <g {...ptr}>
          <polygon points={`${ox},${oy-13} ${ox-9},${oy-5} ${ox+9},${oy-5}`} fill={f} />
          <rect x={ox - 8} y={oy - 5} width={16} height={10} fill={f} />
          <path
            d={`M ${ox-3},${oy+5} L ${ox-3},${oy} A 3,4 0 0,1 ${ox+3},${oy} L ${ox+3},${oy+5} Z`}
            fill="rgba(0,0,0,0.45)"
          />
          <rect x={ox - 7.5} y={oy - 4} width={3} height={3.5} rx={0.5} fill="rgba(0,0,0,0.4)" />
          <rect x={ox + 4.5} y={oy - 4} width={3} height={3.5} rx={0.5} fill="rgba(0,0,0,0.4)" />
        </g>
      );
    case 'castle':
      // Fortress wall: 4 crenellated merlons + wide body + arched gate
      return (
        <g fill={f} {...ptr}>
          <rect x={ox - 9}   y={oy - 9} width={4} height={6} />
          <rect x={ox - 4}   y={oy - 9} width={4} height={6} />
          <rect x={ox + 1}   y={oy - 9} width={4} height={6} />
          <rect x={ox + 6}   y={oy - 9} width={4} height={6} />
          <rect x={ox - 9}   y={oy - 3} width={19} height={8} />
          <path
            d={`M ${ox-3},${oy+5} L ${ox-3},${oy} A 3,3 0 0,1 ${ox+3},${oy} L ${ox+3},${oy+5} Z`}
            fill="rgba(0,0,0,0.4)"
          />
        </g>
      );
    case 'gate':
      // Stone arch: two pillar columns + rounded arch + keystone
      return (
        <g {...ptr}>
          <rect x={ox - 8}   y={oy - 5}  width={3.5} height={10} fill={f} />
          <rect x={ox + 4.5} y={oy - 5}  width={3.5} height={10} fill={f} />
          <path d={`M ${ox-8},${oy-5} a 8,7 0 0 1 16,0`} fill="none" stroke={f} strokeWidth="3.5" />
          <polygon points={`${ox},${oy-12} ${ox-2.5},${oy-7} ${ox+2.5},${oy-7}`} fill={f} />
        </g>
      );
    default:
      return null;
  }
}

// ── HexTile sub-component ────────────────────────────────────────────────────

interface OccupationInfo {
  color: string;    // last attacker's player color
  loyalty: number;  // remaining loyalty, 1-99 (0 = captured, never reaches display)
}

interface HexTileProps {
  tile: KingdomsTileView;
  players: readonly KingdomsPlayerView[];
  size: number;
  isSelected: boolean;
  isMoveTarget: boolean;
  isAttackTarget: boolean;
  effect: TileEffect | null;
  occupation: OccupationInfo | null;
  onTileClick: (tileId: string) => void;
  mode: 'idle' | 'move' | 'attack' | 'recruit' | 'build';
}

// Memoized: pan/zoom re-renders KingdomsBoard on every mousemove/wheel event,
// but tile/player/highlight props rarely change — skip re-rendering the ~60
// tile subtrees (each with several polygons/circles) when nothing relevant did.
const HexTile = memo(function HexTile({
  tile,
  players,
  size,
  isSelected,
  isMoveTarget,
  isAttackTarget,
  effect,
  occupation,
  onTileClick,
  mode,
}: HexTileProps): JSX.Element {
  const [cx, cy] = hexCenterAt(tile.q, tile.r, size);
  const points = hexCorners(cx, cy, size - 1);

  const owner = tile.owner ? players.find((p) => p.id === tile.owner) : null;
  const fillBase = TERRAIN_FILL[tile.terrain] ?? '#555555';
  const ownerColor = owner ? playerColor(owner.color) : null;
  // Ownership pattern (ticket #8): a dasharray per player so identity never
  // depends on color alone — colorblind-safe and readable on a washed-out screen.
  const ownerPattern = owner ? playerPattern(owner.color) : undefined;

  // Disconnected territory: owned tiles with incomePreview===null are dimmed
  const isDisconnected = !!owner && tile.incomePreview === null;

  // Ticket #23: once Attack/Send Troops is active, dim everything that isn't
  // a legal target so the valid set visually pops — never dims the tile
  // that's currently selected (that's always-relevant context, not a target).
  const isDimmedForAction = !isSelected && (
    (mode === 'attack' && !isAttackTarget) ||
    (mode === 'move' && !isMoveTarget)
  );

  const structures = tile.pieces.filter((p) => p.defenseMultiplier !== null);
  const topStructure = structures[0] ?? null;
  const isCapital = structures.some((p) => p.kind === 'capital-base');

  const unitBubbles = buildUnitBubbles(tile, players);

  const HS = size / 2;

  // Cursor determination
  let cursorClass = 'k-hex--selectable';
  if (mode === 'move' && isMoveTarget) cursorClass = 'k-hex--move-target';
  else if (mode === 'attack' && isAttackTarget) cursorClass = 'k-hex--attack-target';

  // Siege progress: how much loyalty has been stripped away (0-100)
  const capturedPct = occupation ? 100 - occupation.loyalty : 0;

  // Ticket #45: the board had zero ARIA/keyboard support — every tile is
  // now a real keyboard-operable control (Tab to reach it, Enter/Space to
  // act on it), not just a click target.
  const terrainName = tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1);
  const ariaLabel = [
    `${terrainName} tile`,
    owner ? `owned by ${owner.displayName}` : 'unowned',
    isCapital ? 'capital' : topStructure ? topStructure.kind.replace('-', ' ') : null,
    unitBubbles.length > 0 ? 'has units' : null,
    occupation ? `under siege, ${capturedPct}% captured` : null,
  ].filter(Boolean).join(', ');
  // Ring pulses faster once the tile is one attack away from flipping
  const nobleRingAnimation = occupation && occupation.loyalty <= 45
    ? 'k-noble-ring-fast 0.8s ease-in-out infinite'
    : 'k-noble-ring 1.6s ease-in-out infinite';
  const siegeRingRadius = HS * 0.82;
  const siegeRingCircumference = 2 * Math.PI * siegeRingRadius;

  return (
    <g
      className={cursorClass}
      onClick={() => onTileClick(tile.id)}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTileClick(tile.id);
        }
      }}
      style={{
        // Ticket #58: 0.35 turned terrain into unreadable mud on every
        // non-target tile during attack/move mode. Softened the dim and
        // compensate by making the target highlight itself brighter
        // (see the k-hex--move-target/attack-target CSS rules) instead of
        // relying on darkening everything else to make targets pop.
        opacity: isDisconnected ? 0.6 : isDimmedForAction ? 0.55 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/*
        Ticket #52 — explicit, locked z-order so these cues stop fighting:
          1. terrain fill (lip → base → texture)
          2. ownership tint + ring (persistent identity, ticket #50/#51)
          3. structure/unit chips + tile detail tier
          4. siege ring (occupation)
          5. transient combat/capture/loyalty/built effects
          6. hover ring
          7. selection outline / capital ring
          8. target highlight (move/attack) — always on top, never buried
        Each combination (e.g. a contested *and* selected owned tile) was
        checked against this order, not just each cue in isolation.
      */}

      {/* 1. Terrain fill — lip, base, texture */}
      <polygon
        points={hexCorners(cx, cy + size * 0.09, size - 1)}
        fill={TERRAIN_DARK[tile.terrain] ?? '#333333'}
        stroke="none"
        style={{ pointerEvents: 'none' }}
      />
      <polygon
        points={points}
        fill={fillBase}
        stroke="#0c1218"
        strokeWidth={1}
        strokeOpacity={0.55}
      />
      <polygon
        points={points}
        fill={`url(#k-tex-${tile.terrain})`}
        fillOpacity={0.3}
        stroke="none"
        style={{ pointerEvents: 'none' }}
      />

      {/* 2. Ownership tint + ring (tickets #50/#51) — a dedicated layer
          instead of piggybacking on the terrain polygon's own stroke, so
          texture/structures/siege painting later can never visually mute
          it down to "looks neutral" the way a shared stroke could. */}
      {ownerColor && (
        <>
          <polygon points={points} fill={ownerColor} fillOpacity={0.2} stroke="none" style={{ pointerEvents: 'none' }} />
          <polygon
            points={points}
            fill="none"
            stroke={ownerColor}
            strokeWidth={3}
            strokeOpacity={0.9}
            strokeDasharray={ownerPattern}
          />
        </>
      )}
      {isCapital && ownerColor && !isSelected && (
        <polygon
          points={points}
          fill="none"
          stroke={ownerColor}
          strokeWidth={4}
          strokeOpacity={0.7}
          strokeDasharray={ownerPattern}
          filter="url(#k-glow)"
        />
      )}

      {/* 3. Structure/unit chips + detail tier */}
      <g className="k-hex__detail" style={isSelected ? { opacity: 1 } : undefined}>
        <g style={{ pointerEvents: 'auto' }}>
          <title>Economic value {tile.economicValue} — gold income weight</title>
          <circle cx={cx + HS * 0.7} cy={cy - HS * 0.9} r={6} fill="#d4a820" stroke="#000" strokeOpacity={0.4} strokeWidth={0.8} />
          <text
            x={cx + HS * 0.7}
            y={cy - HS * 0.9}
            fontSize={7}
            fontWeight="800"
            fill="#1a1206"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ userSelect: 'none' }}
          >
            {tile.economicValue}
          </text>
        </g>
        {tile.resourceType && (
          <g style={{ pointerEvents: 'auto' }}>
            <title>{tile.resourceType[0].toUpperCase()}{tile.resourceType.slice(1)} deposit</title>
            <circle
              cx={cx - HS * 0.55}
              cy={cy + HS * 0.65}
              r={6}
              fill={RESOURCE_COLOR[tile.resourceType] ?? '#888888'}
              stroke="#000"
              strokeOpacity={0.4}
              strokeWidth={0.8}
            />
            <text
              x={cx - HS * 0.55}
              y={cy + HS * 0.65}
              fontSize={6.5}
              fontWeight="800"
              fill="#fff"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ userSelect: 'none' }}
            >
              {tile.resourceType[0].toUpperCase()}
            </text>
          </g>
        )}
      </g>
      {tile.developed && (
        <circle cx={cx + HS * 0.55} cy={cy + HS * 0.65} r={3} fill="#d4a820" />
      )}
      {topStructure && (
        <StructureIcon
          kind={topStructure.kind}
          isCapital={isCapital}
          cx={cx}
          cy={cy}
          HS={HS}
          ownerColor={ownerColor}
        />
      )}
      {unitBubbles.map((b, i) => {
        const R = 12;
        const STEP = 27;
        const totalW = unitBubbles.length * STEP;
        const startX = cx - totalW / 2 + STEP / 2;
        const bx = startX + i * STEP;
        const by = cy - HS * 0.38;
        return (
          <g key={`${b.ownerId}-${b.kind}`} style={{ pointerEvents: 'none' }}>
            <title>{b.count} {b.kind}{b.count > 1 ? 's' : ''}</title>
            <circle
              cx={bx} cy={by} r={R}
              fill={b.color} fillOpacity={0.97}
              stroke="#000" strokeWidth={1.5} strokeOpacity={0.6}
            />
            <circle cx={bx} cy={by} r={R} fill="url(#k-sheen)" stroke="none" />
            <g transform={`translate(${bx},${by})`}>
              <UnitIcon kind={b.kind} />
            </g>
            {b.count > 1 && (
              <>
                <circle cx={bx + 8} cy={by + 8} r={6.5} fill="#111" stroke="#fff" strokeWidth={1} strokeOpacity={0.8} />
                <text
                  x={bx + 8} y={by + 8.5}
                  fontSize={7.5} fill="#fff"
                  textAnchor="middle" dominantBaseline="middle" fontWeight="800"
                  style={{ userSelect: 'none' }}
                >
                  {b.count}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* 4. Siege ring — contested wash + progress ring + percentage badge */}
      {occupation && (
        <>
          <polygon
            points={points}
            fill={occupation.color}
            fillOpacity={0.12 + 0.4 * (capturedPct / 100)}
            stroke="none"
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={cx} cy={cy} r={siegeRingRadius}
            fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={4}
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={cx} cy={cy} r={siegeRingRadius}
            fill="none"
            stroke={occupation.color}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={siegeRingCircumference}
            strokeDashoffset={siegeRingCircumference * (1 - capturedPct / 100)}
            transform={`rotate(-90 ${cx} ${cy})`}
            filter="url(#k-glow)"
            style={{ animation: nobleRingAnimation, pointerEvents: 'none' }}
          />
          <circle
            cx={cx + HS * 0.6} cy={cy - HS * 0.6} r={9}
            fill={occupation.color} stroke="#000" strokeWidth={1}
            filter="url(#k-tile-shadow)"
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={cx + HS * 0.6} cy={cy - HS * 0.6} r={9}
            fill="url(#k-sheen)" stroke="none"
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={cx + HS * 0.6} y={cy - HS * 0.6}
            fontSize={6.5} fontWeight="900" fill="#fff"
            textAnchor="middle" dominantBaseline="middle"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {capturedPct}%
          </text>
        </>
      )}

      {/* 5. Transient effects */}
      {effect?.kind === 'combat' && (
        <polygon points={points} fill="#cc2020" stroke="none" style={{ animation: 'k-combat-flash 1.5s ease-out both' }} />
      )}
      {effect?.kind === 'capture' && (
        <polygon points={points} fill="#8050c0" stroke="#a070e0" strokeWidth={3} style={{ animation: 'k-capture-sweep 0.8s ease-out both' }} />
      )}
      {effect?.kind === 'loyalty' && (
        <polygon points={points} fill="#d4a820" stroke="#f0c860" strokeWidth={3} style={{ animation: 'k-combat-flash 1.5s ease-out both' }} />
      )}
      {effect?.kind === 'built' && (
        <polygon points={points} fill="#40b060" stroke="#80e0a0" strokeWidth={3} style={{ animation: 'k-combat-flash 1.2s ease-out both' }} />
      )}

      {/* 6. Hover ring */}
      <polygon
        points={points}
        className="k-hex__hover-ring"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />

      {/* 7. Selection outline — ticket #57: this used to be #d97e3a, the
          app's warm --accent orange, which sat in the same hue family as
          Hills (tan/gold), the orange player slot, and any siege ring drawn
          in that player's color. A system signal (selection isn't tied to
          any player or terrain) needs a hue nothing else on the board uses —
          cyan is the one family fully free: not a player color, not a
          terrain color, not the move (blue)/attack (red) target colors. */}
      {isSelected && (
        <polygon
          points={points}
          fill="none"
          stroke="#4dd0e1"
          strokeWidth={4}
          filter="url(#k-glow)"
          style={{ animation: 'k-pulse-selected 1.2s ease-in-out infinite' }}
        />
      )}

      {/* 8. Target highlight — always last, so structures/siege/units on a
          legal target tile never bury the cue that it IS a legal target. */}
      {isMoveTarget && (
        <polygon
          points={points}
          fill="rgba(64,144,208,0.4)"
          stroke="#4090d0"
          strokeWidth={2.5}
          strokeOpacity={1}
          filter="url(#k-glow)"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {isAttackTarget && (
        <polygon
          points={points}
          fill="rgba(200,40,40,0.4)"
          stroke="#e05050"
          strokeWidth={2.5}
          strokeOpacity={1}
          filter="url(#k-glow)"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export function KingdomsBoard({
  tiles,
  players,
  turnState,
  userId: _userId,
  mode,
  selectedTileId,
  reachableTiles,
  attackableTiles,
  tileEffects,
  onTileClick,
}: KingdomsBoardProps): JSX.Element {
  // Build per-tile occupation info (last attacker's color + remaining loyalty).
  // Memoized so HexTile's React.memo can actually skip re-rendering unaffected
  // tiles during pan/zoom — without this, a brand-new Map (and brand-new
  // {color,loyalty} objects) would be created on every render, defeating memo.
  const occupationMap = useMemo(() => {
    const m = new Map<string, OccupationInfo>();
    for (const [tileId, { loyalty, lastAttackerId }] of Object.entries(turnState.tileLoyalty)) {
      const pView = players.find((p) => p.id === lastAttackerId);
      if (pView) m.set(tileId, { color: playerColor(pView.color), loyalty });
    }
    return m;
  }, [turnState.tileLoyalty, players]);

  // ── Pan / zoom state ──────────────────────────────────────────────────────
  const [vb, setVb] = useState(INITIAL_VB);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startVbX: number;
    startVbY: number;
    moved: boolean;
  } | null>(null);
  const justPannedRef = useRef(false);

  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startVbX: vb.x,
      startVbY: vb.y,
      moved: false,
    };
  };

  const onSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    d.moved = true;
    const rect = e.currentTarget.getBoundingClientRect();
    setVb(prev => ({
      ...prev,
      x: d.startVbX - dx * (prev.w / rect.width),
      y: d.startVbY - dy * (prev.h / rect.height),
    }));
  };

  const onSvgMouseUp = () => {
    if (dragRef.current?.moved) justPannedRef.current = true;
    dragRef.current = null;
  };

  const onSvgClickCapture = (e: React.MouseEvent<SVGSVGElement>) => {
    if (justPannedRef.current) {
      justPannedRef.current = false;
      e.stopPropagation();
    }
  };

  // Attach wheel listener natively so we can pass { passive: false } — React's
  // synthetic onWheel is passive in newer versions and cannot call preventDefault.
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.14 : 0.88;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      setVb(prev => {
        const newW = Math.max(MIN_VB_W, Math.min(MAX_VB_W, prev.w * factor));
        const newH = newW * (prev.h / prev.w);
        return {
          x: prev.x + px * (prev.w - newW),
          y: prev.y + py * (prev.h - newH),
          w: newW,
          h: newH,
        };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []); // setVb is stable; functional update avoids capturing vb in closure

  // Touch support (ticket #44) — the board only had mouse pan/zoom before
  // this. One finger pans (mirrors the mouse-drag logic above, reusing the
  // same dragRef/justPannedRef so tap-to-select still gets suppressed after
  // a drag); two fingers pinch-zoom (mirrors the wheel-zoom math). Needs a
  // ref for the latest viewBox since native listeners (required for
  // preventDefault — React's touch handlers are passive) don't get a fresh
  // closure over `vb` the way the React-attached mouse handlers do.
  const vbRef = useRef(vb);
  useEffect(() => { vbRef.current = vb; }, [vb]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    let pinchStartDist: number | null = null;
    let pinchStartW = 0;
    let pinchStartH = 0;
    let pinchStartVb = { x: 0, y: 0 };
    let pinchMidpoint = { px: 0, py: 0 };

    const touchDist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = {
          startClientX: t.clientX,
          startClientY: t.clientY,
          startVbX: vbRef.current.x,
          startVbY: vbRef.current.y,
          moved: false,
        };
      } else if (e.touches.length === 2) {
        e.preventDefault();
        dragRef.current = null;
        pinchStartDist = touchDist(e.touches[0], e.touches[1]);
        pinchStartW = vbRef.current.w;
        pinchStartH = vbRef.current.h;
        pinchStartVb = { x: vbRef.current.x, y: vbRef.current.y };
        const rect = el.getBoundingClientRect();
        pinchMidpoint = {
          px: ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width,
          py: ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) / rect.height,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist !== null) {
        e.preventDefault();
        const factor = pinchStartDist / touchDist(e.touches[0], e.touches[1]);
        const newW = Math.max(MIN_VB_W, Math.min(MAX_VB_W, pinchStartW * factor));
        const newH = newW * (pinchStartH / pinchStartW);
        setVb(() => ({
          x: pinchStartVb.x + pinchMidpoint.px * (pinchStartW - newW),
          y: pinchStartVb.y + pinchMidpoint.py * (pinchStartH - newH),
          w: newW,
          h: newH,
        }));
        return;
      }
      const d = dragRef.current;
      if (!d || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - d.startClientX;
      const dy = t.clientY - d.startClientY;
      if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      e.preventDefault();
      d.moved = true;
      const rect = el.getBoundingClientRect();
      setVb(prev => ({
        ...prev,
        x: d.startVbX - dx * (prev.w / rect.width),
        y: d.startVbY - dy * (prev.h / rect.height),
      }));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (dragRef.current?.moved) justPannedRef.current = true;
      if (e.touches.length === 0) {
        dragRef.current = null;
        pinchStartDist = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const isDragging = dragRef.current?.moved ?? false;
  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onMouseDown={onSvgMouseDown}
      onMouseMove={onSvgMouseMove}
      onMouseUp={onSvgMouseUp}
      onMouseLeave={onSvgMouseUp}
      onClickCapture={onSvgClickCapture}
    >
      <TerrainDefs />
      {tiles.map((tile) => (
        <HexTile
          key={tile.id}
          tile={tile}
          players={players}
          size={KINGDOMS_HEX_SIZE}
          isSelected={tile.id === selectedTileId}
          isMoveTarget={reachableTiles.has(tile.id)}
          isAttackTarget={attackableTiles.has(tile.id)}
          effect={tileEffects[tile.id] ?? null}
          occupation={occupationMap.get(tile.id) ?? null}
          onTileClick={onTileClick}
          mode={mode}
        />
      ))}
      {/* Vignette overlay — tied to the live viewBox so it darkens the visible
          edges at any pan/zoom level, not just the map's static bounds. */}
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#k-vignette)" style={{ pointerEvents: 'none' }} />
    </svg>
  );
}
