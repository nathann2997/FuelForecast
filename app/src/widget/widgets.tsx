// The library builds widgets by calling these components as plain functions, outside React. The React Compiler
// (app.json experiments.reactCompiler) would insert a memo-cache hook into them, which throws "Invalid hook call"
// there and leaves the widget blank, so it must stay off for this file.
'use no memo';

// The two home-screen widgets, drawn with react-native-android-widget's primitives (Android only; never import this
// from code that runs on web or iOS). Layout follows the app's hero card and station rows; colours come from theme.ts.
import { FlexWidget, ImageWidget, ListWidget, TextWidget, type ColorProp, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import type { Tone } from '@/lib/outlook';

import { FUEL_ACTION, MODE_ACTION, STATION_MODES, TODAY_URI, fuelLabel, mediumLayout, type NoteTone, type WidgetModel, type WidgetRow } from './logic';

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

/** The fuel this widget shows, as a chip: a tap cycles U91 -> E10 -> P98 -> Diesel for this widget only (FUEL click
 *  action with the next fuel; register.android.ts saves it). Fixed font size so large system text can't overflow it. */
function FuelChip({ m, c, fg, height }: { m: WidgetModel; c: Pal; fg: string; height: number }) {
  return (
    <FlexWidget
      clickAction={FUEL_ACTION}
      clickActionData={{ fuel: m.nextFuel }}
      accessibilityLabel={`Fuel: ${m.fuel}. Tap to show ${fuelLabel(m.nextFuel)}`}
      style={{ height, paddingHorizontal: 10, borderRadius: height / 2, backgroundColor: hex(c.surface), borderWidth: 1, borderColor: hex(c.line), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={`${m.fuel} ▾`} maxLines={1} allowFontScaling={false} style={{ fontSize: 12, fontWeight: '700', color: hex(fg) }} />
    </FlexWidget>
  );
}

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
        <FuelChip m={m} c={c} fg={t.fg} height={30} />
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

/** Pinned · Nearest · Cheapest. Each tab fills a third of the width and the row's full height, so the tap target is
 *  as large as the widget allows; a tap sends the MODE click action to the task handler (register.android.ts). */
function ModeRow({ m, c, height }: { m: WidgetModel; c: Pal; height: number }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height, marginTop: 4, backgroundColor: hex(c.sunk), borderRadius: 10, padding: 2, flexDirection: 'row', alignItems: 'center' }}>
      {STATION_MODES.map(([mode, label]) => {
        const on = m.stationMode === mode;
        return (
          <FlexWidget
            key={mode}
            clickAction={MODE_ACTION}
            clickActionData={{ mode }}
            accessibilityLabel={`${label} stations${on ? ', selected' : ''}`}
            style={{ flex: 1, height: 'match_parent', borderRadius: 8, backgroundColor: hex(on ? c.chip : c.sunk), justifyContent: 'center', alignItems: 'center' }}>
            <TextWidget text={label} maxLines={1} allowFontScaling={false} style={{ fontSize: 11, fontWeight: on ? '700' : '500', color: hex(on ? c.onChip : c.muted) }} />
          </FlexWidget>
        );
      })}
    </FlexWidget>
  );
}

/** One station: name, note (gap, distance or age) and price; the whole row opens the station page. */
function StationLine({ r, c }: { r: WidgetRow; c: Pal }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: r.uri }}
      accessibilityLabel={r.a11y}
      style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 }}>
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget text={r.name} maxLines={1} truncate="END" allowFontScaling={false} style={{ fontSize: 13, color: hex(c.fg) }} />
      </FlexWidget>
      <TextWidget text={r.note} maxLines={1} allowFontScaling={false} style={{ fontSize: 11, fontWeight: '600', color: hex(noteColor(c, r.noteTone)), marginLeft: 8 }} />
      <TextWidget text={r.price} maxLines={1} allowFontScaling={false} style={{ fontSize: 14, fontWeight: '700', color: hex(c.fg), marginLeft: 8 }} />
    </FlexWidget>
  );
}

function Medium({ m, c, height }: { m: WidgetModel; c: Pal; height: number }) {
  const t = toneColors(c, m.tone);
  const fit = mediumLayout(height, m.rows.length);
  return (
    <FlexWidget
      {...open}
      accessibilityLabel={`Bowser. ${m.fuel}: ${m.head}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: hex(c.surface), borderRadius: 22, padding: 10, flexDirection: 'column' }}>
      {/* the verdict, tinted like Today's hero card; one line when the widget is short */}
      <FlexWidget style={{ width: 'match_parent', backgroundColor: hex(t.bg), borderRadius: 14, paddingHorizontal: 10, paddingVertical: fit.compact ? 4 : 7, flexDirection: 'row', alignItems: 'center' }}>
        <ImageWidget image={MARK} imageWidth={fit.compact ? 18 : 22} imageHeight={fit.compact ? 18 : 22} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 8 }}>
          {fit.compact && m.asOf ? (
            // compact: no room for a second line on the right, so "as of" joins the headline
            <TextWidget text={`${m.head} · ${m.asOf}`} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: 14, fontWeight: '700', color: hex(t.fg) }} />
          ) : (
            <TextWidget text={m.head} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: fit.compact ? 14 : 15, fontWeight: '700', color: hex(t.fg) }} />
          )}
          {m.rise && !fit.compact ? <TextWidget text={m.rise} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: 11, color: hex(c.fg2) }} /> : null}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', marginLeft: 6 }}>
          <FuelChip m={m} c={c} fg={t.fg} height={fit.compact ? 22 : 26} />
          {m.asOf && !fit.compact ? <TextWidget text={m.asOf} maxLines={1} allowFontScaling={false} style={{ fontSize: 10, color: hex(c.muted) }} /> : null}
        </FlexWidget>
      </FlexWidget>
      <ModeRow m={m} c={c} height={fit.compact ? 22 : 28} />
      {fit.caption && m.caption ? (
        <TextWidget text={m.caption} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: 10, fontWeight: '600', color: hex(c.muted), marginTop: 4, marginLeft: 4 }} />
      ) : null}
      {m.rows.length && fit.listH != null ? (
        // A scrollable list with an explicit height (never 0 or undefined: a 0-height ListWidget throws natively and
        // blanks the widget), only as tall as its rows. Each item's own clickAction becomes a fill-in intent on the
        // list's single PendingIntent template, so items carry no nested clickables.
        <ListWidget style={{ height: fit.listH, width: 'match_parent', marginTop: 2 }}>
          {m.rows.map((r) => (
            <StationLine key={r.id} r={r} c={c} />
          ))}
        </ListWidget>
      ) : m.rows.length ? (
        // Too short for a list (landscape, a tiny launcher cell): the first station as a plain tappable row
        <StationLine r={m.rows[0]} c={c} />
      ) : (
        <FlexWidget style={{ width: 'match_parent', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TextWidget text={m.message ?? ''} maxLines={2} style={{ fontSize: 12, color: hex(c.fg2), textAlign: 'center' }} />
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
