import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { RemoteButton } from './RemoteButton';

interface DPadProps {
  onUp: () => void;
  onDown: () => void;
  onLeft: () => void;
  onRight: () => void;
  onOk: () => void;
}

const ARM = 78;
const CENTER = 88;

export function DPad({ onUp, onDown, onLeft, onRight, onOk }: DPadProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.spacer} />
        <RemoteButton
          accessibilityLabel="Up"
          icon={<Ionicons name="chevron-up" size={28} color={colors.text} />}
          onPress={onUp}
          repeat
          width={ARM}
          height={ARM}
          style={styles.arm}
        />
        <View style={styles.spacer} />
      </View>
      <View style={styles.row}>
        <RemoteButton
          accessibilityLabel="Left"
          icon={<Ionicons name="chevron-back" size={28} color={colors.text} />}
          onPress={onLeft}
          repeat
          width={ARM}
          height={ARM}
          style={styles.arm}
        />
        <RemoteButton
          label="OK"
          onPress={onOk}
          size={CENTER}
          round
          bg={colors.accent}
          style={styles.center}
        />
        <RemoteButton
          accessibilityLabel="Right"
          icon={<Ionicons name="chevron-forward" size={28} color={colors.text} />}
          onPress={onRight}
          repeat
          width={ARM}
          height={ARM}
          style={styles.arm}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.spacer} />
        <RemoteButton
          accessibilityLabel="Down"
          icon={<Ionicons name="chevron-down" size={28} color={colors.text} />}
          onPress={onDown}
          repeat
          width={ARM}
          height={ARM}
          style={styles.arm}
        />
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arm: {
    margin: 4,
  },
  center: {
    margin: 4,
    borderColor: colors.accent,
  },
  spacer: {
    width: ARM + 8,
    height: ARM,
  },
});
