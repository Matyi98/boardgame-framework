/**
 * First-run interactive tutorial (ticket #41).
 *
 * The classic UX test this ticket names — "can a player understand this
 * without a tutorial?" — fails hardest on the loyalty/capture mechanic,
 * since winning a fight not capturing the tile is the one rule that
 * contradicts every other game's conventions. These steps are ordered to
 * land on that rule last, after the player already has the vocabulary
 * (tiles, units, combat) to make sense of it.
 *
 * Auto-shows once per browser (persisted), and is re-launchable any time
 * from the header's 🎓 button — ticket #42's "reachable anytime" principle
 * applies here too, not just to the static rules reference.
 */

import { useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Modal, Button } from './primitives.js';

interface TutorialSeenState {
  hasSeenTutorial: boolean;
  markSeen: () => void;
}

export const useTutorialSeen = create<TutorialSeenState>()(
  persist(
    (set) => ({
      hasSeenTutorial: false,
      markSeen: () => set({ hasSeenTutorial: true }),
    }),
    { name: 'kingdoms-tutorial-seen' },
  ),
);

interface Step {
  title: string;
  body: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'Welcome to Kingdoms of Dominion',
    body: 'Build an economy, raise an army, and be the last kingdom standing by capturing every other player\'s Capital. This will take about a minute.',
  },
  {
    title: '1. Select a tile',
    body: 'Click any tile to select it — the side panel on the right always shows what\'s relevant to it: recruit and build options on your own tiles, an attack option on tiles next to your territory, or just info if it\'s out of reach.',
  },
  {
    title: '2. Recruit units',
    body: 'Select your Capital, open the "recruit" section, and raise Spearmen, Cannoneers, or Nobles. Each costs gold plus one other resource — the panel tells you exactly what you\'re short of if you can\'t afford something yet.',
  },
  {
    title: '3. Send troops',
    body: 'Select a tile with units on it, choose "Send Troops", then click any other tile you own as the destination. You pick exactly how many of each unit kind go — the rest stay put.',
  },
  {
    title: '4. Attack',
    body: 'Click a tile next to your territory that you don\'t own (or select your own tile and choose "Attack from here") to start an attack. You choose which units join the fight. One attack per turn, from anywhere.',
  },
  {
    title: '5. Capture & loyalty — the one rule that surprises everyone',
    body: 'Winning a fight does NOT capture the tile. Every tile you don\'t own has hidden loyalty starting at 100. Include a Noble in a winning attack and, if it survives, loyalty drops by 45 — three Noble-led wins takes any tile, including an enemy Capital. Loyalty recovers over time, so sustained pressure beats sporadic raids.',
  },
];

export function Tutorial({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState(0);
  const { markSeen } = useTutorialSeen();
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = () => {
    markSeen();
    onClose();
  };

  return (
    <Modal title={`How to play — ${step + 1} of ${STEPS.length}`} onClose={finish}>
      <div className="k-modal__section">
        <div className="k-modal__section-title">{current.title}</div>
        <div>{current.body}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>← Back</Button>
        )}
        <Button variant="ghost" onClick={finish}>Skip</Button>
        <Button onClick={isLast ? finish : () => setStep((s) => s + 1)} style={{ marginLeft: 'auto' }}>
          {isLast ? 'Start playing →' : 'Next →'}
        </Button>
      </div>
    </Modal>
  );
}
