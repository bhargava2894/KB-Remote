import { requireNativeModule } from 'expo-modules-core';

interface AtvCertNative {
  installIdentity(p12Base64: string, password: string, alias: string): Promise<boolean>;
}

interface AtvTlsNative {
  connect(connectionId: string, host: string, port: number, p12Base64: string, password: string): Promise<void>;
  send(connectionId: string, dataBase64: string): Promise<void>;
  close(connectionId: string): Promise<void>;
  addListener(eventName: string, listener: (event: { connectionId: string; [k: string]: any }) => void): { remove: () => void };
}

const AtvCert: AtvCertNative = requireNativeModule('AtvCert');
const AtvTls: AtvTlsNative = requireNativeModule('AtvTls') as unknown as AtvTlsNative;

export async function installIdentity(
  p12Base64: string,
  password: string,
  alias: string,
): Promise<void> {
  await AtvCert.installIdentity(p12Base64, password, alias);
}

/** Generate a UUID v4 (RFC 4122 random-based). */
function uuid(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/**
 * mTLS connection backed by iOS Network.framework.
 *
 * Use:
 *   const c = new AtvTlsConnection();
 *   c.onConnect = (peerDerB64) => {...};
 *   c.onData = (b64) => {...};
 *   c.onError = (msg) => {...};
 *   c.onClose = () => {...};
 *   await c.connect(host, port, p12Base64, password);
 *   await c.send(base64Data);
 *   c.close();
 */
export class AtvTlsConnection {
  private id: string = uuid();
  private subs: Array<{ remove: () => void }> = [];
  private alive = true;
  onConnect?: (peerCertBase64: string) => void;
  onData?: (dataBase64: string) => void;
  onError?: (message: string) => void;
  onClose?: () => void;

  private install(): void {
    const matches = (e: { connectionId: string }) => e.connectionId === this.id;
    this.subs.push(
      AtvTls.addListener('connect', (e) => {
        if (matches(e)) this.onConnect?.(e.peerCertBase64 ?? '');
      }),
    );
    this.subs.push(
      AtvTls.addListener('data', (e) => {
        if (matches(e)) this.onData?.(e.dataBase64);
      }),
    );
    this.subs.push(
      AtvTls.addListener('error', (e) => {
        if (matches(e)) {
          this.alive = false;
          this.onError?.(e.message);
        }
      }),
    );
    this.subs.push(
      AtvTls.addListener('close', (e) => {
        if (matches(e)) {
          this.alive = false;
          this.onClose?.();
        }
      }),
    );
  }

  async connect(host: string, port: number, p12Base64: string, password: string): Promise<void> {
    this.alive = true;
    this.install();
    await AtvTls.connect(this.id, host, port, p12Base64, password);
  }

  async send(dataBase64: string): Promise<void> {
    if (!this.alive) return;
    await AtvTls.send(this.id, dataBase64);
  }

  async close(): Promise<void> {
    this.alive = false;
    try {
      await AtvTls.close(this.id);
    } catch {
      // already closed natively
    } finally {
      this.subs.forEach((s) => s.remove());
      this.subs = [];
    }
  }
}
