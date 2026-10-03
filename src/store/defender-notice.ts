import { setStore } from './core';
import { saveState } from './persistence';

export function dismissDefenderNotice(): void {
  setStore('defenderNoticeDismissed', true);
  // Persist now: autosave only snapshots fields it tracks.
  void saveState();
}
