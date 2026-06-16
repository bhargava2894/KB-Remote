/**
 * Android TV Remote Service v2 client (pairing + remote).
 *
 * Architecture:
 *   AtvPairingSession  — one-shot: open TLS to :6467, exchange protobuf
 *                        messages, prompt user for 4-digit hex code shown
 *                        on TV, send SHA-256 secret, close.
 *
 *   AtvRemoteClient    — long-lived: open TLS to :6466 with the same client
 *                        cert, handle ping/pong heartbeats from TV, send
 *                        RemoteKeyInject messages on demand.
 *
 * Both speak length-prefixed protobuf over TLS. The TV's cert is self-signed
 * so we disable cert validation; *our* client cert is the only thing the TV
 * verifies us by.
 */
import { Buffer } from 'buffer';
import forge from 'node-forge';
import { AtvTlsConnection } from 'atv-cert';
import { buildPkcs12Base64, publicKeyBytes, publicKeyBytesFromDer } from './atvCert';
import {
  FrameReader,
  PAIRING_STATUS_OK,
  PairingMessage,
  RemoteMessage,
  frame,
} from './atvProto';

type TlsSocket = AtvTlsConnection;

interface PairingCerts {
  certPem: string;
  keyPem: string;
}

/* -------------------------------------------------------------------------- */
/*                                  PAIRING                                   */
/* -------------------------------------------------------------------------- */

export class AtvPairingSession {
  private sock: TlsSocket | null = null;
  private reader = new FrameReader();
  private serverPubKey: { modulus: Uint8Array; exponent: Uint8Array } | null = null;
  private clientPubKey: { modulus: Uint8Array; exponent: Uint8Array };
  private step: 'init' | 'request_ack' | 'option_ack' | 'await_code' | 'secret_ack' | 'done' =
    'init';
  private waiters: {
    onCodePrompt?: () => void;
    onDone?: (err?: Error) => void;
  } = {};

  constructor(
    private host: string,
    private certs: PairingCerts,
    private clientName: string = 'BraviaRemote',
  ) {
    this.clientPubKey = publicKeyBytes(certs.certPem);
  }

