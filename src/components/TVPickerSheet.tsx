import React from 'react';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import type { DiscoveredTV } from '../api/atvDiscovery';
import { colors, radius, spacing } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  tvs: DiscoveredTV[];
  currentIp: string | null;
  onPick: (tv: DiscoveredTV) => void;
  onManualEntry: () => void;
}

export function TVPickerSheet({ visible, onClose, tvs, currentIp, onPick, onManualEntry }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {tvs.length === 0
            ? 'Searching for TVs…'
            : `Found ${tvs.length} TV${tvs.length === 1 ? '' : 's'} nearby`}
        </Text>
      </View>

      {tvs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wifi-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Make sure your TV is on the same Wi-Fi.{'\n'}This usually takes a few seconds.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tvs}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => {
            const selected = item.host === currentIp;
            return (
              <Pressable
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <View style={styles.tvIcon}>
                  <Ionicons name="tv-outline" size={20} color={colors.text} />
                </View>
                <View style={styles.tvInfo}>
                  <Text style={styles.tvName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.tvSub} numberOfLines={1}>
                    {item.host}:{item.port}
                  </Text>
                </View>
                {selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => {
          onManualEntry();
          onClose();
        }}
        style={styles.manualLink}
      >
        <Text style={styles.manualText}>
          Don't see it? <Text style={styles.manualAction}>Enter IP manually</Text>
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: spacing.sm,
  },
  rowSelected: {
    backgroundColor: 'rgba(79, 140, 255, 0.12)',
    borderColor: 'rgba(79, 140, 255, 0.4)',
  },
  tvIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassFillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvInfo: {
    flex: 1,
  },
  tvName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  tvSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  manualLink: {
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  manualText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  manualAction: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
});
