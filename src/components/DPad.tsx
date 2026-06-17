import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
          bg={colors.glassFill}
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
          bg={colors.glassFill}
          style={styles.arm}
        />
        <View style={styles.okWrap}>
          <LinearGradient
            colors={[colors.accent, colors.accentPurple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onOk();
            }}
            style={({ pressed }) => [styles.okPress, pressed && styles.okPressed]}
          >
            <Text style={styles.okText}>OK</Text>
          </Pressable>
        </View>
        <RemoteButton
          accessibilityLabel="Right"
          icon={<Ionicons name="chevron-forward" size={28} color={colors.text} />}
          onPress={onRight}
          repeat
          width={ARM}
          height={ARM}
          bg={colors.glassFill}
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
          bg={colors.glassFill}
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
    borderColor: colors.glassBorder,
    borderWidth: 1,
  },
  okWrap: {
    width: CENTER,
    height: CENTER,
    borderRadius: CENTER / 2,
    margin: 4,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  okPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  okText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  spacer: {
    width: ARM + 8,
    height: ARM,
  },
});
