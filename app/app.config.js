// app.json plus the Google Maps key for the Stations map (Android; iOS uses Apple Maps, no key). The key comes from the
// EAS environment variable GOOGLE_MAPS_ANDROID_API_KEY (never committed), restricted in Google Cloud to this package and
// the EAS signing SHA-1. It goes in android.config, which Expo strips from the public config, so OTA manifests don't
// carry it (the APK's manifest still does, as every Maps app's must). An Android EAS build without it fails here rather
// than shipping a blank grey map.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!key && process.env.EAS_BUILD && process.env.EAS_BUILD_PLATFORM === 'android') {
    throw new Error('GOOGLE_MAPS_ANDROID_API_KEY is not set for this EAS environment (see CHANGELOG 0.8.0).');
  }
  return {
    ...config,
    android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: key } } },
  };
};
