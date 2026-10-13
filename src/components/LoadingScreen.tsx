import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Animated, Image, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { FONTS } from '@/theme/colors';

/** Matches the background of splash-icon.png and the native splash in app.json. */
export const SPLASH_BLUE = '#48559C';

/**
 * Full-screen launch screen: blue, "Kaeru" in the middle, the frog peeking in from the bottom-left.
 * Covers the app while it loads, then fades out once `ready` is true.
 */
export function LoadingScreen({ ready }: { ready: boolean }) {
  const { width } = useWindowDimensions();
  const opacity = useState(() => new Animated.Value(1))[0];
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    Animated.timing(opacity, { toValue: 0, duration: 300, delay: 150, useNativeDriver: true }).start(() => setGone(true));
  }, [ready, opacity]);

  if (gone) return null;
  const frog = Math.min(width * 0.8, 420);
  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity }]}
      onLayout={() => SplashScreen.hide()}
    >
      <Image source={require('../../assets/splash-icon.png')} style={[styles.frog, { width: frog, height: frog }]} />
      <Text style={styles.title} accessibilityRole="header">
        Kaeru
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_BLUE, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  frog: { position: 'absolute', left: 0, bottom: 0 },
  title: { fontFamily: FONTS.black, fontSize: 56, color: '#FFFFFF', letterSpacing: 1 },
});
