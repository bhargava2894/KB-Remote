import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Whether to dim the rest of the screen behind the sheet. Default true. */
  dim?: boolean;
  contentStyle?: ViewStyle;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function BottomSheet({ visible, onClose, children, dim = true, contentStyle }: Props) {
  const translate = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translate, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translate, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translate, backdrop]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {dim && (
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: backdrop }]}
          />
        )}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: translate }] },
            contentStyle,
          ]}
        >
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.handleBar} />
          <View style={styles.inner}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 15, 22, 0.55)',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  inner: {
    paddingHorizontal: spacing.lg,
  },
});
