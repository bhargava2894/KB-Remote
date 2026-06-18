import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RemoteButton, type RemoteButtonProps } from './RemoteButton';
import { colors, radius } from '../theme/colors';

export type GlassVariant = 'default' | 'accent' | 'power' | 'danger';

type Props = Omit<RemoteButtonProps, 'bg' | 'textColor'> & {
  variant?: GlassVariant;
  borderless?: boolean;
};

/**
 * GlassButton — frosted-glass surface with optional variants. Behaviour
 * (press, haptics, hold-repeat, debounce) comes from RemoteButton.
 */
export function GlassButton({ variant = 'default', borderless, style, ...rest }: Props) {
  const textColor =
    variant === 'accent'
      ? '#FFFFFF'
      : variant === 'power'
      ? colors.power
      : variant === 'danger'
      ? '#FF6B6B'
      : colors.text;

  if (variant === 'accent') {
    return (
      <View style={[styles.accentWrap, style]}>
        <LinearGradient
          colors={[colors.accent, colors.accentPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <RemoteButton {...rest} bg="transparent" textColor={textColor} style={styles.transparent} />
      </View>
    );
  }

  return (
    <RemoteButton
      {...rest}
      bg={colors.glassFill}
      textColor={textColor}
      style={[styles.glass, borderless && styles.borderless, style]}
    />
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  borderless: {
    borderWidth: 0,
  },
  accentWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  transparent: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
