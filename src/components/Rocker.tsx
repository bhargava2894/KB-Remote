import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { RemoteButton } from './RemoteButton';

interface RockerProps {
  label: string;
  iconUp?: keyof typeof Ionicons.glyphMap;
  iconDown?: keyof typeof Ionicons.glyphMap;
  onUp: () => void;
  onDown: () => void;
}

export function Rocker({
  label,
  iconUp = 'add',
  iconDown = 'remove',
  onUp,
  onDown,
}: RockerProps) {
  return (
    <View style={styles.wrap}>
      <RemoteButton
        accessibilityLabel={`${label} up`}
        icon={<Ionicons name={iconUp} size={26} color={colors.text} />}
        onPress={onUp}
        repeat
        style={styles.top}
        width={72}
        height={64}
      />
      <Text style={styles.label}>{label}</Text>
      <RemoteButton
        accessibilityLabel={`${label} down`}
        icon={<Ionicons name={iconDown} size={26} color={colors.text} />}
        onPress={onDown}
        repeat
        style={styles.bottom}
        width={72}
        height={64}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  top: {
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  bottom: {
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingVertical: 4,
  },
});
