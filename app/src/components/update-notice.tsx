// "A new version of Bowser is available": shown on every cold launch while the API's app.json (sydney/pipeline/
// app_release.json) lists a newer version for this platform than the one installed. Testers sideload APKs, so nothing
// else tells them; drop this once Bowser is on the Play Store / App Store. Self-contained (no app imports, own colours)
// on purpose: the same file is added to older versions' code and shipped to them as an OTA update.
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

type Release = { version: string; url: string; notes?: string };
export type UpdateAction = 'shown' | 'update' | 'later';

const SEMVER = /^\d+\.\d+\.\d+$/;
/** Only Bowser's own EAS build pages open from here (same rule as export_api.py) */
const SAFE_URL = /^https:\/\/expo\.dev\/accounts\/nathann97\/projects\/fuel-forecast\/builds\/[0-9a-f-]{36}$/;
/** Once per app process: a root remount (error-boundary retry, Activity re-created) doesn't ask again */
let asked = false;

/** a > b for x.y.z versions */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

/** This platform's release from app.json, if it's newer than `installed` and well formed */
export function pendingRelease(json: unknown, os: string, installed: string | undefined): Release | null {
  const r = (json as Record<string, unknown> | null)?.[os] as Partial<Release> | null | undefined;
  if (!r || typeof r.version !== 'string' || typeof r.url !== 'string') return null;
  if (!SEMVER.test(r.version) || !SAFE_URL.test(r.url) || !installed || !SEMVER.test(installed)) return null;
  if (!newer(r.version, installed)) return null;
  const notes = typeof r.notes === 'string' && r.notes.length <= 300 ? r.notes : undefined;
  return { version: r.version, url: r.url, notes };
}

export function UpdateNotice({ releaseUrl, onAction }: {
  releaseUrl: string;
  onAction?: (a: UpdateAction, latest: string) => void;
}) {
  const dark = useColorScheme() === 'dark';
  const [rel, setRel] = useState<Release | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || asked) return;
    let live = true;
    const ctl = new AbortController();
    // After the splash (hidden by 2.5 s at the latest), so it doesn't race the first screen
    const t = setTimeout(() => {
      const stop = setTimeout(() => ctl.abort(), 8000);   // a stalled connection: not mid-task minutes later
      fetch(releaseUrl, { headers: { Accept: 'application/json' }, signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          asked = true;   // answered: not again this process (an aborted or failed fetch may retry on remount)
          const p = pendingRelease(j, Platform.OS, Constants.expoConfig?.version);
          if (live && p) {
            setRel(p);
            onAction?.('shown', p.version);
          }
        })
        .catch(() => {})   // offline: ask next launch
        .finally(() => clearTimeout(stop));
    }, 3500);
    return () => {
      live = false;
      clearTimeout(t);
      ctl.abort();
    };
    // Once per launch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rel) return null;
  const c = dark
    ? { card: '#181b1e', fg: '#eef0f2', fg2: '#c2c7cc', line: '#2a2e33' }
    : { card: '#ffffff', fg: '#141618', fg2: '#45494d', line: '#e2e3df' };
  const close = (a: UpdateAction) => {
    onAction?.(a, rel.version);
    setRel(null);
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close('later')} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]} accessibilityViewIsModal>
          <Text style={[styles.title, { color: c.fg }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
            Bowser {rel.version} is available
          </Text>
          {/* Scrolls at large text sizes so the buttons stay on screen */}
          <ScrollView style={{ maxHeight: 220 }}>
            <Text style={[styles.body, { color: c.fg2 }]} maxFontSizeMultiplier={1.6}>
              {rel.notes ?? 'A new version is ready.'} You have {Constants.expoConfig?.version}. Install the update to keep getting fixes and new features.
            </Text>
          </ScrollView>
          <Pressable
            onPress={() => {
              Linking.openURL(rel.url).catch(() => {});
              close('update');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.primaryText} maxFontSizeMultiplier={1.6}>Update</Text>
          </Pressable>
          <Pressable onPress={() => close('later')} accessibilityRole="button" hitSlop={8} style={styles.later}>
            <Text style={[styles.laterText, { color: c.fg2 }]} maxFontSizeMultiplier={1.6}>Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 12 },
  title: { fontSize: 19, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 21 },
  primary: { backgroundColor: '#ffb22e', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#141618', fontSize: 16, fontWeight: '800' },
  later: { alignItems: 'center', paddingVertical: 6 },
  laterText: { fontSize: 15, fontWeight: '600' },
});
