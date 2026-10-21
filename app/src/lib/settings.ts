// Small persisted settings shared across tabs (the dashboard's fuel picker applies to every section).
import Storage from './storage';
import { useSyncExternalStore } from 'react';

import type { Fuel } from './types';

export type Settings = {
  fuel: Fuel;
  radiusKm: number;
  members: boolean;
  sort: 'price' | 'distance';
};

const KEY = 'settings.v1';
const DEFAULTS: Settings = { fuel: 'U91', radiusKm: 5, members: true, sort: 'price' };

function load(): Settings {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let state = load();
const listeners = new Set<() => void>();

export function setSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    Storage.setItemSync(KEY, JSON.stringify(state));
  } catch {
    // settings still apply for this session
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
