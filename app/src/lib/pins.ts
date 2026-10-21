// Pinned stations (by NSW station code), kept on the phone. Shared by Today, Stations, the station page and the widget.
import { useSyncExternalStore } from 'react';

import Storage from './storage';

const KEY = 'pins.v1';
export const MAX_PINS = 10;

function load(): string[] {
  try {
    const raw = Storage.getItemSync(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).slice(0, MAX_PINS) : [];
  } catch {
    return [];
  }
}

let pins = load();
const listeners = new Set<() => void>();
const changeHooks = new Set<(pins: string[]) => void>();

function save(next: string[]) {
  pins = next;
  try {
    Storage.setItemSync(KEY, JSON.stringify(pins));
  } catch {
    // pins still apply for this session
  }
  listeners.forEach((l) => l());
  changeHooks.forEach((h) => h(pins));
}

export const getPins = () => pins;
/** Fresh read from storage, for code that runs outside the app UI (the widget task handler). */
export const readPinsFromStorage = () => load();
export const isPinned = (id: string) => pins.includes(id);

/** Pin or unpin; returns false if the pin list is full. Newest pins go first. */
export function togglePin(id: string): boolean {
  if (!id) return false;   // stations from an old cached stations.json have no id
  if (pins.includes(id)) {
    save(pins.filter((p) => p !== id));
    return true;
  }
  if (pins.length >= MAX_PINS) return false;
  save([id, ...pins]);
  return true;
}

/** Called after every change (the widget uses this to refresh itself). */
export function onPinsChange(h: (pins: string[]) => void) {
  changeHooks.add(h);
  return () => changeHooks.delete(h);
}

export function usePins(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pins,
  );
}
