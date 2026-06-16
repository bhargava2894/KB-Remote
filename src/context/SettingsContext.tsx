import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const PLAIN_STORAGE_KEY = '@SonyTVRemote/settings/v2';
const PAIRING_CONFIRMED_KEY = '@SonyTVRemote/pairingConfirmed/v1';
const SECURE_CERT_KEY = 'sonyTvRemoteCertPem';
const SECURE_KEY_KEY = 'sonyTvRemoteKeyPem';

export interface PlainSettings {
  ip: string;
  mac: string;
}

export interface Settings extends PlainSettings {
  certPem: string | null;
  keyPem: string | null;
}

const DEFAULT_PLAIN: PlainSettings = {
  ip: '192.168.0.156',
  mac: '',
};

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  paired: boolean;
  updateConnection: (patch: Partial<PlainSettings>) => Promise<void>;
  setCert: (certPem: string, keyPem: string) => Promise<void>;
  markPaired: (paired: boolean) => Promise<void>;
  clearCert: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [plain, setPlain] = useState<PlainSettings>(DEFAULT_PLAIN);
  const [certPem, setCertPem] = useState<string | null>(null);
  const [keyPem, setKeyPem] = useState<string | null>(null);
  const [pairingConfirmed, setPairingConfirmed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [raw, cert, key] = await Promise.all([
          AsyncStorage.getItem(PLAIN_STORAGE_KEY),
          SecureStore.getItemAsync(SECURE_CERT_KEY),
          SecureStore.getItemAsync(SECURE_KEY_KEY),
        ]);
        const confirmed = await AsyncStorage.getItem(PAIRING_CONFIRMED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PlainSettings>;
          setPlain({ ...DEFAULT_PLAIN, ...parsed });
        }
        setCertPem(cert);
        setKeyPem(key);
        setPairingConfirmed(confirmed === 'true');
      } catch {
        // ignore; fall back to defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const updateConnection = useCallback(async (patch: Partial<PlainSettings>) => {
    setPlain((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(PLAIN_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setCert = useCallback(async (cPem: string, kPem: string) => {
    await Promise.all([
      SecureStore.setItemAsync(SECURE_CERT_KEY, cPem),
      SecureStore.setItemAsync(SECURE_KEY_KEY, kPem),
    ]);
    setCertPem(cPem);
    setKeyPem(kPem);
  }, []);

  const markPaired = useCallback(async (paired: boolean) => {
    await AsyncStorage.setItem(PAIRING_CONFIRMED_KEY, paired ? 'true' : 'false');
    setPairingConfirmed(paired);
  }, []);

  const clearCert = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_CERT_KEY),
      SecureStore.deleteItemAsync(SECURE_KEY_KEY),
      AsyncStorage.removeItem(PAIRING_CONFIRMED_KEY),
    ]);
    setCertPem(null);
    setKeyPem(null);
    setPairingConfirmed(false);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings: { ...plain, certPem, keyPem },
      loaded,
      paired: pairingConfirmed && !!certPem && !!keyPem,
      updateConnection,
      setCert,
      markPaired,
      clearCert,
    }),
    [plain, certPem, keyPem, loaded, pairingConfirmed, updateConnection, setCert, markPaired, clearCert],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
