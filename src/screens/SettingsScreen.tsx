import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RemoteButton } from '../components/RemoteButton';
import { useToast } from '../components/Toast';
import { useSettings } from '../context/SettingsContext';
import { colors, radius, spacing } from '../theme/colors';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { settings, updateConnection, paired, clearCert } = useSettings();
  const toast = useToast();

  const [ip, setIp] = useState(settings.ip);
  const [mac, setMac] = useState(settings.mac);

  const onSave = async () => {
    await updateConnection({ ip: ip.trim(), mac: mac.trim() });
    toast.show('Settings saved');
    navigation.goBack();
  };

  const onPair = () => {
    navigation.navigate('Pairing');
  };

  const onUnpair = async () => {
    await clearCert();
    toast.show('Pairing cleared');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>TV Connection</Text>
          <Text style={styles.help}>
            Uses the Android TV Remote Service v2 protocol — the same protocol
            as the built-in Google Android TV Remote app. No setting changes
            needed on the TV beyond turning it on.
          </Text>

          <Field label="TV IP address">
            <TextInput
              value={ip}
              onChangeText={setIp}
              placeholder="192.168.0.156"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </Field>

          <Field label="TV MAC address (optional)">
            <TextInput
              value={mac}
              onChangeText={setMac}
              placeholder="AA:BB:CC:DD:EE:FF"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
          </Field>

          <View style={styles.pairBlock}>
            <Text style={styles.fieldLabel}>Pairing</Text>
            <View style={styles.pairStatus}>
              <Ionicons
                name={paired ? 'checkmark-circle' : 'alert-circle-outline'}
                size={20}
                color={paired ? colors.power : colors.textMuted}
              />
              <Text style={styles.pairStatusText}>
                {paired ? 'Paired with TV' : 'Not paired'}
              </Text>
            </View>
            <RemoteButton
              label={paired ? 'Re-pair with TV' : 'Pair with TV'}
              icon={<Ionicons name="link" size={18} color={colors.text} />}
              onPress={onPair}
              height={52}
              width={undefined}
              style={styles.actionBtn}
            />
            {paired && (
              <RemoteButton
                label="Forget pairing"
                onPress={onUnpair}
                height={48}
                width={undefined}
                style={styles.actionBtn}
              />
            )}
          </View>

          <RemoteButton
            label="Save"
            icon={<Ionicons name="save" size={18} color="#0B0B0F" />}
            onPress={onSave}
            bg={colors.accent}
            textColor="#0B0B0F"
            height={52}
            width={undefined}
            style={styles.actionBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
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
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  help: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pairBlock: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pairStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pairStatusText: {
    color: colors.text,
    fontSize: 14,
  },
  actionBtn: {
    width: '100%',
  },
});
