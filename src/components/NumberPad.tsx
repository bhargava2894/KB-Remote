import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { RemoteButton } from './RemoteButton';
import type { ButtonName } from '../api/keycodes';

interface NumberPadProps {
  onDigit: (key: ButtonName) => void;
}

const ROWS: Array<Array<{ label: string; key: ButtonName }>> = [
  [
    { label: '1', key: 'Num1' },
    { label: '2', key: 'Num2' },
    { label: '3', key: 'Num3' },
  ],
  [
    { label: '4', key: 'Num4' },
    { label: '5', key: 'Num5' },
    { label: '6', key: 'Num6' },
  ],
  [
    { label: '7', key: 'Num7' },
    { label: '8', key: 'Num8' },
    { label: '9', key: 'Num9' },
  ],
  [{ label: '0', key: 'Num0' }],
];

export function NumberPad({ onDigit }: NumberPadProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide number pad' : 'Show number pad'}
      >
        <Ionicons name="keypad" size={18} color={colors.textMuted} />
        <Text style={styles.headerText}>Number pad</Text>
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
      {open && (
        <View style={styles.grid}>
          {ROWS.map((row, idx) => (
            <View key={idx} style={styles.row}>
              {row.map((d) => (
                <RemoteButton
                  key={d.key}
                  label={d.label}
                  onPress={() => onDigit(d.key)}
                  width={64}
                  height={56}
                  style={styles.digit}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerPressed: {
    backgroundColor: colors.pressed,
  },
  headerText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  grid: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  digit: {
    marginHorizontal: 2,
  },
});
