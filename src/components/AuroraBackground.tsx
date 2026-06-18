import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

interface Props {
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Aurora gradient backdrop — three soft radial-ish blobs of color
 * over the dark background. Use as the outermost wrapper of a screen.
 */
export function AuroraBackground({ children, style }: Props) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.accent}55`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={[styles.blob, styles.topLeft]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.accentPurple}50`, 'transparent']}
        start={{ x: 1, y: 1 }}
        end={{ x: 0.4, y: 0.4 }}
        style={[styles.blob, styles.bottomRight]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.accentPink}30`, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[styles.blob, styles.topRight]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  blob: {
    position: 'absolute',
  },
  topLeft: {
    top: -100,
    left: -100,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  bottomRight: {
    bottom: -150,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  topRight: {
    top: 80,
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
});
