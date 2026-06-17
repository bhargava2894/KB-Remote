import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AtvPairingSession } from '../api/atvClient';
import { ClientCert, generateClientCert } from '../api/atvCert';
import { RemoteButton } from '../components/RemoteButton';
import { useToast } from '../components/Toast';
import { useSettings } from '../context/SettingsContext';
import { colors, radius, spacing } from '../theme/colors';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Pairing'>;

type Phase = 'idle' | 'generating' | 'connecting' | 'awaiting_code' | 'submitting' | 'done';

export function PairingScreen({ navigation }: Props) {
  const { settings, setCert, markPaired } = useSettings();
  const toast = useToast();
  const sessionRef = useRef<AtvPairingSession | null>(null);
  const pendingCertsRef = useRef<ClientCert | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Ready to pair.');

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
    };
  }, []);

  const startPairing = async () => {
    if (!settings.ip) {
      toast.show('Set TV IP in Settings first');
      return;
    }
    try {
      await markPaired(false);
      pendingCertsRef.current = null;
      setPhase('generating');
      setStatus('Generating client certificate (this can take 30s)…');
      
      // Yield to the React Native UI thread to show the "Generating" state
      // before forge.pki completely blocks the JS thread for 10-30s.
      await new Promise(resolve => setTimeout(resolve, 100));

      const certs = settings.certPem && settings.keyPem
        ? { certPem: settings.certPem, keyPem: settings.keyPem }
        : await generateClientCert('BraviaRemote');
      pendingCertsRef.current = certs;

      setPhase('connecting');
      setStatus('Connecting to TV…');
      const session = new AtvPairingSession(settings.ip, certs);
      sessionRef.current = session;
      await session.start();

      setPhase('awaiting_code');
      setStatus('Enter the 6-character code displayed on the TV.');
    } catch (e) {
      pendingCertsRef.current = null;
      console.log('[PairingScreen] startPairing threw:', e, JSON.stringify(e));
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
      setPhase('idle');
      setStatus(`Failed: ${msg}`);
      toast.show(`Pairing failed — ${msg}`);
    }
  };

  const submitCode = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setPhase('submitting');
    setStatus('Verifying code…');
    try {
      await session.submitCode(code);
      const certs = pendingCertsRef.current;
      if (!certs) throw new Error('Pairing certificate not available');
      await setCert(certs.certPem, certs.keyPem);
      await markPaired(true);
      setPhase('done');
      setStatus('Paired successfully.');
      toast.show('Paired with TV');
      setTimeout(() => navigation.goBack(), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      await markPaired(false);
      setPhase('awaiting_code');
      setStatus(`Verification failed: ${msg}`);
      toast.show(`Bad code — ${msg}`);
    }
  };

  const cancel = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    pendingCertsRef.current = null;
    setPhase('idle');
    setStatus('Cancelled.');
  };

  const busy = phase === 'generating' || phase === 'connecting' || phase === 'submitting';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Pair with TV</Text>
          <Text style={styles.help}>
            This connects to your Android TV using the same protocol as the
            built-in Google Android TV Remote. The TV will show a 6-character
            code; type it below to complete pairing.
          </Text>

          <View style={styles.statusBox}>
            {busy && <ActivityIndicator color={colors.accent} />}
            <Text style={styles.status}>{status}</Text>
          </View>

          {phase === 'idle' && (
            <RemoteButton
              label="Start pairing"
              icon={<Ionicons name="link" size={18} color="#0B0B0F" />}
              onPress={startPairing}
              bg={colors.accent}
              textColor="#0B0B0F"
              height={56}
              width={undefined}
              style={styles.actionBtn}
            />
          )}

          {phase === 'awaiting_code' && (
            <View style={{ gap: spacing.lg }}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/\s/g, '').toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                style={styles.codeInput}
              />
              <RemoteButton
                label="Submit code"
                icon={<Ionicons name="checkmark" size={18} color="#0B0B0F" />}
                onPress={submitCode}
                bg={colors.accent}
                textColor="#0B0B0F"
                height={56}
                width={undefined}
                style={styles.actionBtn}
                disabled={code.length < 6}
              />
              <RemoteButton
                label="Cancel"
                onPress={cancel}
                height={48}
                width={undefined}
                style={styles.actionBtn}
              />
            </View>
          )}

          {busy && (
            <RemoteButton
              label="Cancel"
              onPress={cancel}
              height={48}
              width={undefined}
              style={styles.actionBtn}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  status: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  codeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 32,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    letterSpacing: 12,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  actionBtn: {
    width: '100%',
  },
});
