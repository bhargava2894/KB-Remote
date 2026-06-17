import { requireNativeModule } from 'expo-modules-core';

export interface DiscoveredService {
  /** Bonjour / NSD service instance name, e.g. "KD-55X8500F". */
  name: string;
  /** Resolved host address (IPv4 string). */
  host: string;
  /** TCP port advertised by the service (typically 6466 for remote, 6467 for pairing). */
  port: number;
}

interface AtvDiscoveryNative {
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  addListener(
    eventName: 'serviceFound' | 'serviceLost',
    listener: (event: DiscoveredService | { name: string }) => void,
  ): { remove: () => void };
}

const AtvDiscovery: AtvDiscoveryNative =
  requireNativeModule('AtvDiscovery') as unknown as AtvDiscoveryNative;

export async function startDiscovery(): Promise<void> {
  await AtvDiscovery.startDiscovery();
}

export async function stopDiscovery(): Promise<void> {
  await AtvDiscovery.stopDiscovery();
}

export function onServiceFound(
  cb: (service: DiscoveredService) => void,
): { remove: () => void } {
  return AtvDiscovery.addListener('serviceFound', (e) => cb(e as DiscoveredService));
}

export function onServiceLost(cb: (name: string) => void): { remove: () => void } {
  return AtvDiscovery.addListener('serviceLost', (e) => cb((e as { name: string }).name));
}
