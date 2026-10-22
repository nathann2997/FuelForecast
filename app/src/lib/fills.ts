// Your fill log, kept on the phone: each "Filled up" from a station page. Savings are worked out from it in savings.ts.
import { useSyncExternalStore } from 'react';

import Storage from './storage';
import type { Fuel } from './types';

const KEY = 'fills.v1';
export const MAX_FILLS = 500;
const FUELS: readonly Fuel[] = ['U91', 'E10', 'P98', 'DL'];

export type Fill = {
  id: string;
  date: string;                // Sydney calendar day, YYYY-MM-DD
  stationId: string | null;    // NSW station code (null if the station had none)
  name: string;                // display name when logged
  brand: string;
  suburb: string;
  fuel: Fuel;
  pump: number;                // pump price that day, c/L
  paid: number;                // what you paid, c/L (pump less your discount, or as you edited it)
  litres: number;
  median: number | null;       // Sydney median for the fuel that day, c/L (null if the forecast hadn't loaded)
};

const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max = 120) => typeof v === 'string' && v.length <= max;

/** A stored fill, or null if it's damaged. Prices 50–800 c/L and 1–200 L, like the rest of the app's sanity bounds. */
export function cleanFill(x: unknown): Fill | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!str(o.id, 40) || !o.id || !str(o.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(o.date as string)) return null;
  if (!FUELS.includes(o.fuel as Fuel) || !num(o.pump, 50, 800) || !num(o.paid, 50, 800) || !num(o.litres, 1, 200)) return null;
  if (!str(o.name) || !str(o.brand) || !str(o.suburb)) return null;
  const sid = typeof o.stationId === 'string' && /^\d+$/.test(o.stationId) ? o.stationId : null;
  return {
    id: o.id as string, date: o.date as string, stationId: sid, name: o.name as string, brand: o.brand as string,
    suburb: o.suburb as string, fuel: o.fuel as Fuel, pump: o.pump as number, paid: o.paid as number, litres: o.litres as number,
    median: num(o.median, 50, 800) ? (o.median as number) : null,
  };
}

function load(): Fill[] {
  try {
    const raw = Storage.getItemSync(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.map(cleanFill).filter((f): f is Fill => f != null).slice(0, MAX_FILLS) : [];
  } catch {
    return [];
  }
}

let fills = load();
const listeners = new Set<() => void>();

function save(next: Fill[]) {
  fills = next;
  try {
    Storage.setItemSync(KEY, JSON.stringify(fills));
  } catch {
    // the log still applies for this session
  }
  listeners.forEach((l) => l());
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Log a fill; newest first (by date, then when it was logged). Returns the saved fill, or null if it doesn't check out. */
export function addFill(f: Omit<Fill, 'id'>): Fill | null {
  const c = cleanFill({ ...f, id: newId() });
  if (!c) return null;
  // Stable: a fill logged for an earlier day goes below that day's later ones
  save([c, ...fills].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)).slice(0, MAX_FILLS));
  return c;
}

export const removeFill = (id: string) => save(fills.filter((f) => f.id !== id));
export const getFills = () => fills;

export function useFills(): Fill[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => fills,
  );
}
