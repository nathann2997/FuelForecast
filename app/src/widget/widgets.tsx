// The library builds widgets by calling these components as plain functions, outside React. The React Compiler
// (app.json experiments.reactCompiler) would insert a memo-cache hook into them, which throws "Invalid hook call"
// there and leaves the widget blank, so it must stay off for this file.
'use no memo';

// The two home-screen widgets, drawn with react-native-android-widget's primitives (Android only; never import this
// from code that runs on web or iOS). Layout follows the app's hero card and station rows; colours come from theme.ts.
import { FlexWidget, ImageWidget, ListWidget, TextWidget, type ColorProp, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import type { Tone } from '@/lib/outlook';

import {
  FUEL_ACTION, MED, MODE_ACTION, ROW, SMALL_STYLE, STATION_MODES, TODAY_URI, compactHeadline, fuelLabel, mediumForecastLine, mediumLayout,
  compactRowWidths, smallCompact, smallForecastLine, smallRiseLine, type NoteTone, type WidgetModel, type WidgetRow,
} from './logic';

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

function Small({ m, c, width, height }: { m: WidgetModel; c: Pal; width: number; height: number }) {
  const t = toneColors(c, m.tone);
  const compact = smallCompact(width, height);
  const s = compact ? SMALL_STYLE.compact : SMALL_STYLE.regular;
  const fcLine = smallForecastLine(m, width, compact);
  const rise = smallRiseLine(m, width, compact);
  return (
    <FlexWidget
      {...open}
      accessibilityLabel={`Bowser. ${m.fuel}: ${m.head}. ${m.rise ?? ''} ${m.sydney?.long ?? ''}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: hex(t.bg), borderRadius: 22, padding: s.pad, flexDirection: 'column' }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <ImageWidget image={MARK} imageWidth={s.mark} imageHeight={s.mark} />
        <FlexWidget style={{ flex: 1 }} />
        <FuelChip m={m} c={c} fg={t.fg} height={s.chip} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={m.head} maxLines={2} truncate="END" allowFontScaling={false} style={{ fontSize: s.head, fontWeight: '700', color: hex(t.fg) }} />
      {rise ? (
        <TextWidget text={rise} maxLines={1} truncate="END" allowFontScaling={false} style={{ fontSize: s.sub, color: hex(c.fg2), marginTop: s.gap }} />
      ) : null}
      {fcLine ? (
        <TextWidget text={fcLine} maxLines={1} truncate="END" allowFontScaling={false} style={{ fontSize: s.sub, fontWeight: '600', color: hex(m.sydney ? noteColor(c, m.sydney.tone) : c.muted), marginTop: compact ? 0 : 2 }} />
      ) : null}
    </FlexWidget>
  );
}

/** Pinned · Nearest · Cheapest. Each tab fills a third of the width and the row's full height, so the tap target is
 *  as large as the widget allows; a tap sends the MODE click action to the task handler (register.android.ts). */
function ModeRow({ m, c, height }: { m: WidgetModel; c: Pal; height: number }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height, marginTop: MED.modeGap, backgroundColor: hex(c.sunk), borderRadius: 10, padding: 2, flexDirection: 'row', alignItems: 'center' }}>
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

/** One station, the whole row opening the station page (its only clickable: list items can't nest clicks).
 *  Two lines: name / advice (+ distance in Nearest) on the left, price / 7-day forecast (or the mode's note) on the
 *  right. One line in the compact layout: name, advice (capped so the name keeps room), price. */
function StationLine({ r, c, compact, width }: { r: WidgetRow; c: Pal; compact: boolean; width: number }) {
  const sub = { fontSize: ROW.sub, fontWeight: '600' as const };
  const price = <TextWidget text={r.price} maxLines={1} allowFontScaling={false} style={{ fontSize: ROW.price, fontWeight: '700', color: hex(c.fg) }} />;
  const name = <TextWidget text={r.name} maxLines={1} truncate="END" allowFontScaling={false} style={{ fontSize: ROW.name, color: hex(c.fg) }} />;
  const row = { width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: ROW.padV } as const;
  if (compact) {
    const { adviceW } = compactRowWidths(width, r.advice);
    return (
      <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: r.uri }} accessibilityLabel={r.a11y} style={row}>
        <FlexWidget style={{ flex: 1 }}>{name}</FlexWidget>
        <FlexWidget style={{ width: adviceW, marginLeft: 8, alignItems: 'flex-end' }}>
          <TextWidget text={r.advice} maxLines={1} truncate="END" allowFontScaling={false} style={{ ...sub, color: hex(noteColor(c, r.adviceTone)) }} />
        </FlexWidget>
        <FlexWidget style={{ marginLeft: 8 }}>{price}</FlexWidget>
      </FlexWidget>
    );
  }
  const right2 = r.fc
    ? <TextWidget text={r.fc} maxLines={1} allowFontScaling={false} style={{ ...sub, color: hex(noteColor(c, r.fcTone)) }} />
    : r.note
      ? <TextWidget text={r.note} maxLines={1} allowFontScaling={false} style={{ ...sub, color: hex(noteColor(c, r.noteTone)) }} />
      : null;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: r.uri }} accessibilityLabel={r.a11y} style={row}>
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        {name}
        <TextWidget text={r.dist ? `${r.advice} · ${r.dist}` : r.advice} maxLines={1} truncate="END" allowFontScaling={false} style={{ ...sub, color: hex(noteColor(c, r.adviceTone)) }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', marginLeft: 8 }}>
        {price}
        {right2}
      </FlexWidget>
    </FlexWidget>
  );
}

function Medium({ m, c, width, height }: { m: WidgetModel; c: Pal; width: number; height: number }) {
  const t = toneColors(c, m.tone);
  const fit = mediumLayout(height, m.rows.length);
  const fcLine = fit.compact ? null : mediumForecastLine(m, width);
  return (
    <FlexWidget
      {...open}
      accessibilityLabel={`Bowser. ${m.fuel}: ${m.head}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: hex(c.surface), borderRadius: 22, padding: MED.pad, flexDirection: 'column' }}>
      {/* the verdict, tinted like Today's hero card; one line when the widget is short */}
      <FlexWidget style={{ width: 'match_parent', backgroundColor: hex(t.bg), borderRadius: 14, paddingHorizontal: MED.padH, paddingVertical: fit.compact ? MED.padVCompact : MED.padV, flexDirection: 'row', alignItems: 'center' }}>
        <ImageWidget image={MARK} imageWidth={fit.compact ? MED.markCompact : MED.mark} imageHeight={fit.compact ? MED.markCompact : MED.mark} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 8 }}>
          {fit.compact ? (
            // compact: one line — the verdict, then "as of", then the Sydney forecast, each only if it fits
            <TextWidget text={compactHeadline(m, width)} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: MED.headCompact, fontWeight: '700', color: hex(t.fg) }} />
          ) : (
            <TextWidget text={m.head} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: MED.head, fontWeight: '700', color: hex(t.fg) }} />
          )}
          {m.rise && !fit.compact ? <TextWidget text={m.rise} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: MED.sub, color: hex(c.fg2) }} /> : null}
          {fcLine ? (
            <TextWidget text={fcLine} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: MED.sub, fontWeight: '600', color: hex(noteColor(c, m.sydney!.tone)) }} />
          ) : null}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', marginLeft: 6 }}>
          <FuelChip m={m} c={c} fg={t.fg} height={fit.compact ? MED.chipCompact : MED.chip} />
          {m.asOf && !fit.compact ? <TextWidget text={m.asOf} maxLines={1} allowFontScaling={false} style={{ fontSize: MED.asOf, color: hex(c.muted) }} /> : null}
        </FlexWidget>
      </FlexWidget>
      <ModeRow m={m} c={c} height={fit.compact ? MED.modesCompact : MED.modes} />
      {fit.caption && m.caption ? (
        <TextWidget text={m.caption} maxLines={1} allowFontScaling={false} truncate="END" style={{ fontSize: MED.caption, fontWeight: '600', color: hex(c.muted), marginTop: MED.captionGap, marginLeft: 4 }} />
      ) : null}
      {m.rows.length && fit.listH != null ? (
        // A scrollable list with an explicit height (never 0 or undefined: a 0-height ListWidget throws natively and
        // blanks the widget), only as tall as its rows. Each item's own clickAction becomes a fill-in intent on the
        // list's single PendingIntent template, so items carry no nested clickables.
        <ListWidget style={{ height: fit.listH, width: 'match_parent', marginTop: MED.listGap }}>
          {m.rows.map((r) => (
            <StationLine key={r.id} r={r} c={c} compact={fit.compact} width={width} />
          ))}
        </ListWidget>
      ) : m.rows.length ? (
        // Too short for a list (landscape, a tiny launcher cell): the first station as a plain tappable row
        <StationLine r={m.rows[0]} c={c} compact={fit.compact} width={width} />
      ) : (
        <FlexWidget style={{ width: 'match_parent', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TextWidget text={m.message ?? ''} maxLines={2} style={{ fontSize: 12, color: hex(c.fg2), textAlign: 'center' }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** Light and dark versions; the launcher picks one from the system theme. */
export function renderWidgetFor(name: string, info: Pick<WidgetInfo, 'height' | 'width'>, m: WidgetModel): WidgetRepresentation {
  // An unknown (0) width falls back to the size's minimum, so text fitting stays conservative
  const width = info.width > 0 ? info.width : name === SMALL ? 110 : 250;
  const draw = (c: Pal) =>
    name === SMALL ? <Small m={m} c={c} width={width} height={info.height} /> : <Medium m={m} c={c} width={width} height={info.height} />;
  return { light: draw(Colors.light), dark: draw(Colors.dark) };
}
