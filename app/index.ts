// App entry. Registers the Android widget's headless task handler (a no-op on web and iOS) before expo-router
// starts, so the widget can render while the app is closed.
import './src/widget/register';
import 'expo-router/entry';
