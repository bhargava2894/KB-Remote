import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AtvRemoteClient } from '../api/atvClient';
import { atvDiscovery, useDiscoveredTVs, type DiscoveredTV } from '../api/atvDiscovery';
import { KeyCode } from '../api/keycodes';

import { AuroraBackground } from '../components/AuroraBackground';
import { DPad } from '../components/DPad';
import { GlassButton } from '../components/GlassButton';
import { Rocker } from '../components/Rocker';
import { StreamingTile } from '../components/StreamingTile';
import { TVPickerSheet } from '../components/TVPickerSheet';
import { useToast } from '../components/Toast';

import { useSettings } from '../context/SettingsContext';
import { colors, radius, spacing } from '../theme/colors';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Remote'>;

const STREAM_URI = {
  netflix: 'https://www.netflix.com/title',
  youtube: 'https://www.youtube.com',
  prime: 'https://app.primevideo.com/',
} as const;

export function RemoteScreen({ navigation }: Props) {
  const { settings, paired, connectedDeviceInfo, setConnectedDeviceInfo, setDiscoveredTvs, updateConnection } =
    useSettings();
  const toast = useToast();
  const discovered = useDiscoveredTVs();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [session, setSession] = useState<AtvRemoteClient | null>(null);

  // Mirror the discovery list into the context so other screens can read it.
  useEffect(() => {
    setDiscoveredTvs(discovered);
  }, [discovered, setDiscoveredTvs]);

  // Open a remote session whenever we have a paired cert + an IP.
  useEffect(() => {
    if (!paired || !settings.ip || !settings.certPem || !settings.keyPem) return;

    const s = new AtvRemoteClient(settings.ip, {
      certPem: settings.certPem,
      keyPem: settings.keyPem,
    });
    s.setListener({
      onDeviceInfo: (info) => setConnectedDeviceInfo(info),
      onState: (remoteState, err) => {
        if (remoteState === 'ready') {
          toast.show('Connected');
        } else if (remoteState === 'error') {
          setConnectedDeviceInfo(null);
          if (err) {
            toast.show(`Connection error: ${err.message}`);
          }
        } else if (remoteState === 'idle') {
          setConnectedDeviceInfo(null);
        }
      },
    });
    s.connect();
    setSession(s);

    return () => {
      s.disconnect();
      setSession(null);
      setConnectedDeviceInfo(null);
    };
  }, [paired, settings.ip, settings.certPem, settings.keyPem, setConnectedDeviceInfo, toast]);

  const sendKey = useCallback(
    (code: number) => {
      if (!session) {
        toast.show('Not connected');
        return;
      }
      session.sendKey(code);
    },
    [session, toast],
  );

  const launch = useCallback(
    (uri: string) => {
      if (!session) {
        toast.show('Not connected');
        return;
      }
      session.launchApp(uri);
    },
    [session, toast],
  );

  const pickTv = useCallback(
    (tv: DiscoveredTV) => {
      updateConnection({ ip: tv.host });
      toast.show(`Switching to ${tv.name}`);
    },
    [updateConnection, toast],
  );

  const titleText = useMemo(() => {
    if (connectedDeviceInfo?.model) return connectedDeviceInfo.model;
    return paired ? 'Bravia Remote' : 'Not paired';
  }, [connectedDeviceInfo, paired]);

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <GlassButton
            variant="danger"
            onPress={() => sendKey(KeyCode.POWER)}
            icon={<Ionicons name="power" size={18} color="#FF6B6B" />}
            round
            size={40}
          />
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{titleText}</Text>
            <Text style={styles.subtitle}>
              {paired ? `● ${settings.ip}` : 'Pair from Settings'}
            </Text>
          </View>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={styles.castButton}
            accessibilityLabel="Switch TV"
          >
            <Ionicons name="tv-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Action row */}
        <View style={styles.actionsRow}>
          <GlassButton
            label="Mute"
            icon={<Ionicons name="volume-mute-outline" size={18} color={colors.text} />}
            onPress={() => sendKey(KeyCode.VOLUME_MUTE)}
          />
          <GlassButton
            label="Input"
            icon={<Ionicons name="swap-horizontal" size={18} color={colors.text} />}
            onPress={() => sendKey(KeyCode.TV_INPUT)}
          />
          <GlassButton
            label="Settings"
            icon={<Ionicons name="settings-outline" size={18} color={colors.text} />}
            onPress={() => navigation.navigate('Settings')}
          />
        </View>

        {/* D-pad zone */}
        <View style={styles.dpadZone}>
          <View style={styles.sideCol}>
            <GlassButton
              label="Home"
              icon={<Ionicons name="home" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.HOME)}
            />
            <GlassButton
              label="Menu"
              icon={<Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.MENU)}
            />
          </View>
          <DPad
            onUp={() => sendKey(KeyCode.DPAD_UP)}
            onDown={() => sendKey(KeyCode.DPAD_DOWN)}
            onLeft={() => sendKey(KeyCode.DPAD_LEFT)}
            onRight={() => sendKey(KeyCode.DPAD_RIGHT)}
            onOk={() => sendKey(KeyCode.DPAD_CENTER)}
          />
          <View style={styles.sideCol}>
            <GlassButton
              label="Back"
              icon={<Ionicons name="arrow-back" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.BACK)}
            />
            <GlassButton
              label="Guide"
              icon={<Ionicons name="tv-outline" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.GUIDE)}
            />
          </View>
        </View>

        {/* Bottom row: VOL / Exit / CH */}
        <View style={styles.bottomRow}>
          <Rocker
            onUp={() => sendKey(KeyCode.VOLUME_UP)}
            onDown={() => sendKey(KeyCode.VOLUME_DOWN)}
            label="VOL"
            iconUp="add"
            iconDown="remove"
          />
          <GlassButton label="Exit" onPress={() => sendKey(KeyCode.BACK)} />
          <Rocker
            onUp={() => sendKey(KeyCode.CHANNEL_UP)}
            onDown={() => sendKey(KeyCode.CHANNEL_DOWN)}
            label="CH"
            iconUp="chevron-up"
            iconDown="chevron-down"
          />
        </View>

        {/* Streaming dock */}
        <View style={styles.streamPanel}>
          <StreamingTile app="netflix" onPress={() => launch(STREAM_URI.netflix)} />
          <StreamingTile app="youtube" onPress={() => launch(STREAM_URI.youtube)} />
          <StreamingTile app="prime" onPress={() => launch(STREAM_URI.prime)} />
        </View>

        {/* TV picker bottom sheet */}
        <TVPickerSheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          tvs={discovered}
          currentIp={settings.ip || null}
          onPick={pickTv}
          onManualEntry={() => navigation.navigate('Settings')}
        />
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.power,
    fontSize: 10,
    marginTop: 2,
  },
  castButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dpadZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  sideCol: {
    width: 64,
    gap: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streamPanel: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.glassFill,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
});

// keep atvDiscovery referenced so the bundler tree-shakes nothing essential
void atvDiscovery;
