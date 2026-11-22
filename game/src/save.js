// Solmar Bay — save/load via localStorage. Saves cash, story progress, position,
// time of day and which protagonist is active.
import { SAVE_KEY } from './config.js';

export function saveGameData(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGameData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function clearSaveData() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage */ }
}
