# Testing Bowser (Android)

## For testers

### Option A — install the APK (recommended)
1. Open the install link (or scan the QR code) you were sent, on your Android phone.
2. Tap **Install**. Android asks once to allow installs from your browser; allow it. If Play Protect warns about an unknown app, tap **Install anyway**.
3. Open **Bowser** (previously "Sydney Fuel Outlook"). If you had the old app, install the new link once: version 0.3.0 can't arrive as an automatic update, and it installs over the old app keeping your settings. On Today or Stations, tap **Use my location** (or type a suburb) to set your area once; it's remembered and only used on your phone.

The app updates itself: a new version downloads when you open the app and applies after you fully close it (swipe it away from recent apps) and reopen it, so it can take two launches.

### Option B — Expo Go (only during a live session)
For quick looks while the owner is running the app from their computer.
1. Install **Expo Go for SDK 58** from https://expo.dev/go (the Play Store copy can lag behind new SDKs).
2. When the owner sends a QR code, scan it with Expo Go. It works only while the owner's computer is running the session.

No Expo account is needed on Android.

### What to look at
- **Today**: does "Fill up today / this week / Wait" and the "likely to rise from" date match what you see at the pump over the next few days? Is the dollar saving believable for your tank (set the size under **More**)?
- **Stations**: are the nearby stations and prices right? The arrow button on each row should open Google Maps directions straight away. Try **Filters** (brand, when to fill, max price) and the pin button; pinned stations stay at the top and on Today.
- **Station page**: tap a station. Does the price chart (1W to 1Y, drag along it) and the station's own forecast make sense? Does the page scroll normally when you swipe up from the chart?
- **Widget**: long-press your home screen → Widgets → **Bowser**. Add the small and the wide one. Tap the fuel chip (e.g. **U91 ▾**) to switch fuel on that widget. On the wide one, scroll the station list and tap **Pinned · Nearest · Cheapest**: does the list switch, and does each widget remember its own choice? Does tapping a station open its page? Tell us if any tap does nothing. Does it update the next morning?
- **Widget location (0.4.0)**: in **More → Widget location**, tap **Allow all the time** (Android will open Settings; choose *Allow all the time*). Your area must be *Use my location*. Then drive somewhere and tap **⟳** on the wide widget: do Nearest/Cheapest switch to stations around you?
- **Trends**: does the chart read well; can you drag along it?
- **More**: change fuel, tank size and area; do the other tabs follow?
- Anything confusing, slow or broken: send a screenshot and what you tapped.

Prices refresh every morning around 6:30am.

## For the owner

| Task | Command (from `app/`) |
|---|---|
| Ship a JS/UI change to everyone with the APK | `npx eas-cli@latest update --channel preview --environment preview --platform android --message "what changed"` |
| New APK (only after adding a native module or changing native config in `app.json`) | `npx eas-cli@latest build -p android --profile preview` |
| Find the latest install link | https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds |
| Live session for Expo Go testers (Option B) | `npx expo start --tunnel` and share the QR code |
| Run on your own phone on the same Wi-Fi | `npx expo start` and scan with Expo Go |

Updates only reach APKs with the same runtime version (`app.json` `version`, currently 0.4.0). Keep `version` unchanged for JS-only changes; bump it only together with a new APK when native code changes, because existing APKs then stop receiving updates.
