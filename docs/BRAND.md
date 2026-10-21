# Bowser — brand sheet

## Name
- The app is **Bowser** (Aussie slang for a fuel pump). Always one word with a capital B and the rest lower case: never "BOWSER", "bowser" or "Bowser App".
- **No tagline or subtitle, anywhere.** That covers the launcher label, the splash, headers, store copy and the widget. Don't add "Sydney", "Fuel Outlook" or a descriptor after the name.
- Technical identifiers (package, slug, scheme, API path) keep their `fuelforecast` names. They are never shown to users. See `BOWSER_PLAN.md` §1.

## The mark
The mark is a heavy "B" that is also a petrol bowser. Its top counter is the pump's price window, and a hose and nozzle hang off the top bowl. Of the three concepts (`docs/brand/concepts.png`), it is the only one that carries the name and the object at the same time. The arch-top pump turned to mush at 24 px, and the drop with an arrow read as a generic "download" icon. The mark keeps two clear counters and a single hose line, so it still reads as a B at 24 px and as a pure silhouette in Android's single-colour themed icon.

The lockup is the mark followed by the word "Bowser", set in monoline geometric letters that are drawn as strokes, so no font file is needed. The word's cap height equals the mark's height.

## Colours
| Use | Hex | Token in `theme.ts` |
|---|---|---|
| Mark on dark / app icon | `#FFB22E` (Bowser amber) | `dark.actStrong`, `chip` |
| Mark on light | `#F0A000` (deep amber) | `light.actStrong` |
| Icon / splash / adaptive background | `#16191C` (charcoal) | none (keep as is) |
| Word on light | `#141618` | `light.fg` |
| Word on dark | `#EEF0F2` | `dark.fg` |
| Single colour | white on dark, `#000000` on light | none |

**Splash and adaptive-icon background: keep `#16191C`.** The amber mark was designed against it, so no change is needed in `app.json`.

## Clear space and minimum size
- **Clear space:** leave at least ¼ of the mark's height empty on every side of the mark or the lockup.
- **Minimum size:** the mark at 16 px (favicon), but prefer 24 px or more. Use the lockup only when the word is at least 14 px tall (`<BowserWordmark height={14} />`, about 75 px wide). Below that, use the mark on its own.
- The Android adaptive foreground and monochrome layers keep the mark inside the centre 66/108 safe circle.

## Do
- Use the amber mark on the charcoal or dark surfaces, and deep amber on light ones.
- Use a single flat colour for the mark on a busy or tinted background. Use white for the Android themed icon.
- Use `<BowserMark />` and `<BowserWordmark />` from `src/components/brand.tsx` in the app. They follow the light and dark theme.

## Don't
- Don't use the mark as the "B" of the word (no "[mark]owser").
- Don't add a tagline, outline, gradient, shadow or glow, and don't put the mark in a container other than the app-icon square.
- Don't recolour it with the tone colours (blue "wait", grey "calm"). Amber is the brand. The tones are for decisions.
- Don't stretch, rotate or rearrange the mark, or set "Bowser" in a typeface in place of the drawn word.

## Files
| File | What |
|---|---|
| `app/assets/brand/bowser-mark.svg` | Mark, amber `#FFB22E` (for dark surfaces), square 74-unit viewBox |
| `app/assets/brand/bowser-mark-light.svg` | Mark, deep amber `#F0A000` (for light surfaces) |
| `app/assets/brand/bowser-mark-mono.svg` | Mark, single colour black (recolour freely) |
| `app/assets/brand/bowser-wordmark.svg` | Lockup for light backgrounds |
| `app/assets/brand/bowser-wordmark-dark.svg` | Lockup for dark backgrounds |
| `app/assets/brand/widget-mark.png` | 96×96 transparent amber mark for the home-screen widget |
| `docs/brand/concepts.png` | Concept contact sheet (A, B chosen, C) |
| `app/assets/images/icon.png` | 1024 app icon, full-bleed charcoal (the OS applies the corner mask) |
| `app/assets/images/android-icon-foreground.png` | 512 adaptive foreground, amber mark on transparent, inside the safe zone |
| `app/assets/images/android-icon-background.png` | 512 solid `#16191C` |
| `app/assets/images/android-icon-monochrome.png` | 432 white mark on transparent (Android 13+ themed icon) |
| `app/assets/images/splash-icon.png` | 684×639 (3× the old 228×213) amber mark on transparent, shown on `#16191C` at `imageWidth` 110 |
| `app/assets/images/favicon.png` | 48 rounded charcoal square with the amber mark |
| `app/src/components/brand.tsx` | `<BowserMark size color? />`, `<BowserWordmark height color? />` |

The SVG path data in `brand.tsx` and in `assets/brand/*.svg` is the same. If you change one, change the other.
