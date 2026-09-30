/** @type {import('expo/config').ExpoConfig} */
export default {
  expo: {
    name: 'ليالي كافيه',
    slug: 'layali-cafe-pos',
    owner: 'm7madi8',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    backgroundColor: '#f5efe3',
    primaryColor: '#1a3328',
    scheme: 'layalicafe',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#f5efe3',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.layali.cafepos',
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
        },
      },
    },
    android: {
      package: 'com.layali.cafepos',
      adaptiveIcon: {
        backgroundColor: '#1a3328',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      appUrl: process.env.EXPO_PUBLIC_APP_URL || 'https://layaly-pos.vercel.app',
      eas: {
        projectId:
          process.env.EAS_PROJECT_ID || '5428fba1-40bf-42e2-95e4-284215c6742d',
      },
    },
  },
};