  /**
   * Begin pairing. Resolves once the TV is displaying its 4-digit code.
   * Call submitCode() with what the user entered to complete pairing.
   */
  async start(): Promise<void> {
    const password = 'atvremote';
    const p12 = buildPkcs12Base64(this.certs.certPem, this.certs.keyPem, password);
    console.log('[atvClient] building Network.framework TLS connection');

    return new Promise<void>((resolve, reject) => {
      this.waiters.onCodePrompt = () => resolve();
      this.waiters.onDone = (err) => {
        if (err) reject(err);
      };

      const sock = new AtvTlsConnection();
      this.sock = sock;

      sock.onConnect = (peerCertB64: string) => {
        if (this.sock !== sock) return;
        console.log('[atvClient] TLS connected, peer cert bytes:', peerCertB64.length);
        if (peerCertB64) {
          try {
            const der = Uint8Array.from(Buffer.from(peerCertB64, 'base64'));
            this.serverPubKey = publicKeyBytesFromDer(der);
          } catch (e) {
            console.log('[atvClient] failed to parse peer cert:', e);
          }
        }
        this.sendPairingRequest();
        this.step = 'request_ack';
        console.log('[atvClient] PairingRequest sent, waiting for ack');
      };
      sock.onData = (b64: string) => {
        if (this.sock !== sock) return;
        const buf = Buffer.from(b64, 'base64');
        console.log('[atvClient] data received, bytes:', buf.length);
        const frames = this.reader.push(new Uint8Array(buf));
        console.log('[atvClient] frames decoded:', frames.length, 'step:', this.step);
        for (const f of frames) this.handlePairingFrame(f);
      };
      sock.onError = (msg: string) => {
        if (this.sock !== sock) return;
        this.sock = null;
        console.log('[atvClient] socket error:', msg);
        this.fail(new Error(msg));
      };
      sock.onClose = () => {
        if (this.sock !== sock) return;
        this.sock = null;
        console.log('[atvClient] socket closed, step was:', this.step);
        if (this.step !== 'done') this.fail(new Error('TV closed pairing connection'));
      };

      sock.connect(this.host, 6467, p12, password).catch((err) => {
        if (this.sock !== sock) return;
        this.sock = null;
        console.log('[atvClient] connect threw:', err);
        this.fail(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  /** Submit the 4-character hex code that the TV is displaying. */
  async submitCode(code: string): Promise<void> {
    if (this.step !== 'await_code') throw new Error('Not awaiting code');
    if (!this.serverPubKey) throw new Error('Server public key not captured');
    const cleaned = code.trim().toUpperCase();
    if (!/^[0-9A-F]{4,6}$/.test(cleaned)) {
      throw new Error('Code must be 4-6 hex characters');
    }
    // The TV displays e.g. "A1B2": the nonce we hash is the last byte ("B2").
    const nonceHex = cleaned.slice(-2);
    const nonce = new Uint8Array([parseInt(nonceHex, 16)]);

    const sha = forge.md.sha256.create();
    sha.update(uint8ToBinary(this.clientPubKey.modulus));
    sha.update(uint8ToBinary(this.clientPubKey.exponent));
    sha.update(uint8ToBinary(this.serverPubKey.modulus));
    sha.update(uint8ToBinary(this.serverPubKey.exponent));
    sha.update(uint8ToBinary(nonce));
    const digestBin = sha.digest().getBytes();
    const secret = new Uint8Array(digestBin.length);
    for (let i = 0; i < digestBin.length; i++) secret[i] = digestBin.charCodeAt(i) & 0xff;

    await new Promise<void>((resolve, reject) => {
      this.waiters.onDone = (err) => (err ? reject(err) : resolve());
      this.sendPairingMessage({ pairingSecret: { secret } });
    });
  }

  close(): void {
    try {
      this.sock?.close();
    } catch {
      // ignore
    }
    this.sock = null;
    this.step = 'done';
  }

  private sendPairingRequest(): void {
    this.sendPairingMessage({
      protocolVersion: 2,
      status: PAIRING_STATUS_OK,
      pairingRequest: {
        serviceName: 'androidtvremote',
        clientName: this.clientName,
      },
    });
  }

  private sendPairingOption(): void {
    this.sendPairingMessage({
      protocolVersion: 2,
      status: PAIRING_STATUS_OK,
      pairingOption: {
        preferredRole: 1, // ROLE_TYPE_INPUT
        outputEncodings: [{ type: 3, symbolLength: 4 }], // HEXADECIMAL, 4-symbol
      },
    });
  }

  private sendPairingConfiguration(): void {
    this.sendPairingMessage({
      protocolVersion: 2,
      status: PAIRING_STATUS_OK,
      pairingConfiguration: {
        encoding: { type: 3, symbolLength: 4 },
        clientRole: 1,
      },
    });
  }

  private sendPairingMessage(payload: object): void {
    if (!this.sock) return;
    const errMsg = PairingMessage.verify(payload);
    if (errMsg) throw new Error('Pairing protobuf invalid: ' + errMsg);
    const msg = PairingMessage.create(payload);
    const encoded = PairingMessage.encode(msg).finish();
    const b64 = Buffer.from(frame(encoded)).toString('base64');
    this.sock.send(b64).catch((err) => console.log('[atvClient] send failed:', err));
  }

  private handlePairingFrame(payload: Uint8Array): void {
    const msg = PairingMessage.decode(payload);
    const obj = PairingMessage.toObject(msg, { defaults: true }) as PairingMessageShape;
    if (typeof obj.status === 'number' && obj.status !== PAIRING_STATUS_OK) {
      this.fail(new Error(`Pairing failed: status ${obj.status}`));
      return;
    }
    if (this.step === 'request_ack' && obj.pairingRequestAck) {
      this.sendPairingOption();
      this.step = 'option_ack';
      return;
    }
    if (this.step === 'option_ack' && obj.pairingOption) {
      // TV echoes its supported pairing options; reply with our config.
      this.sendPairingConfiguration();
      return;
    }
    if (
      (this.step === 'option_ack' || this.step === 'request_ack') &&
      obj.pairingConfigurationAck
    ) {
      this.step = 'await_code';
      this.waiters.onCodePrompt?.();
      return;
    }
    if (this.step === 'await_code' && obj.pairingSecretAck) {
      this.step = 'done';
      this.waiters.onDone?.();
      try {
        this.sock?.close();
      } catch {
        // ignore
      }
      return;
    }
  }

  private fail(err: Error): void {
    const done = this.waiters.onDone;
    this.waiters.onDone = undefined;
    this.step = 'done';
    try {
      this.sock?.close();
    } catch {
      // ignore
    }
    done?.(err);
  }
}

interface PairingMessageShape {
  status?: number;
  pairingRequestAck?: unknown;
  pairingOption?: unknown;
  pairingConfigurationAck?: unknown;
  pairingSecretAck?: unknown;
}

/* -------------------------------------------------------------------------- */
/*                                  REMOTE                                    */
/* -------------------------------------------------------------------------- */

export type RemoteState = 'idle' | 'connecting' | 'ready' | 'error';

export interface RemoteListener {
  onState?: (s: RemoteState, err?: Error) => void;
  onPower?: (active: boolean) => void;
  onVolume?: (level: number, max: number, muted: boolean) => void;
  onCurrentApp?: (appLink: string) => void;
}

export class AtvRemoteClient {
  private sock: TlsSocket | null = null;
  private reader = new FrameReader();
  private state: RemoteState = 'idle';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantConnected = false;
  private listener: RemoteListener = {};
  private lastCommand: { payload: object; time: number } | null = null;

  constructor(private host: string, private certs: PairingCerts) {}

  setListener(l: RemoteListener): void {
    this.listener = l;
  }

  connect(): void {
    this.wantConnected = true;
    this.openSocket();
  }

  disconnect(): void {
    this.wantConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      this.sock?.close();
    } catch {
      // ignore
    }
    this.sock = null;
    this.setState('idle');
  }

  /** Send a momentary key press (SHORT direction). */
  sendKey(keyCode: number): void {
    if (this.state !== 'ready') throw new Error('Remote not connected');
    this.sendRemote({
      remoteKeyInject: { keyCode, direction: 3 /* SHORT */ },
    });
  }

  /** Send a START_LONG / END_LONG press for press-and-hold actions. */
  sendKeyDown(keyCode: number): void {
    this.sendRemote({ remoteKeyInject: { keyCode, direction: 1 /* START_LONG */ } });
  }
  sendKeyUp(keyCode: number): void {
    this.sendRemote({ remoteKeyInject: { keyCode, direction: 2 /* END_LONG */ } });
  }

  private openSocket(): void {
    this.setState('connecting');
    this.reader = new FrameReader();

    const password = 'atvremote';
    const p12 = buildPkcs12Base64(this.certs.certPem, this.certs.keyPem, password);
    const sock = new AtvTlsConnection();
    this.sock = sock;

    sock.onConnect = () => {
      if (this.sock !== sock) return;
      console.log('[atvClient] Remote TLS connected. Sending Configure...');
      this.sendRemote({
        remoteConfigure: {
          code1: 622,
          deviceInfo: {
            model: 'BraviaRemote',
            vendor: 'iOS',
            unknown1: 1,
            unknown2: '1',
            packageName: 'com.example.sonytvremote',
            appVersion: '1.0.0',
          },
        },
      });
    };
    sock.onData = (b64: string) => {
      if (this.sock !== sock) return;
      const buf = Buffer.from(b64, 'base64');
      const frames = this.reader.push(new Uint8Array(buf));
      for (const f of frames) {
        this.handleRemoteFrame(f);
      }
    };
    sock.onError = (msg: string) => {
      if (this.sock !== sock) return;
      this.sock = null;
      this.setState('error', new Error(msg));
      this.scheduleReconnect();
    };
    sock.onClose = () => {
      if (this.sock !== sock) return;
      this.sock = null;
      if (this.state === 'ready') this.setState('connecting');
      if (this.state !== 'idle') this.scheduleReconnect();
    };

    sock.connect(this.host, 6466, p12, password).catch((err) => {
      if (this.sock !== sock) return;
      this.sock = null;
      this.setState('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, 2000);
  }

  private setState(s: RemoteState, err?: Error): void {
    this.state = s;
    this.listener.onState?.(s, err);
  }

  private sendRemote(payload: object): void {
    if (!this.sock) return;
    if ('remoteKeyInject' in payload) {
      this.lastCommand = { payload, time: Date.now() };
    }
    try {
      const errMsg = RemoteMessage.verify(payload);
      if (errMsg) throw new Error('Remote protobuf invalid: ' + errMsg);
      const msg = RemoteMessage.create(payload);
      const encoded = RemoteMessage.encode(msg).finish();
      console.log('[atvClient] Sending JSON:', JSON.stringify(payload));
      console.log('[atvClient] Sending HEX :', Buffer.from(encoded).toString('hex'));
      const b64 = Buffer.from(frame(encoded)).toString('base64');
      this.sock.send(b64).catch((err) => {
        console.error('[atvClient] Native socket send error:', err);
        this.setState('error', err instanceof Error ? err : new Error(String(err)));
        this.scheduleReconnect();
      });
    } catch (err) {
      console.error('[atvClient] sendRemote serialization error:', err);
    }
  }

  private handleRemoteFrame(payload: Uint8Array): void {
    console.log('[atvClient] Received HEX :', Buffer.from(payload).toString('hex'));
    let obj: RemoteFrameShape;
    try {
      const m = RemoteMessage.decode(payload);
      obj = RemoteMessage.toObject(m, { defaults: true }) as RemoteFrameShape;
      console.log('[atvClient] Received JSON:', JSON.stringify(obj));
    } catch (e) {
      console.log('[atvClient] Decode error:', e);
      return;
    }

    if (obj.remoteConfigure) {
      console.log('[atvClient] TV sent Configure.');
      return;
    }
    if (obj.remoteSetActive) {
      const activeId = obj.remoteSetActive.active ?? 0;
      console.log('[atvClient] TV session active state:', activeId);
      if (activeId !== 622) {
        console.log('[atvClient] Claiming session...');
        this.sendRemote({ remoteSetActive: { active: 622 } });
      } else if (this.lastCommand && Date.now() - this.lastCommand.time < 5000) {
        console.log('[atvClient] Re-sending last command after session claim');
        this.sendRemote(this.lastCommand.payload);
        this.lastCommand = null;
      }
      if (this.state === 'connecting') this.setState('ready');
      return;
    }
    if (obj.remoteError) {
      console.log(
        '[atvClient] TV sent RemoteError:',
        obj.remoteError.value,
        'for request:',
        JSON.stringify(obj.remoteError.request),
      );
      // Don't respond — earlier we sent SetActive here and the TV reset immediately.
      // Some error values are informational; let the TV drive the next message.
      return;
    }
    if (obj.remotePingRequest) {
      const val = obj.remotePingRequest.val1 ?? 0;
      if (this.state === 'connecting') this.setState('ready');
      this.sendRemote({ remotePingResponse: { val1: val } });
      return;
    }
    if (obj.remoteStart) {
      if (this.state === 'connecting') this.setState('ready');
      this.listener.onPower?.(obj.remoteStart.started === true);
      return;
    }
    if (obj.remoteSetVolumeLevel) {
      const v = obj.remoteSetVolumeLevel;
      console.log(
        '[atvClient] TV volume update:',
        v.volumeLevel,
        '/',
        v.volumeMax,
        'muted:',
        v.volumeMuted,
      );
      this.listener.onVolume?.(v.volumeLevel ?? 0, v.volumeMax ?? 0, !!v.volumeMuted);
      if (this.state === 'connecting') this.setState('ready');
      return;
    }
    if (obj.remoteImeKeyInject) {
      const pkg = obj.remoteImeKeyInject.appInfo?.appPackage;
      if (pkg) this.listener.onCurrentApp?.(pkg);
      return;
    }
  }
}

interface RemoteFrameShape {
  remoteConfigure?: unknown;
  remoteSetActive?: { active?: number };
  remoteError?: { value?: number; request?: unknown };
  remotePingRequest?: { val1?: number };
  remoteStart?: { started?: boolean };
  remoteSetVolumeLevel?: { volumeLevel?: number; volumeMax?: number; volumeMuted?: boolean };
  remoteImeKeyInject?: { appInfo?: { appPackage?: string } };
}

/* -------------------------------------------------------------------------- */

function uint8ToBinary(bytes: Uint8Array): string {
  // node-forge md.update() consumes a binary-encoded string.
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
