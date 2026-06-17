import { useEffect, useState } from 'react';
import {
  startDiscovery as nativeStart,
  stopDiscovery as nativeStop,
  onServiceFound,
  onServiceLost,
  type DiscoveredService,
} from 'atv-discovery';

export type DiscoveredTV = DiscoveredService;

type Listener = (tvs: DiscoveredTV[]) => void;

class DiscoveryStore {
  private tvs = new Map<string, DiscoveredTV>();
  private listeners = new Set<Listener>();
  private subs: Array<{ remove: () => void }> = [];
  private active = false;

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;

    this.subs.push(
      onServiceFound((svc) => {
        this.tvs.set(svc.name, svc);
        this.emit();
      }),
    );
    this.subs.push(
      onServiceLost((name) => {
        if (this.tvs.delete(name)) this.emit();
      }),
    );

    try {
      await nativeStart();
    } catch (e) {
      console.log('[atvDiscovery] startDiscovery threw:', e);
      this.active = false;
      this.cleanup();
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    try {
      await nativeStop();
    } catch (e) {
      console.log('[atvDiscovery] stopDiscovery threw:', e);
    }
    this.cleanup();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): DiscoveredTV[] {
    return Array.from(this.tvs.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private cleanup(): void {
    for (const sub of this.subs) sub.remove();
    this.subs = [];
    this.tvs.clear();
  }
}

export const atvDiscovery = new DiscoveryStore();

/** Convenience hook: starts discovery on mount, stops on unmount, returns the current list. */
export function useDiscoveredTVs(): DiscoveredTV[] {
  const [tvs, setTvs] = useState<DiscoveredTV[]>(() => atvDiscovery.snapshot());

  useEffect(() => {
    let active = true;
    atvDiscovery.start().catch(() => {});
    const unsub = atvDiscovery.subscribe((next) => {
      if (active) setTvs(next);
    });
    return () => {
      active = false;
      unsub();
      atvDiscovery.stop().catch(() => {});
    };
  }, []);

  return tvs;
}
