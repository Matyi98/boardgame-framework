import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../../store/game.js';

const DICE_FACE_DOTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-10, -10], [10, 10]],
  3: [[-10, -10], [0, 0], [10, 10]],
  4: [[-10, -10], [10, -10], [-10, 10], [10, 10]],
  5: [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]],
  6: [[-10, -10], [10, -10], [-10, 0], [10, 0], [-10, 10], [10, 10]],
};

function DiceFace({ value, size = 48, jackpot = false }: { value: number; size?: number; jackpot?: boolean }): JSX.Element {
  const dots = DICE_FACE_DOTS[value] ?? [];
  return (
    <svg width={size} height={size} viewBox="-30 -30 60 60">
      <rect x={-28} y={-28} width={56} height={56} rx={8}
        fill={jackpot ? '#f1c40f' : '#1e2128'}
        stroke={jackpot ? '#c8940a' : '#555'}
        strokeWidth={2}
      />
      {dots.map(([dx, dy], i) => (
        <circle key={i} cx={dx} cy={dy} r={5} fill={jackpot ? '#1e2128' : '#ece8df'} />
      ))}
    </svg>
  );
}

interface DiceResult {
  die1: number;
  die2: number;
  total: number;
  bonusVp: number;
  claimerName: string;
  terrain: string;
  vp: number;
}

interface LastClaim {
  tileId: string;
  diceRoll?: number;
  die1?: number;
  die2?: number;
  bonusVp?: number;
  claimedBy?: string;
  terrain?: string;
  vp?: number;
  resource?: string | null;
}

const TERRAIN_LABEL: Record<string, string> = { grass: 'Plains', forest: 'Forest', mountain: 'Mountain' };

export function DicePanel({ lastClaim, players }: {
  lastClaim: LastClaim | undefined;
  players: PlayerView[];
}): JSX.Element | null {
  const [display, setDisplay] = useState<DiceResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [frame1, setFrame1] = useState(1);
  const [frame2, setFrame2] = useState(1);
  const prevTileRef = useRef<string | undefined>(undefined);
  const rollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!lastClaim?.diceRoll || lastClaim.tileId === prevTileRef.current) return;
    prevTileRef.current = lastClaim.tileId;

    const claimer = players.find((p) => p.id === lastClaim.claimedBy);
    const result: DiceResult = {
      die1: lastClaim.die1 ?? Math.ceil(lastClaim.diceRoll / 2),
      die2: lastClaim.die2 ?? (Math.floor(lastClaim.diceRoll / 2) || 1),
      total: lastClaim.diceRoll,
      bonusVp: lastClaim.bonusVp ?? 0,
      claimerName: claimer?.displayName ?? '?',
      terrain: lastClaim.terrain ?? '',
      vp: lastClaim.vp ?? 0,
    };

    setRolling(true);
    let ticks = 0;
    rollTimer.current = setInterval(() => {
      ticks++;
      setFrame1(Math.ceil(Math.random() * 6));
      setFrame2(Math.ceil(Math.random() * 6));
      if (ticks >= 12) {
        clearInterval(rollTimer.current!);
        setRolling(false);
        setDisplay(result);
      }
    }, 70);

    return () => { if (rollTimer.current) clearInterval(rollTimer.current); };
  }, [lastClaim?.tileId]);

  if (!display && !rolling) return null;

  const jackpot = !rolling && (display?.bonusVp ?? 0) > 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 16px', marginTop: 12,
      background: 'var(--bg-soft)', borderRadius: 8,
      border: `1px solid ${jackpot ? '#f1c40f55' : 'var(--rule)'}`,
      transition: 'border-color 0.3s',
    }}>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <DiceFace value={rolling ? frame1 : (display?.die1 ?? 1)} jackpot={jackpot} />
        <DiceFace value={rolling ? frame2 : (display?.die2 ?? 1)} jackpot={jackpot} />
      </div>
      <div>
        {rolling ? (
          <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>rolling…</span>
        ) : display ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: jackpot ? '#f1c40f' : 'var(--fg)' }}>
              {display.total}
              {display.bonusVp > 0 && <span style={{ marginLeft: 6, fontSize: 12 }}>✨ +{display.bonusVp} bonus VP!</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
              {display.claimerName} claimed {TERRAIN_LABEL[display.terrain] ?? display.terrain} · +{display.vp} VP total
              {display.terrain === 'forest' && <span style={{ marginLeft: 6 }}>🪵+1</span>}
              {display.terrain === 'mountain' && <span style={{ marginLeft: 6 }}>🪨+1</span>}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
