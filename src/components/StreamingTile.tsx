import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../theme/colors';
import * as Haptics from 'expo-haptics';

export type StreamApp = 'netflix' | 'youtube' | 'prime';

interface Props {
  app: StreamApp;
  onPress: () => void;
}

const BRAND: Record<
  StreamApp,
  { from: string; to: string; label: string; monogram: string }
> = {
  netflix: { from: colors.netflix, to: colors.netflixDark, label: 'NETFLIX', monogram: 'N' },
  youtube: { from: colors.youtube, to: colors.youtubeDark, label: 'YouTube', monogram: '▶' },
  prime: { from: colors.prime, to: colors.primeDark, label: 'Prime', monogram: '▶|' },
};

export function StreamingTile({ app, onPress }: Props) {
  const brand = BRAND[app];
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[brand.from, brand.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <Text style={styles.monogram}>{brand.monogram}</Text>
        <Text style={styles.label}>{brand.label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    aspectRatio: 1.4,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  monogram: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
