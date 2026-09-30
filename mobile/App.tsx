// @ts-nocheck — WebView typings lag behind RN 0.86 / React 19
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

const APP_URL =
  (Constants.expoConfig?.extra?.appUrl as string | undefined) ||
  process.env.EXPO_PUBLIC_APP_URL ||
  'https://layaly-pos.vercel.app';

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ExpoStatusBar style="dark" />
        {Platform.OS === 'android' && (
          <StatusBar barStyle="dark-content" backgroundColor="#f5efe3" />
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>تعذّر فتح النظام</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <Text style={styles.errorHint}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <WebView
              ref={webRef}
              source={{ uri: APP_URL }}
              style={styles.webview}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError('تحقق من الإنترنت أو عنوان الموقع في EXPO_PUBLIC_APP_URL');
              }}
              onHttpError={() => {
                setLoading(false);
                setError('الخادم لا يستجيب. تأكد من نشر الموقع على Vercel.');
              }}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              cacheEnabled
              pullToRefreshEnabled={Platform.OS === 'android'}
              allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
              setSupportMultipleWindows={false}
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={['https://*', 'http://*']}
              userAgent={
                Platform.OS === 'android'
                  ? 'LayaliCafeApp/1.0 (Android) AppleWebKit/537.36 Chrome/ Mobile'
                  : undefined
              }
            />
            {loading && (
              <View style={styles.loader} pointerEvents="none">
                <ActivityIndicator size="large" color="#1a3328" />
                <Text style={styles.loaderText}>جاري تحميل ليالي كافيه…</Text>
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f5efe3',
  },
  webview: {
    flex: 1,
    backgroundColor: '#f5efe3',
  },
  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5efe3',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#1a3328',
  },
  errorBox: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a3328',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#5a6b62',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorHint: {
    fontSize: 16,
    color: '#c17f59',
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
