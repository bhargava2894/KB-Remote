# Android Platform Support — Design Spec

**Date:** 2026-06-17
**Owner:** Bhargava
**Status:** Draft (pre-implementation)

## Goal

Make the existing iOS app work on Android phones, with no regression to the iOS build. Same JS code, same UI, same network protocol — only difference is the native TLS layer is implemented twice: once in Swift (today) and once in Kotlin (new).

## Non-Goals

- No new features.
- No UI changes, no theme changes, no screen rewrites.
- No changes to `src/api/`, `src/screens/`, `src/components/`, `src/context/`.
- No changes to the iOS Swift code.
- No Bonjour/mDNS auto-discovery on Android (the iOS app doesn't have it either).
- No Android KeyStore hardware-backed storage. Use `EncryptedSharedPreferences` — simpler, sufficient.
- No play-store-grade signing config. Debug keystore only for now.

## Scope

In-scope:

1. New Kotlin native module under `modules/atv-cert/android/` implementing the same JS interface as the iOS module.
2. `modules/atv-cert/expo-module.config.json` updated to register the Android platform.
3. `.gitignore` updated to include the generated `android/` folder (mirrors how `ios/` is handled).
4. `README.md` updated with an Android run section.
5. `CLAUDE.md` updated to reflect new architecture surface.

Out-of-scope (separate task if/when needed):

- Android Studio installation guide for the user (done verbally, not as code).
- CI/CD for Android builds.
- Play Store release config.

## Architecture

```
modules/atv-cert/
├── index.ts                          [UNCHANGED] — JS facade, already platform-agnostic
├── expo-module.config.json           [EDIT]      — add "android" to platforms
├── ios/                              [UNCHANGED] — Swift implementation
│   ├── AtvCert.podspec
│   ├── AtvCertModule.swift
│   └── AtvTlsModule.swift
└── android/                          [NEW]       — Kotlin implementation
    ├── build.gradle
    └── src/main/java/expo/modules/atvcert/
        ├── AtvCertModule.kt
        └── AtvTlsModule.kt
```

The Expo runtime selects which native side to load based on `Platform.OS` at runtime. The JS code in `index.ts` calls `requireNativeModule('AtvCert')` and `requireNativeModule('AtvTls')` — both names must match between Swift and Kotlin (`Name("AtvCert")` / `Name("AtvTls")` in module definitions).

The generated top-level `android/` folder (from `expo prebuild --platform android`) is gitignored, same as `ios/`. Our hand-written Kotlin sources live under `modules/atv-cert/android/` and survive prebuild regeneration.

## Components

### Component 1: `AtvCertModule.kt` — Cert install

**Purpose:** Persist a PKCS#12 (P12) identity for the app to use later.

**Public surface** (called from JS via `requireNativeModule('AtvCert')`):

```kotlin
AsyncFunction("installIdentity") { p12Base64: String, password: String, alias: String -> Boolean }
```

**Behavior:**

1. Base64-decode `p12Base64`. If decode fails → throw `BadBase64Exception`.
2. Load the bytes as a PKCS12 `KeyStore` using `password`. If load fails → throw `ImportFailedException`.
3. Extract the first alias from the PKCS12 keystore that has both a key and a cert chain. If none → throw `NoIdentityException`.
4. Persist the raw P12 bytes + password into `EncryptedSharedPreferences` keyed by `alias`. Replace any existing entry for that alias.
5. Read back to verify the entry exists. If not → throw `VerificationFailedException`.
6. Return `true`.

**Storage details:**
- Prefs file name: `atv_cert_store`
- Master key: `MasterKeys.AES256_GCM_SPEC` (default tier)
- Key scheme: `AES256_SIV`
- Value scheme: `AES256_GCM`
- Stored value per alias: a JSON blob `{"p12Base64": "...", "password": "..."}`

**Rationale for storing P12 + password (not unpacked KeyManager):**
- Mirrors iOS exactly: `connect()` re-loads the P12 each call.
- Keeps the unpacked private key out of memory between calls.
- The password is itself a JS-generated nonce, so storing it adds no additional risk over the existing iOS-Keychain approach.

### Component 2: `AtvTlsModule.kt` — mTLS socket

**Purpose:** Open a TLS socket to the TV using a client certificate, read/write encrypted bytes, expose lifecycle events to JS.

**Public surface:**

```kotlin
Events("data", "connect", "close", "error")

AsyncFunction("connect") { connectionId: String, host: String, port: Int, p12Base64: String, password: String -> Unit }
AsyncFunction("send")    { connectionId: String, dataBase64: String -> Unit }
AsyncFunction("close")   { connectionId: String -> Unit }
```

**State:**

- `connections: ConcurrentHashMap<String, ConnectionHolder>` — keyed by `connectionId`.
- Each `ConnectionHolder` owns: the `SSLSocket`, its `InputStream`/`OutputStream`, a captured peer leaf cert (nullable), and the receive thread handle.

**`connect()` behavior:**

1. Base64-decode `p12Base64`. Bad input → throw.
2. Build a `KeyManager[]` from the P12:
   - Load `KeyStore.getInstance("PKCS12")`, init with the bytes + password.
   - `KeyManagerFactory.getInstance("X509")`, init with that keystore + password.
3. Build a `TrustManager[]` containing **one** trust-all manager:
   - `checkClientTrusted`: no-op.
   - `checkServerTrusted`: capture the peer's leaf cert (first entry in the chain) into the `ConnectionHolder.peerCert` slot, return without throwing.
   - `getAcceptedIssuers`: return empty.
4. `SSLContext.getInstance("TLS")`.init with KeyManagers + TrustManagers + `SecureRandom()`.
5. Create socket on a background `Executors.newSingleThreadExecutor()`:
   - `sslContext.socketFactory.createSocket(host, port) as SSLSocket`
   - `socket.startHandshake()` (this triggers the trust manager and populates `peerCert`).
6. On handshake success:
   - Emit `connect` event with `peerCertBase64` = base64 of the captured leaf cert, or `""` if absent.
   - **Special case for port 6467 (pairing):** If `peerCert` is still null after handshake, emit `error` with message `"TV public key unavailable for pairing"` and close. (Matches iOS behavior.)
   - For port 6466, empty string is acceptable.
7. Spawn a reader thread that loops on `inputStream.read(buf, 0, buf.size)`:
   - On data: emit `data` event with `dataBase64`.
   - On EOF (`read` returns `-1`): emit `close`, remove from map, exit thread.
   - On `IOException`: emit `error`, remove from map, exit thread.
8. On any pre-handshake failure: emit `error` with the exception message, remove from map.

**`send()` behavior:**

1. Look up `connectionId` in map. Missing → throw `NoConnectionException`.
2. Base64-decode `dataBase64`. Bad input → throw.
3. Call `outputStream.write(bytes)` + `outputStream.flush()` on a worker thread (don't block the JS bridge).

**`close()` behavior:**

1. Look up `connectionId`. If absent → no-op (don't throw — JS may call close after error).
2. Best-effort: shutdown the input/output streams, close the socket, interrupt the reader thread.
3. Remove from map.
4. Reader thread will detect closure and may emit `close` itself; that's fine — JS-side listener is idempotent.

### Component 3: `build.gradle` for the Android module

Standard Expo module Gradle setup. Depends on:
- `androidx.security:security-crypto` for `EncryptedSharedPreferences`.
- Standard JDK (`javax.net.ssl.*`, `java.security.KeyStore`).
- Kotlin stdlib (provided by Expo).

`minSdkVersion 24` to match `app.json`'s existing `android.minSdkVersion: 24`.

**Permissions:** No new permissions declared by this module. `INTERNET` and cleartext networking are already configured in the top-level `app.json` (`android.usesCleartextTraffic: true`) and granted via the app's main `AndroidManifest.xml` (auto-generated by `expo prebuild`).

### Component 4: `expo-module.config.json`

```json
{
  "platforms": ["ios", "android"],
  "ios": {
    "modules": ["AtvCertModule", "AtvTlsModule"]
  },
  "android": {
    "modules": ["expo.modules.atvcert.AtvCertModule", "expo.modules.atvcert.AtvTlsModule"]
  }
}
```

### Component 5: `.gitignore`

Add `android/` line under the existing `ios/` line — both are generated by `expo prebuild`.

### Component 6: Docs

- **`README.md`**: Add an "Android" section parallel to "Running it on a Mac", describing `expo prebuild --platform android`, opening `android/` in Android Studio, USB-debugging the phone.
- **`CLAUDE.md`**: Update the Architecture section to list `android/` alongside `ios/` in `modules/atv-cert/`, and add a one-line note about Android-specific gotchas (network security config, USB debugging).

## Data Flow

The JS layer is unchanged. From `index.ts`:

```
JS calls c.connect(host, port, p12, pw)
   ↓ requireNativeModule("AtvTls").connect(id, host, port, p12, pw)
   ↓
   On iOS    → Swift AtvTlsModule.connect → NWConnection (TLS)
   On Android → Kotlin AtvTlsModule.connect → SSLSocket
   ↓
   Both fire the same events: connect, data, close, error
   ↓
   JS-side AtvTlsConnection class dispatches to user callbacks
```

The `connect` event payload is identical: `{ connectionId: string, peerCertBase64: string }`. The `data` event payload is identical: `{ connectionId: string, dataBase64: string }`. The `error` and `close` payloads are identical.

## Error Handling

Each Kotlin function throws a `CodedException` (Expo's standard) with a stable error code:

| Code | Thrown by | Meaning |
|---|---|---|
| `ERR_BAD_BASE64` | both | P12 or data input was not valid base64 |
| `ERR_IMPORT_FAILED` | both | `KeyStore.load(PKCS12)` rejected the bytes/password |
| `ERR_NO_IDENTITY` | AtvCert | PKCS12 had no entry with a private key + cert |
| `ERR_VERIFY_FAILED` | AtvCert | EncryptedSharedPreferences round-trip failed |
| `ERR_NO_CONNECTION` | AtvTls | `connectionId` not in map |

Event-side errors (handshake failure, socket IO failure) are reported via the `error` event, not thrown — matches iOS semantics.

## Testing Strategy

**Unit testing:** Not in scope for this task. The native modules are I/O-heavy with Android system dependencies (Keystore, sockets); meaningful tests require instrumented tests on a device, which is a much larger effort. The iOS Swift code has no unit tests either — we are matching that baseline.

**Manual verification gates** (in this order):

1. **Phase 1 gate: UI launches on Android.**
   - `npx expo prebuild --platform android --clean` succeeds.
   - `npx expo run:android` installs the app on the phone.
   - All three screens (Remote, Settings, Pairing) render without crashes.
   - User can type an IP into Settings and have it persist (SecureStore works).

2. **Phase 2 gate: TLS module compiles and loads.**
   - App launches without "module not found" errors for `AtvCert` or `AtvTls`.
   - Tapping "Pair with TV" gets past cert generation (the JS-side `atvCert.ts` runs, then calls into Kotlin).

3. **Phase 2 gate: Pairing succeeds end-to-end.**
   - 6-char code displays on the TV.
   - Typing it into the app advances to `RemoteScreen` without "TV closed pairing connection" or similar errors.

4. **Phase 2 gate: Remote control works.**
   - Volume up/down, D-pad, channel up/down all visibly affect the TV.
   - Connection survives at least 5 minutes (ping/pong loop).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Android socket on main thread crashes** with `NetworkOnMainThreadException`. | All socket calls (`connect`, `send`, `read`) run on background executors, never on the JS bridge thread. |
| **Sony TV refuses connection** because the JVM SSL stack negotiates differently from `Network.framework` (cipher suite mismatch). | Use default SSL context — both iOS and Android target the same TLS 1.2+ baseline. If a specific cipher is needed, we'll discover it during the "Pairing succeeds" gate and pin it then; don't pre-optimize. |
| **`EncryptedSharedPreferences` doesn't survive app reinstall.** | Acceptable — iOS Keychain has the same property (cleared on full uninstall). User re-pairs after reinstall. Documented in CLAUDE.md. |
| **Android 9+ blocks cleartext to local IPs by default.** | `app.json` already sets `android.usesCleartextTraffic: true`. Our connections are TLS-encrypted anyway, but this also allows fallback discovery traffic if ever needed. |
| **Phone joins a different WiFi (cellular fallback) mid-session.** | Existing JS error handler catches the socket failure and shows the toast. No new code needed. |
| **Kotlin `AtvTlsModule` is dispatched on a different threading model than Swift's `DispatchQueue`.** | We use a `ConcurrentHashMap` + per-socket executor — same isolation guarantees, simpler code. |

## Rollout

1. Branch off `master`. Build all Kotlin code.
2. Verify all four manual gates above on the user's Android phone.
3. Update `README.md` and `CLAUDE.md` only after all gates pass.
4. Merge to `master`.

## Open Questions

None at this point — all design decisions are made above.

## Future Work (NOT in this spec)

- Hardware-backed key storage via Android KeyStore.
- Bonjour/mDNS auto-discovery (iOS doesn't have it either; would be a parallel feature).
- Play Store signing config.
- Android-specific UI tweaks (e.g. native back-button handling) — only if a real bug appears.
