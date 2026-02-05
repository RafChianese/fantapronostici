import type { CapacitorConfig } from '@capacitor/cli';

// NOTE:
// - This config enables building the web app as a native mobile app via Capacitor.
// - Rewarded ads are implemented via @capacitor-community/admob in src/lib/nativeAds.ts
// - You must set your real bundle id (appId) before publishing.

const config: CapacitorConfig = {
  appId: 'com.example.totomondiale',
  appName: 'TotoMondiale',
  webDir: 'dist',
  bundledWebRuntime: false,
};

export default config;
