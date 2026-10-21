// iOS: the Bowser home-screen and lock-screen widget (WidgetKit via expo-widgets + @expo/ui SwiftUI). The app and the
// background task (./register.ios.ts) push its props through ./render.ios.ts; ./ios-model.ts builds them.
//
// The function marked 'widget' is compiled to a string and run in the widget extension's own JS runtime: it can't use
// imports (the SwiftUI components and modifiers are globals there), module-scope values, hooks or async work. Keep
// every constant and helper inside it. The palette mirrors constants/theme.ts.
'use no memo';

import {
  HStack, Link, Spacer, Text, VStack,
} from '@expo/ui/swift-ui';
import {
  background, clipShape, containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, monospacedDigit,
  padding, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { EMPTY_PROPS, type IosWidgetProps } from './ios-model';

/** Must match the `name` of the expo-widgets entry in app.json. */
export const IOS_WIDGET = 'BowserWidget';

const BowserWidget = (props: IosWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const dark = env.colorScheme === 'dark';
  const P = dark
    ? {
        bg: '#0f1113', surface: '#181b1e', line: '#2a2e33', fg: '#eef0f2', fg2: '#c2c7cc', muted: '#8b9197', chip: '#ffb22e', onChip: '#141618',
        cheap: '#3cc28f', dear: '#f08a5d', flat: '#a6abb0',
        act: { bg: '#2e2410', fg: '#ffcf7a', strong: '#ffb22e' },
        wait: { bg: '#122238', fg: '#9cc6f7', strong: '#3987e5' },
        calm: { bg: '#1d2124', fg: '#c2c7cc', strong: '#8b9197' },
      }
    : {
        bg: '#f6f6f3', surface: '#ffffff', line: '#e2e3df', fg: '#141618', fg2: '#45494d', muted: '#6f7479', chip: '#ffb22e', onChip: '#141618',
        cheap: '#14865c', dear: '#c4511f', flat: '#5e6266',
        act: { bg: '#fff3d6', fg: '#7a4a00', strong: '#f0a000' },
        wait: { bg: '#e4eefa', fg: '#1b5799', strong: '#2a78d6' },
        calm: { bg: '#eceeea', fg: '#3d4246', strong: '#8a9096' },
      };
  const T = P[props.tone] ?? P.calm;
  const noteColor = (t: string) =>
    t === 'cheap' ? P.cheap : t === 'dear' ? P.dear : t === 'act' ? (dark ? P.act.strong : P.act.fg) : t === 'wait' ? P.wait.strong : P.muted;
  const family = env.widgetFamily ?? 'systemSmall';
  const fill = frame({ maxWidth: 10000, alignment: 'leading' });

  // ---- lock screen (system-tinted, so no colours of our own)
  if (family === 'accessoryInline') {
    return <Text modifiers={[widgetURL(props.url), containerBackground('clear', 'widget')]}>{`${props.fuel} · ${props.head}`}</Text>;
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[fill, widgetURL(props.url), containerBackground('clear', 'widget')]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1), minimumScaleFactor(0.8)]}>{props.head}</Text>
        <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{props.riseShort ?? props.rise ?? ''}</Text>
        <Text modifiers={[font({ size: 13 }), monospacedDigit(), lineLimit(1), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
          {props.best ? `${props.best.price} · ${props.best.name}` : `${props.fuel} ${props.sydney ?? ''}`}
        </Text>
      </VStack>
    );
  }

  const chip = (
    <Text
      modifiers={[
        font({ size: 11, weight: 'heavy' }), foregroundStyle(P.onChip), padding({ horizontal: 7, vertical: 2 }),
        background(P.chip), clipShape('capsule'),
      ]}>
      {props.fuel}
    </Text>
  );

  // ---- small: the call, the rise, and your cheapest nearby station
  if (family === 'systemSmall') {
    const bottom = props.best ? `${props.best.price} · ${props.best.name}` : props.sydney;
    return (
      <VStack alignment="leading" spacing={3} modifiers={[fill, containerBackground(T.bg, 'widget'), widgetURL(props.best?.url ?? props.url)]}>
        <HStack>
          <Text modifiers={[font({ size: props.asOf ? 10 : 11, weight: 'bold' }), foregroundStyle(props.asOf ? P.muted : T.fg), lineLimit(1)]}>
            {props.asOf ?? 'BOWSER'}
          </Text>
          <Spacer />
          {chip}
        </HStack>
        <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle(P.fg), lineLimit(2), minimumScaleFactor(0.75)]}>{props.head}</Text>
        {props.rise ? (
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(T.fg), lineLimit(2), minimumScaleFactor(0.85)]}>{props.rise}</Text>
        ) : null}
        <Spacer />
        {bottom ? (
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), monospacedDigit(), foregroundStyle(P.fg2), lineLimit(1), minimumScaleFactor(0.8)]}>
            {bottom}
          </Text>
        ) : null}
      </VStack>
    );
  }

  // ---- medium and large: the call plus a station list (3 rows on medium, up to 6 on large)
  const large = family === 'systemLarge' || family === 'systemExtraLarge';
  const rows = props.rows.slice(0, large ? 6 : 3);
  return (
    <VStack alignment="leading" spacing={large ? 8 : 4} modifiers={[fill, containerBackground(P.surface, 'widget'), widgetURL(props.url)]}>
      <HStack alignment="top" spacing={8}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: large ? 20 : 16, weight: 'heavy' }), foregroundStyle(P.fg), lineLimit(1), minimumScaleFactor(0.75)]}>
            {props.head}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(T.fg), lineLimit(1), minimumScaleFactor(0.85)]}>
            {(large ? props.rise : (props.riseShort ?? props.rise)) ?? props.sydney ?? ''}
          </Text>
        </VStack>
        <Spacer />
        {chip}
      </HStack>
      {large && props.sydney ? (
        <Text modifiers={[font({ size: 12 }), monospacedDigit(), foregroundStyle(noteColor(props.sydneyTone))]}>{`Sydney ${props.sydney}`}</Text>
      ) : null}
      {(props.caption && rows.length) || props.asOf ? (
        <HStack>
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(P.muted), lineLimit(1)]}>{rows.length ? props.caption.toUpperCase() : ''}</Text>
          <Spacer />
          {props.asOf ? <Text modifiers={[font({ size: 10 }), foregroundStyle(P.muted)]}>{props.asOf}</Text> : null}
        </HStack>
      ) : null}
      {rows.length ? (
        <VStack alignment="leading" spacing={large ? 6 : 2}>
        {rows.map((r) => (
          <Link key={r.url} destination={r.url}>
            <HStack spacing={6} modifiers={[fill]}>
              <VStack alignment="leading" spacing={0}>
                <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(P.fg), lineLimit(1)]}>{r.name}</Text>
                {large ? (
                  <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(noteColor(r.adviceTone)), lineLimit(1)]}>{r.advice}</Text>
                ) : null}
              </VStack>
              <Spacer />
              {large ? (
                r.fc ? <Text modifiers={[font({ size: 11 }), monospacedDigit(), foregroundStyle(noteColor(r.fcTone))]}>{r.fc}</Text> : null
              ) : (
                <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(noteColor(r.adviceTone)), lineLimit(1)]}>{r.advice}</Text>
              )}
              <Text modifiers={[font({ size: 14, weight: 'bold' }), monospacedDigit(), foregroundStyle(P.fg)]}>{r.price}</Text>
            </HStack>
          </Link>
        ))}
        </VStack>
      ) : (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(P.muted), lineLimit(2)]}>{props.message ?? ''}</Text>
      )}
      <Spacer />
    </VStack>
  );
};

export default createWidget(IOS_WIDGET, BowserWidget, EMPTY_PROPS);
