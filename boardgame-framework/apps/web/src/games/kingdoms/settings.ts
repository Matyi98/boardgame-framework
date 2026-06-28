/**
 * Accessibility preferences (ticket #43). Kept separate from sound.ts's
 * useSoundSettings — different concern, same persistence pattern.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AccessibilitySettings {
  reduceMotion: boolean;
  toggleReduceMotion: () => void;
}

export const useAccessibilitySettings = create<AccessibilitySettings>()(
  persist(
    (set, get) => ({
      reduceMotion: false,
      toggleReduceMotion: () => set({ reduceMotion: !get().reduceMotion }),
    }),
    { name: 'kingdoms-accessibility-settings' },
  ),
);
