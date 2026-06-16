import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

export interface RemoteButtonProps {
  label?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  /** Enables press-and-hold auto-repeat (used for volume + d-pad). */
  repeat?: boolean;
  /** Minimum ms between accepted presses (single-press debounce). */
  debounceMs?: number;
  bg?: string;
  textColor?: string;
  size?: number;
  width?: number;
  height?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
}

const REPEAT_INITIAL_DELAY = 380;
const REPEAT_INTERVAL = 110;

export function RemoteButton({
  label,
  icon,
  onPress,
  repeat = false,
  debounceMs = 80,
  bg = colors.surface,
  textColor = colors.text,
  size,
  width,
  height,
  round = false,
  style,
  accessibilityLabel,
  disabled,
}: RemoteButtonProps) {
  const lastPressAt = useRef(0);
  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const didRepeat = useRef(false);

  const trigger = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [onPress]);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    didRepeat.current = false;
    if (!repeat) return;
    holdTimeout.current = setTimeout(() => {
      didRepeat.current = true;
      trigger();
      repeatInterval.current = setInterval(trigger, REPEAT_INTERVAL);
    }, REPEAT_INITIAL_DELAY);
  }, [disabled, repeat, trigger]);

  const clearHold = useCallback(() => {
    if (holdTimeout.current) {
      clearTimeout(holdTimeout.current);
      holdTimeout.current = null;
    }
    if (repeatInterval.current) {
      clearInterval(repeatInterval.current);
      repeatInterval.current = null;
    }
  }, []);

  const handlePress = useCallback(() => {
    if (disabled) return;
    // If a hold sequence already fired events, suppress the trailing click.
    if (didRepeat.current) {
      didRepeat.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastPressAt.current < debounceMs) return;
    lastPressAt.current = now;
    trigger();
  }, [disabled, debounceMs, trigger]);

  const handlePressOut = useCallback(() => {
    clearHold();
  }, [clearHold]);

  const dynamicStyle: ViewStyle = {
    backgroundColor: bg,
    width: width ?? size,
    height: height ?? size,
    borderRadius: round ? (size ?? 64) / 2 : radius.md,
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={handlePress}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        dynamicStyle,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon}
        {label ? (
          <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.pressed,
    transform: [{ scale: 0.97 }],
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
