// The two home-screen widgets, drawn with react-native-android-widget's primitives (Android only; never import this
// from code that runs on web or iOS). Layout follows the app's hero card and station rows; colours come from theme.ts.
import { FlexWidget, ImageWidget, TextWidget, type ColorProp, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import type { Tone } from '@/lib/outlook';

import { TODAY_URI, rowsThatFit, type NoteTone, type WidgetModel } from './logic';

export const SMALL = 'BowserSmall';
export const MEDIUM = 'BowserMedium';
export const WIDGET_NAMES = [SMALL, MEDIUM] as const;

const MARK = require('@/assets/brand/widget-mark.png');

type Pal = (typeof Colors)['light'] | (typeof Colors)['dark'];
const hex = (c: string) => c as ColorProp;

function toneColors(c: Pal, t: Tone) {
  if (t === 'act') return { bg: c.actBg, fg: c.actFg };
  if (t === 'wait') return { bg: c.waitBg, fg: c.waitFg };
  return { bg: c.calmBg, fg: c.calmFg };
}

function noteColor(c: Pal, t: NoteTone) {
  if (t === 'cheap') return c.cheap;
  if (t === 'dear') return c.dear;
  if (t === 'flat' || t === 'calm') return c.muted;
  return toneColors(c, t).fg;
}

const open = { clickAction: 'OPEN_URI', clickActionData: { uri: TODAY_URI } } as const;

function Small({ m, c }: { m: WidgetModel; c: Pal }) {
  const t = toneColors(c, m.tone);
  return (
    <FlexWidget
      {...open}
      accessibilityLabel={`Bowser. ${m.fuel}: ${m.head}. ${m.rise ?? ''}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: hex(t.bg), borderRadius: 22, padding: 14, flexDirection: 'column' }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <ImageWidget image={MARK} imageWidth={24} imageHeight={24} />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={m.fuel} style={{ fontSize: 12, fontWeight: '700', color: hex(t.fg) }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={m.head} maxLines={2} truncate="END" style={{ fontSize: 19, fontWeight: '700', color: hex(t.fg) }} />
      {m.rise ? (
        <TextWidget text={m.rise} maxLines={2} truncate="END" style={{ fontSize: 12, color: hex(c.fg2), marginTop: 4 }} />
      ) : null}
      {m.asOf ? <TextWidget text={m.asOf} maxLines={1} style={{ fontSize: 10, color: hex(c.muted), marginTop: 3 }} /> : null}
    </FlexWidget>
  );
}

function Medium({ m, c, height }: { m: WidgetModel; c: Pal; height: number }) {
  const t = toneColors(c, m.tone);
  const fit = rowsThatFit(height);
  const rows = m.rows.slice(0, fit.rows);
  return (
    <FlexWidget
      {...open}
      accessibilityLabel={`Bowser. ${m.fuel}: ${m.head}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: hex(c.surface), borderRadius: 22, padding: 10, flexDirection: 'column' }}>
      {/* the verdict, tinted like Today's hero card */}
      <FlexWidget style={{ width: 'match_parent', backgroundColor: hex(t.bg), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center' }}>
        <ImageWidget image={MARK} imageWidth={22} imageHeight={22} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 8 }}>
          <TextWidget text={m.head} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: '700', color: hex(t.fg) }} />
          {m.rise ? <TextWidget text={m.rise} maxLines={1} truncate="END" style={{ fontSize: 11, color: hex(c.fg2) }} /> : null}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', marginLeft: 6 }}>
          <TextWidget text={m.fuel} style={{ fontSize: 11, fontWeight: '700', color: hex(t.fg) }} />
          {m.asOf ? <TextWidget text={m.asOf} maxLines={1} style={{ fontSize: 10, color: hex(c.muted) }} /> : null}
        </FlexWidget>
      </FlexWidget>
      {fit.caption && m.caption ? (
        <TextWidget text={m.caption} maxLines={1} truncate="END" style={{ fontSize: 10, fontWeight: '600', color: hex(c.muted), marginTop: 6, marginLeft: 4 }} />
      ) : null}
      {rows.length ? (
        <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column', justifyContent: 'space-around', marginTop: 2 }}>
          {rows.map((r) => (
            <FlexWidget
              key={r.id}
              clickAction="OPEN_URI"
              clickActionData={{ uri: r.uri }}
              accessibilityLabel={r.a11y}
              style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 8 }}>
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget text={r.name} maxLines={1} truncate="END" style={{ fontSize: 13, color: hex(c.fg) }} />
              </FlexWidget>
              <TextWidget text={r.note} maxLines={1} style={{ fontSize: 11, fontWeight: '600', color: hex(noteColor(c, r.noteTone)), marginLeft: 8 }} />
              <TextWidget text={r.price} maxLines={1} style={{ fontSize: 14, fontWeight: '700', color: hex(c.fg), marginLeft: 8 }} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : (
        <FlexWidget style={{ width: 'match_parent', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TextWidget text={m.message ?? ''} maxLines={2} style={{ fontSize: 13, color: hex(c.fg2), textAlign: 'center' }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** Light and dark versions; the launcher picks one from the system theme. */
export function renderWidgetFor(name: string, info: Pick<WidgetInfo, 'height'>, m: WidgetModel): WidgetRepresentation {
  const draw = (c: Pal) => (name === SMALL ? <Small m={m} c={c} /> : <Medium m={m} c={c} height={info.height} />);
  return { light: draw(Colors.light), dark: draw(Colors.dark) };
}
