// App entry. Registers the Android widget's headless task handler, or on iOS the background refresh task (a no-op on
// web), before expo-router starts, so the widget can update while the app is closed.
import './src/widget/register';
import 'expo-router/entry';
