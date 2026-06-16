/**
 * Protobuf schemas for the Android TV Remote Service v2.
 *
 * Two separate services, each on its own TLS port:
 *   - port 6467 : pairing protocol (one-time, user types code shown on TV)
 *   - port 6466 : remote control (key inject, ping/pong, etc.)
 *
 * Each TLS payload is a single protobuf message, framed with a single varint
 * length prefix. We hand-roll the varint framing; protobufjs handles the
 * message body.
 *
 * Schema is from the louis-lau/androidtv-remote and tronikos/androidtvremote2
 * reverse-engineering projects.
 */
import protobuf from 'protobufjs';

const PAIRING_PROTO = `
syntax = "proto3";

message PairingRequest {
  string service_name = 1;
  string client_name = 2;
}

message PairingRequestAck {
  string server_name = 1;
}

message PairingOption {
  repeated PairingEncoding input_encodings = 1;
  repeated PairingEncoding output_encodings = 2;
  RoleType preferred_role = 3;
}

message PairingConfiguration {
  PairingEncoding encoding = 1;
  RoleType client_role = 2;
}

message PairingConfigurationAck {}

message PairingSecret {
  bytes secret = 1;
}

message PairingSecretAck {}

enum RoleType {
  ROLE_TYPE_UNKNOWN = 0;
  ROLE_TYPE_INPUT = 1;
  ROLE_TYPE_OUTPUT = 2;
}

message PairingEncoding {
  EncodingType type = 1;
  uint32 symbol_length = 2;
}

enum EncodingType {
  ENCODING_TYPE_UNKNOWN = 0;
  ENCODING_TYPE_ALPHANUMERIC = 1;
  ENCODING_TYPE_NUMERIC = 2;
  ENCODING_TYPE_HEXADECIMAL = 3;
  ENCODING_TYPE_QRCODE = 4;
}

message PairingMessage {
  int32 protocol_version = 1;
  Status status = 2;
  PairingRequest pairing_request = 10;
  PairingRequestAck pairing_request_ack = 11;
  PairingOption pairing_option = 20;
  PairingConfiguration pairing_configuration = 30;
  PairingConfigurationAck pairing_configuration_ack = 31;
  PairingSecret pairing_secret = 40;
  PairingSecretAck pairing_secret_ack = 41;

  enum Status {
    STATUS_UNKNOWN = 0;
    STATUS_OK = 200;
    STATUS_ERROR = 400;
    STATUS_BAD_CONFIGURATION = 401;
    STATUS_BAD_SECRET = 402;
  }
}
`;

const REMOTE_PROTO = `
syntax = "proto3";

message RemoteMessage {
  RemoteConfigure remote_configure = 1;
  RemoteSetActive remote_set_active = 2;
  RemoteError remote_error = 3;
  RemotePingRequest remote_ping_request = 8;
  RemotePingResponse remote_ping_response = 9;
  RemoteKeyInject remote_key_inject = 10;
  RemoteImeKeyInject remote_ime_key_inject = 20;
  RemoteStart remote_start = 40;
  RemoteSetVolumeLevel remote_set_volume_level = 50;
  RemoteAdjustVolumeLevel remote_adjust_volume_level = 51;
  RemoteAppLinkLaunchRequest remote_app_link_launch_request = 90;
}

message RemoteConfigure {
  int32 code1 = 1;
  RemoteDeviceInfo device_info = 2;
}

message RemoteDeviceInfo {
  string model = 1;
  string vendor = 2;
  uint32 unknown1 = 3;
  string unknown2 = 4;
  string package_name = 5;
  string app_version = 6;
}

message RemoteSetActive {
  int32 active = 1;
}

message RemoteError {
  int32 value = 1;
  RemoteMessage request = 2;
}

message RemotePingRequest {
  int32 val1 = 1;
  int32 val2 = 2;
}

message RemotePingResponse {
  int32 val1 = 1;
}

message RemoteKeyInject {
  int32 key_code = 1;
  RemoteDirection direction = 2;
}

enum RemoteDirection {
  UNKNOWN_DIRECTION = 0;
  START_LONG = 1;
  END_LONG = 2;
  SHORT = 3;
}

message RemoteImeKeyInject {
  RemoteAppInfo app_info = 1;
}

message RemoteAppInfo {
  string app_package = 12;
}

message RemoteStart {
  bool started = 1;
}

message RemoteSetVolumeLevel {
  uint32 unknown1 = 1;
  uint32 unknown2 = 2;
  string player_model = 3;
  uint32 unknown4 = 4;
  uint32 unknown5 = 5;
  uint32 volume_max = 6;
  uint32 volume_level = 7;
  bool volume_muted = 8;
}

message RemoteAdjustVolumeLevel {
  uint32 unknown = 1;
}

message RemoteAppLinkLaunchRequest {
  string app_link = 1;
}
`;

const pairingRoot = protobuf.parse(PAIRING_PROTO).root;
const remoteRoot = protobuf.parse(REMOTE_PROTO).root;

export const PairingMessage = pairingRoot.lookupType('PairingMessage');
export const RemoteMessage = remoteRoot.lookupType('RemoteMessage');

export const PAIRING_STATUS_OK = 200;

/* ---------------------- length-prefixed wire framing ---------------------- */

/** Reads varint (32-bit) starting at `offset`, returns value + bytes consumed. */
export function readVarint(buf: Uint8Array, offset: number): { value: number; size: number } {
  let value = 0;
  let shift = 0;
  let size = 0;
  while (size < 5) {
    if (offset + size >= buf.length) throw new Error('varint truncated');
    const b = buf[offset + size];
    value |= (b & 0x7f) << shift;
    size++;
    if ((b & 0x80) === 0) return { value: value >>> 0, size };
    shift += 7;
  }
  throw new Error('varint too long');
}

/** Encode a single message: 1-byte length prefix + payload (Android TV uses
 *  a single byte; if > 127 we still write a proper varint). */
export function frame(payload: Uint8Array): Uint8Array {
  // The wire framing is "[length varint][payload]" — for our messages length
  // is well under 16k so 1-2 bytes of varint header is fine.
  const lenBytes = encodeVarint(payload.length);
  const out = new Uint8Array(lenBytes.length + payload.length);
  out.set(lenBytes, 0);
  out.set(payload, lenBytes.length);
  return out;
}

function encodeVarint(n: number): Uint8Array {
  const bytes: number[] = [];
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n & 0x7f);
  return new Uint8Array(bytes);
}

/**
 * Buffered framer: accepts incoming TCP chunks (concatenates them) and
 * yields complete messages as Uint8Array payloads (length prefix stripped).
 */
export class FrameReader {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const out: Uint8Array[] = [];
    while (this.buf.length > 0) {
      let header: { value: number; size: number };
      try {
        header = readVarint(this.buf, 0);
      } catch {
        // not enough bytes yet
        break;
      }
      const total = header.size + header.value;
      if (this.buf.length < total) break;
      out.push(this.buf.slice(header.size, total));
      this.buf = this.buf.slice(total);
    }
    return out;
  }
}
