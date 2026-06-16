import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AtvRemoteClient, RemoteState } from '../api/atvClient';
import { BUTTON_KEYCODE, ButtonName } from '../api/keycodes';
import { DPad } from '../components/DPad';
import { NumberPad } from '../components/NumberPad';
import { RemoteButton } from '../components/RemoteButton';
import { Rocker } from '../components/Rocker';
import { useToast } from '../components/Toast';
import { useSettings } from '../context/SettingsContext';
import { colors, radius, spacing } from '../theme/colors';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Remote'>;

export function RemoteScreen({ navigation }: Props) {
  const { settings, paired } = useSettings();
  const toast = useToast();

  const clientRef = useRef<AtvRemoteClient | null>(null);
  const [state, setState] = useState<RemoteState>('idle');

  useEffect(() => {
    if (!paired || !settings.ip || !settings.certPem || !settings.keyPem) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      setState('idle');
      return;
    }
    const client = new AtvRemoteClient(settings.ip, {
      certPem: settings.certPem,
      keyPem: settings.keyPem,
    });
    client.setListener({
      onState: (s, err) => {
        setState(s);
        if (s === 'error' && err) toast.show(`Connection: ${err.message}`);
      },
    });
    client.connect();
    clientRef.current = client;
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [paired, settings.ip, settings.certPem, settings.keyPem, toast]);

  const press = useCallback(
    (button: ButtonName) => {
      const client = clientRef.current;
      if (!client || state !== 'ready') {
        toast.show(state === 'connecting' ? 'Connecting to TV…' : 'TV not connected');
        return;
      }
      try {
        client.sendKey(BUTTON_KEYCODE[button]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        toast.show(`Send failed — ${msg}`);
      }
    },
    [state, toast],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Bravia Remote</Text>
            <Text style={styles.subtitle}>
              {settings.ip || 'No IP set'} · <StateChip state={state} paired={paired} />
            </Text>
          </View>
          <RemoteButton
            accessibilityLabel="Settings"
            icon={<Ionicons name="settings-outline" size={20} color={colors.text} />}
            onPress={() => navigation.navigate('Settings')}
            width={48}
            height={48}
            style={styles.headerBtn}
          />
        </View>

        {!paired && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              You need to pair with your TV first.
            </Text>
            <RemoteButton
              label="Open Settings"
              onPress={() => navigation.navigate('Settings')}
              bg={colors.accent}
              textColor="#0B0B0F"
              height={44}
              width={undefined}
              style={{ width: '100%' }}
            />
          </View>
        )}

        {/* Top row */}
        <View style={styles.row}>
          <RemoteButton
            label="Power"
            icon={<Ionicons name="power" size={18} color="#0B0B0F" />}
            onPress={() => press('Power')}
            bg={colors.power}
            textColor="#0B0B0F"
            width={110}
            height={56}
          />
          <RemoteButton
            label="Mute"
            icon={<Ionicons name="volume-mute" size={18} color={colors.text} />}
            onPress={() => press('Mute')}
            width={110}
            height={56}
          />
          <RemoteButton
            label="Input"
            icon={<Ionicons name="swap-horizontal" size={18} color={colors.text} />}
            onPress={() => press('Input')}
            width={110}
            height={56}
          />
        </View>

        {/* D-pad cluster */}
        <View style={styles.dpadBlock}>
          <View style={styles.dpadRow}>
            <View style={styles.sideCol}>
              <RemoteButton
                label="Home"
                icon={<Ionicons name="home" size={20} color={colors.text} />}
                onPress={() => press('Home')}
                width={84}
                height={56}
              />
              <RemoteButton
                label="Menu"
                icon={<Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />}
                onPress={() => press('Menu')}
                width={84}
                height={56}
              />
            </View>

            <DPad
              onUp={() => press('Up')}
              onDown={() => press('Down')}
              onLeft={() => press('Left')}
              onRight={() => press('Right')}
              onOk={() => press('Ok')}
            />

            <View style={styles.sideCol}>
              <RemoteButton
                label="Back"
                icon={<Ionicons name="arrow-undo" size={20} color={colors.text} />}
                onPress={() => press('Back')}
                width={84}
                height={56}
              />
              <RemoteButton
                label="Guide"
                icon={<Ionicons name="newspaper-outline" size={20} color={colors.text} />}
                onPress={() => press('Guide')}
                width={84}
                height={56}
              />
            </View>
          </View>
        </View>

        {/* Rockers */}
        <View style={styles.rockerRow}>
          <Rocker
            label="VOL"
            iconUp="volume-high"
            iconDown="volume-low"
            onUp={() => press('VolumeUp')}
            onDown={() => press('VolumeDown')}
          />
          <RemoteButton
            label="Exit"
            onPress={() => press('Exit')}
            width={90}
            height={56}
          />
          <Rocker
            label="CH"
            iconUp="chevron-up"
            iconDown="chevron-down"
            onUp={() => press('ChannelUp')}
            onDown={() => press('ChannelDown')}
          />
        </View>

        {/* Media row */}
        <View style={styles.mediaRow}>
          <RemoteButton
            accessibilityLabel="Rewind"
            icon={<Ionicons name="play-skip-back" size={20} color={colors.text} />}
            onPress={() => press('Rewind')}
            width={58}
            height={52}
          />
          <RemoteButton
            accessibilityLabel="Play"
            icon={<Ionicons name="play" size={22} color={colors.text} />}
            onPress={() => press('Play')}
            width={58}
            height={52}
          />
          <RemoteButton
            accessibilityLabel="Pause"
            icon={<Ionicons name="pause" size={22} color={colors.text} />}
            onPress={() => press('Pause')}
            width={58}
            height={52}
          />
          <RemoteButton
            accessibilityLabel="Stop"
            icon={<Ionicons name="stop" size={20} color={colors.text} />}
            onPress={() => press('Stop')}
            width={58}
            height={52}
          />
          <RemoteButton
            accessibilityLabel="Fast forward"
            icon={<Ionicons name="play-skip-forward" size={20} color={colors.text} />}
            onPress={() => press('FastForward')}
            width={58}
            height={52}
          />
        </View>

        <NumberPad onDigit={(name) => press(name as ButtonName)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StateChip({ state, paired }: { state: RemoteState; paired: boolean }) {
  if (!paired) return <Text style={styles.chipMuted}>not paired</Text>;
  if (state === 'ready') return <Text style={styles.chipReady}>ready</Text>;
  if (state === 'connecting') return <Text style={styles.chipMuted}>connecting…</Text>;
  if (state === 'error') return <Text style={styles.chipError}>error</Text>;
  return <Text style={styles.chipMuted}>idle</Text>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    borderRadius: radius.pill,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  banner: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  bannerText: {
    color: colors.text,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dpadBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dpadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideCol: {
    gap: spacing.sm,
  },
  rockerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chipReady: { color: colors.power },
  chipMuted: { color: colors.textMuted },
  chipError: { color: colors.danger },
});
