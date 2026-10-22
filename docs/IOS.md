# Bowser on iOS

How the iOS build is put together and how to get it onto iPhones. Status lives in `docs/HANDOFF.md`.

## What's different on iOS

| Area | Android | iOS |
|---|---|---|
| Home-screen widget | `react-native-android-widget`, headless JS task redraws it (`register.android.ts`, `render.android.ts`) | `expo-widgets` (WidgetKit + `@expo/ui` SwiftUI): one widget, `BowserWidget`, in small, medium and large sizes plus lock-screen rectangular and inline (`ios-widget.tsx`) |
| Widget data | The widget task fetches the API itself | The app pushes a timeline (`render.ios.ts`) when data, pins, fuel or area change. A background task (`register.ios.ts`, `expo-background-task`, at most every 4 h, when iOS chooses) fetches and pushes while Bowser is closed |
| Midnight rollover | Periodic redraw | Timeline entries at the next 7 Sydney midnights (`ios-model.ts`), so "rise from tomorrow" and "as of" stay right |
| Widget taps | Pinned/Nearest/Cheapest, fuel chip, ⟳ | Rows open the station, the rest opens Today. No buttons and no per-widget fuel yet |
| Widget location | Optional "Allow all the time" | Not used: the widget lists stations near the saved area (or the last GPS fix the app saved) |
| Map button | `geo:` pin in the maps app | Apple Maps pin (`maps://?ll=…&q=name`, `lib/directions.ts`); shows the station, doesn't start a trip |
| Short messages | Toast | Alert |

The pure model (`widget/logic.ts` `buildModel`) is shared by both platforms. The iOS-only native modules (`expo-widgets`, `@expo/ui`, `expo-background-task`, `expo-task-manager`, `unimodules-app-loader`) are excluded from Android autolinking in `app/package.json`, so the APK is unchanged. Only `.ios.ts` files and `ios-widget.tsx` import them.

## Builds

| Profile | Command (from `app/`) | Needs |
|---|---|---|
| `simulator` | `npx eas-cli build -p ios --profile simulator` | Nothing from Apple. Runs in the iOS Simulator (Xcode needed to run it) |
| `preview` | `npx eas-cli build -p ios --profile preview` | Apple Developer Program ($149 AUD/yr). Ad hoc: each tester's iPhone must be registered first with `npx eas-cli device:create` (they open a link on the phone), then rebuild |
| `production` | `npx eas-cli build -p ios --profile production --auto-submit` | Apple Developer Program. Uploads to TestFlight, and testers install the TestFlight app. Up to 100 internal or 10,000 external testers, with no device registration |

On the first device build, EAS asks to log in to the Apple account and creates everything: two bundle IDs (`com.nathann2997.fuelforecast` and `com.nathann2997.fuelforecast.ExpoWidgetsTarget`), the app group `group.com.nathann2997.fuelforecast`, certificates and profiles. Run it interactively once (`eas build` without `--non-interactive`).

**Recommended for the owner plus a few friends: TestFlight** (production profile). There are no UDIDs to collect, testers update in one tap, and OTA updates (`eas update --channel production`) reach it like the APK's `preview` channel. TestFlight builds expire after 90 days, so rebuild at least once a quarter.

OTA: iOS and Android share runtime `0.6.0` (`runtimeVersion.policy: appVersion`). A JS-only `eas update` reaches both platforms on the same channel.

## Device checks (first iPhone install)
- Today, Stations, More, station page, Trends: layout under the notch and Dynamic Island, and the bottom padding above the tab bar (`ui.tsx` adds `insets.bottom + 50` on iOS).
- Keyboard on Today's suburb search (KeyboardAvoidingView `padding`).
- Swipe rows, chart scrubbing, pull to refresh.
- Map opens Apple Maps on the station's pin, without starting navigation. A rise alert notification arrives and shows while the app is open.
- Widget: add the small, medium, large and lock-screen versions. Check that rows open the station and the rest opens Today, the light and dark colours, the "Open Bowser" placeholder before first launch, and that it updates after changing fuel or pins.
- Background refresh: leave Bowser closed overnight with Background App Refresh on, and check that the widget shows today's data in the morning.
