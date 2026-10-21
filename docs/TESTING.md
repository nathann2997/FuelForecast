# Testing Sydney Fuel Outlook (Android)

## For testers

### Option A — install the APK (recommended)
1. Open the install link (or scan the QR code) you were sent, on your Android phone.
2. Tap **Install**. Android asks once to allow installs from your browser; allow it. If Play Protect warns about an unknown app, tap **Install anyway**.
3. Open **Sydney Fuel Outlook**. Allow location when you tap **Near me** on the Stations tab (it's only used on your phone).

The app updates itself: a new version downloads when you open the app and applies after you fully close it (swipe it away from recent apps) and reopen it, so it can take two launches.

### Option B — Expo Go (only during a live session)
For quick looks while the owner is running the app from their computer.
1. Install **Expo Go for SDK 58** from https://expo.dev/go (the Play Store copy can lag behind new SDKs).
2. When the owner sends a QR code, scan it with Expo Go. It works only while the owner's computer is running the session.

No Expo account is needed on Android.

### What to look at
- **Today**: does "Fill up today / this week / Wait" match what you see at the pump over the next few days?
- **Stations**: are the nearby stations and prices right? Does tapping one open directions?
- **History**: does the chart read well; can you drag along it?
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

Updates only reach APKs with the same runtime version (`app.json` `version`, currently 0.1.0). Keep `version` unchanged for JS-only changes; bump it only together with a new APK when native code changes, because existing APKs then stop receiving updates.
