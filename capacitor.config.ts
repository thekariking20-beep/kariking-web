import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.kariking.app',
  appName: 'Kari King',
  webDir: 'dist',
  server: {
    // Use the hostname that Firebase Auth recognizes
    androidScheme: 'https',
    hostname: 'kariking.firebaseapp.com',
    allowNavigation: ['*.firebaseapp.com', '*.googleapis.com', '*.google.com', '*.gstatic.com'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
