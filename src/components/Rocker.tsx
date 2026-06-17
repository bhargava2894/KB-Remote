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
    backgroundColor: colors.glassFill,
    borderRadius: 22,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  top: {
    backgroundColor: colors.glassFill,
    borderRadius: 16,
    borderWidth: 0,
  },
  bottom: {
    backgroundColor: colors.glassFill,
    borderRadius: 16,
    borderWidth: 0,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingVertical: 4,
  },
});
