// Share a deal or your savings as plain text (React Native's Share sheet). A deal links to the share page published
// with the API (sydney/pipeline/share.html → <site>/s/?id=<code>&f=<fuel>), so friends without Bowser still see it.
// Shared prices are pump prices: your discounts are yours, not your friends'.
import { Platform, Share } from 'react-native';

import { API_BASE } from './api';
import { fuelName, nice, stationName } from './format';
import { money, type SavingsSummary } from './savings';
import type { Fuel } from './types';

/** The share page sits beside the API: …/api/v1 → …/s/ */
export const SHARE_BASE = API_BASE.replace(/\/api\/v1\/?$/, '') + '/s/';

export const shareUrl = (id: string, fuel: Fuel) => `${SHARE_BASE}?id=${encodeURIComponent(id)}&f=${fuel}`;

export function dealMessage(d: {
  id: string; n: string; s: string; fuel: Fuel; pump: number; median: number | null; advice: string | null;
}): string {
  const gap = d.median != null ? d.pump - d.median : null;
  const vs = gap == null || Math.abs(gap) < 0.05 ? '' : `, ${Math.abs(gap).toFixed(1)}c ${gap < 0 ? 'under' : 'over'} the Sydney median`;
  const adv = d.advice ? ` Bowser says: ${d.advice}.` : '';
  return `${stationName(d.n)} (${d.s}): ${fuelName(d.fuel)} ${d.pump.toFixed(1)}c/L today${vs}.${adv}\n${shareUrl(d.id, d.fuel)}`;
}

/** Only a saving is worth bragging about: null when the total isn't positive */
export function savingsMessage(s: SavingsSummary): string | null {
  if (Math.round(s.total * 100) <= 0) return null;
  return `Bowser has saved me ${money(s.total)} on fuel${s.since ? ` since ${nice(s.since, false)}` : ''} (${s.n} fill${s.n === 1 ? '' : 's'}). It tells me when to fill up in Sydney and where it's cheapest.`;
}

/** Whether there's a share sheet: always on Android and iOS; on the web only where the browser has navigator.share
 *  (react-native-web's Share rejects without it, so the buttons are hidden there) */
export const canShare = () => Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/** Opens the system share sheet; a dismissed sheet or a platform without one is not an error */
export async function shareText(message: string) {
  try {
    await Share.share({ message });
  } catch {
    // nothing to do: the user can try again
  }
}
