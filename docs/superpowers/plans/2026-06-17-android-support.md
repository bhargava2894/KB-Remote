# Android Platform Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Kotlin native module so the existing Expo React Native app can run on Android phones with full TV remote functionality, without any change to iOS behavior.

**Architecture:** Mirror the iOS Swift module under `modules/atv-cert/ios/` with an equivalent Kotlin module under `modules/atv-cert/android/`. Same JS interface, same event shapes, same error semantics. The Expo runtime auto-selects which native side to load per platform.

**Tech Stack:** Kotlin, `expo-modules-core`, `androidx.security:security-crypto` (EncryptedSharedPreferences), Java `javax.net.ssl.SSLSocket` + `KeyStore.PKCS12` for mTLS, `ConcurrentHashMap` + `Executors` for connection state.

**Spec:** [docs/superpowers/specs/2026-06-17-android-support-design.md](../specs/2026-06-17-android-support-design.md)

**Reference:** All testing in this plan is **manual verification on a real Android device** because the modules are I/O-heavy with Android system dependencies. The iOS Swift code has no unit tests either — we're matching that baseline. Verification gates are explicit and labeled.

---

## File Structure (everything new or changed)

| File | Action | Purpose |
|---|---|---|
| `modules/atv-cert/expo-module.config.json` | modify | Add `"android"` to platforms |
| `modules/atv-cert/android/build.gradle` | create | Expo module Gradle config |
| `modules/atv-cert/android/src/main/AndroidManifest.xml` | create | Empty manifest (no new permissions) |
| `modules/atv-cert/android/src/main/java/expo/modules/atvcert/AtvCertModule.kt` | create | PKCS12 install into EncryptedSharedPreferences |
| `modules/atv-cert/android/src/main/java/expo/modules/atvcert/AtvTlsModule.kt` | create | mTLS socket (connect/send/close + events) |
| `.gitignore` | modify | Add `android/` (top-level generated dir) |
| `README.md` | modify | Add "Running on Android" section |
| `CLAUDE.md` | modify | Note Android module exists alongside iOS |

---

## Task 1: Create feature branch and Android module scaffolding

**Files:**
- Create: `modules/atv-cert/android/build.gradle`
- Create: `modules/atv-cert/android/src/main/AndroidManifest.xml`
- Modify: `modules/atv-cert/expo-module.config.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/android-support
git status
```

Expected: `On branch feat/android-support` and a clean working tree.

- [ ] **Step 2: Create the Android module directory structure**

```bash
mkdir -p modules/atv-cert/android/src/main/java/expo/modules/atvcert
ls modules/atv-cert/android/
```

Expected: directory `src` listed.

- [ ] **Step 3: Write `modules/atv-cert/android/build.gradle`**

```gradle
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'

group = 'expo.modules.atvcert'
version = '0.1.0'

def expoModulesCorePlugin = new File(project(":expo-modules-core").projectDir.absolutePath, "ExpoModulesCorePlugin.gradle")
apply from: expoModulesCorePlugin
applyKotlinExpoModulesCorePlugin()
useCoreDependencies()
useExpoPublishing()
useDefaultAndroidSdkVersions()

android {
  namespace "expo.modules.atvcert"
  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }
}

dependencies {
  implementation project(':expo-modules-core')
  implementation "androidx.security:security-crypto:1.1.0-alpha06"
}
```

- [ ] **Step 4: Write `modules/atv-cert/android/src/main/AndroidManifest.xml`**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android" />
```

(Intentionally empty: no permissions declared. The app's `INTERNET` and `usesCleartextTraffic` already come from `app.json`'s `android` block.)

- [ ] **Step 5: Update `modules/atv-cert/expo-module.config.json`**

Replace the entire file contents with:

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

- [ ] **Step 6: Update `.gitignore` to ignore the generated top-level `android/` folder**

Open `.gitignore` and add the line `android/` right after the existing `ios/` line. The file should contain (in order):

```
node_modules/
.expo/
dist/
npm-debug.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
.DS_Store
ios/
android/
.env*
```

Note: `modules/atv-cert/android/` is NOT ignored — that line only matches a top-level `android/` directory (the generated one from `expo prebuild`).

- [ ] **Step 7: Verify our hand-written Kotlin paths are not gitignored**

```bash
git check-ignore -v modules/atv-cert/android/build.gradle
```

Expected: empty output (means the file is NOT ignored). If the command prints a rule, the gitignore is too broad — adjust it to `/android/` (leading slash anchors it to root).

- [ ] **Step 8: Commit the scaffolding**

```bash
git add modules/atv-cert/android/ modules/atv-cert/expo-module.config.json .gitignore
git commit -m "$(cat <<'EOF'
feat(android): scaffold atv-cert Kotlin module

Add empty build.gradle, AndroidManifest, and directory structure for the
Android side of the atv-cert module. Register the platform in
expo-module.config.json. Add top-level android/ to .gitignore (matches how
ios/ is handled — generated by expo prebuild).

No Kotlin implementation yet — that comes in the next tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement `AtvCertModule.kt`

**Files:**
- Create: `modules/atv-cert/android/src/main/java/expo/modules/atvcert/AtvCertModule.kt`

This file mirrors `modules/atv-cert/ios/AtvCertModule.swift`. Same single function `installIdentity(p12Base64, password, alias) -> Boolean`. Same error semantics — bad input throws, success returns true.

- [ ] **Step 1: Write the full Kotlin file**

```kotlin
package expo.modules.atvcert

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.KeyStore

private const val PREFS_NAME = "atv_cert_store"

private class BadBase64Exception :
  CodedException("ERR_BAD_BASE64", "PKCS#12 base64 decode failed", null)

private class ImportFailedException(cause: Throwable) :
  CodedException("ERR_IMPORT_FAILED", "PKCS#12 import failed: ${cause.message}", cause)

private class NoIdentityException :
  CodedException("ERR_NO_IDENTITY", "PKCS#12 imported but contained no identity", null)

private class VerifyFailedException :
  CodedException("ERR_VERIFY_FAILED", "Identity lookup by alias after install failed", null)

private class NoContextException :
  CodedException("ERR_NO_CONTEXT", "Android Context unavailable", null)

class AtvCertModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AtvCert")

    AsyncFunction("installIdentity") { p12Base64: String, password: String, alias: String ->
      val context: Context = appContext.reactContext ?: throw NoContextException()

      val p12Bytes = try {
        Base64.decode(p12Base64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        throw BadBase64Exception()
      }

      // Validate that the P12 can be loaded and contains an identity.
      val keyStore = KeyStore.getInstance("PKCS12")
      try {
        keyStore.load(ByteArrayInputStream(p12Bytes), password.toCharArray())
      } catch (e: Exception) {
        throw ImportFailedException(e)
      }

      val hasIdentity = keyStore.aliases().toList().any { keyStore.isKeyEntry(it) }
      if (!hasIdentity) throw NoIdentityException()

      val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

      val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )

      val payload = JSONObject().apply {
        put("p12Base64", p12Base64)
        put("password", password)
      }
      prefs.edit().putString(alias, payload.toString()).apply()

      // Verify round-trip.
      if (prefs.getString(alias, null) == null) throw VerifyFailedException()

      android.util.Log.i("AtvCert", "Installed identity alias=$alias bytes=${p12Bytes.size}")
      true
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/atv-cert/android/src/main/java/expo/modules/atvcert/AtvCertModule.kt
git commit -m "$(cat <<'EOF'
feat(android): implement AtvCertModule (Kotlin)

Mirrors ios/AtvCertModule.swift. Validates the PKCS#12, then persists the
raw bytes + password into EncryptedSharedPreferences keyed by alias.

Errors throw CodedException with stable codes (ERR_BAD_BASE64,
ERR_IMPORT_FAILED, ERR_NO_IDENTITY, ERR_VERIFY_FAILED) so JS error handling
works identically on both platforms.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `AtvTlsModule.kt`

**Files:**
- Create: `modules/atv-cert/android/src/main/java/expo/modules/atvcert/AtvTlsModule.kt`

This file mirrors `modules/atv-cert/ios/AtvTlsModule.swift`. Provides `connect`, `send`, `close` functions and emits `connect`, `data`, `close`, `error` events.

Key behaviors (from the spec):

- `connect()` validates inputs synchronously (throws if bad), then dispatches socket work to a background executor.
- Trust manager accepts ANY server cert (Sony TVs use self-signed); captures the leaf cert.
- For port 6467 (pairing), if the peer cert is missing after handshake, emits an `error` event with the message `"TV public key unavailable for pairing"`. For port 6466, missing peer cert is acceptable (emits empty `peerCertBase64`).
- Reader thread loops on `inputStream.read(...)`, emitting `data` for each chunk and `close` on EOF.
- All socket I/O runs off the JS bridge thread (never on main thread — would crash with `NetworkOnMainThreadException`).

- [ ] **Step 1: Write the full Kotlin file**

```kotlin
package expo.modules.atvcert

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

private class TlsBadBase64Exception :
  CodedException("ERR_BAD_BASE64", "Bad base64 input", null)

private class TlsImportFailedException(cause: Throwable) :
  CodedException("ERR_IMPORT_FAILED", "SecPKCS12Import failed: ${cause.message}", cause)

private class NoConnectionException :
  CodedException("ERR_NO_CONNECTION", "Unknown connection ID", null)

private class ConnectionHolder(
  val socket: SSLSocket,
  val peerCertBytes: ByteArray?
) {
  @Volatile var alive: Boolean = true
}

class AtvTlsModule : Module() {
  private val connections = ConcurrentHashMap<String, ConnectionHolder>()
  private val ioExecutor = Executors.newCachedThreadPool()

  override fun definition() = ModuleDefinition {
    Name("AtvTls")

    Events("data", "connect", "close", "error")

    AsyncFunction("connect") { connectionId: String, host: String, port: Int, p12Base64: String, password: String ->
      // Validation that should reject the promise (mirrors iOS: badBase64 + importFailed throw).
      val p12Bytes = try {
        Base64.decode(p12Base64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        throw TlsBadBase64Exception()
      }

      val keyStore = KeyStore.getInstance("PKCS12")
      try {
        keyStore.load(ByteArrayInputStream(p12Bytes), password.toCharArray())
      } catch (e: Exception) {
        throw TlsImportFailedException(e)
      }

      val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
      kmf.init(keyStore, password.toCharArray())

      // Slot for the trust manager to drop the captured leaf cert into.
      val peerCertSlot = arrayOfNulls<ByteArray>(1)

      val trustAll = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
          chain?.firstOrNull()?.let { peerCertSlot[0] = it.encoded }
        }
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
      }

      val sslContext = SSLContext.getInstance("TLS")
      sslContext.init(kmf.keyManagers, arrayOf(trustAll), SecureRandom())

      // Socket I/O happens off the JS bridge thread.
      ioExecutor.execute {
        val socket: SSLSocket = try {
          (sslContext.socketFactory.createSocket(host, port) as SSLSocket).apply {
            startHandshake()
          }
        } catch (e: Exception) {
          android.util.Log.w("AtvTls", "Handshake failed: ${e.message}")
          sendEvent("error", mapOf(
            "connectionId" to connectionId,
            "message" to (e.message ?: "TLS handshake failed")
          ))
          return@execute
        }

        val peerCert = peerCertSlot[0]

        // Port 6467 (pairing) must have a captured peer cert; matches iOS verify-block behavior.
        if (peerCert == null && port == 6467) {
          try { socket.close() } catch (_: Exception) {}
          sendEvent("error", mapOf(
            "connectionId" to connectionId,
            "message" to "TV public key unavailable for pairing"
          ))
          return@execute
        }

        val holder = ConnectionHolder(socket, peerCert)
        connections[connectionId] = holder

        sendEvent("connect", mapOf(
          "connectionId" to connectionId,
          "peerCertBase64" to (peerCert?.let { Base64.encodeToString(it, Base64.NO_WRAP) } ?: "")
        ))

        // Spawn the reader.
        ioExecutor.execute {
          val input = socket.inputStream
          val buf = ByteArray(65536)
          try {
            while (holder.alive) {
              val n = input.read(buf)
              if (n < 0) {
                sendEvent("close", mapOf("connectionId" to connectionId))
                connections.remove(connectionId)
                return@execute
              }
              if (n > 0) {
                val data = buf.copyOf(n)
                sendEvent("data", mapOf(
                  "connectionId" to connectionId,
                  "dataBase64" to Base64.encodeToString(data, Base64.NO_WRAP)
                ))
              }
            }
          } catch (e: Exception) {
            if (holder.alive) {
              sendEvent("error", mapOf(
                "connectionId" to connectionId,
                "message" to (e.message ?: "I/O error")
              ))
            }
            connections.remove(connectionId)
          }
        }
      }
    }

    AsyncFunction("send") { connectionId: String, dataBase64: String ->
      val holder = connections[connectionId] ?: throw NoConnectionException()
      val bytes = try {
        Base64.decode(dataBase64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        throw TlsBadBase64Exception()
      }
      ioExecutor.execute {
        try {
          val out = holder.socket.outputStream
          out.write(bytes)
          out.flush()
        } catch (e: Exception) {
          if (holder.alive) {
            sendEvent("error", mapOf(
              "connectionId" to connectionId,
              "message" to (e.message ?: "Send failed")
            ))
          }
        }
      }
    }

    AsyncFunction("close") { connectionId: String ->
      val holder = connections.remove(connectionId) ?: return@AsyncFunction
      holder.alive = false
      try { holder.socket.close() } catch (_: Exception) {}
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/atv-cert/android/src/main/java/expo/modules/atvcert/AtvTlsModule.kt
git commit -m "$(cat <<'EOF'
feat(android): implement AtvTlsModule (Kotlin)

Mirrors ios/AtvTlsModule.swift. Uses javax.net.ssl SSLSocket with a
KeyManagerFactory loaded from the user's PKCS12 and an X509TrustManager
that accepts any server cert (Sony TVs are self-signed) while capturing
the leaf cert for the connect event.

All socket I/O runs on a cached thread pool — never on the main thread.
Connection state lives in a ConcurrentHashMap keyed by connectionId.

For port 6467 (pairing) only, missing peer cert is treated as an error,
matching the iOS verify-block fallback. For port 6466 (remote), an empty
peerCertBase64 is emitted, also matching iOS.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Generate the Android project and verify Kotlin compiles

This task does no editing — it's a compilation gate. The goal is to catch syntax errors, missing imports, or wrong Gradle config BEFORE we try to install on a device.

- [ ] **Step 1: Generate the top-level Android project**

```bash
npx expo prebuild --platform android --clean
```

Expected:
- A new top-level `android/` directory.
- The command prints "✔ Created native directory".
- No errors about `atv-cert`.

If you see `Unable to resolve module` or `atv-cert not found`, double-check that `modules/atv-cert/package.json` still lists `expo` as a module exporter — it should, because we didn't change that file.

- [ ] **Step 2: Verify Expo autolinking picked up our Android module**

```bash
grep -r "expo.modules.atvcert" android/app/src/main/java/ android/settings.gradle android/app/build.gradle 2>/dev/null | head
```

Expected: at least one reference (Expo's `ExpoModulesPackage` generated file should list our two classes).

If empty, the platform registration in `expo-module.config.json` is wrong — re-verify Task 1 Step 5.

- [ ] **Step 3: Compile the Android project (without installing)**

```bash
cd android
./gradlew :app:assembleDebug
cd ..
```

Expected: `BUILD SUCCESSFUL` at the end. First run will take 5-10 minutes (downloads Gradle, Android SDK packages).

If the build fails:
- **Kotlin syntax error** → re-read the error, fix the offending line in the Kotlin file, re-run.
- **`Unresolved reference: MasterKey`** → bump `androidx.security:security-crypto` to `1.1.0-alpha06` (already in our build.gradle — verify it's there).
- **`Cannot find symbol class CodedException`** → confirm `expo-modules-core` is the module name in the dependencies block.
- **`Compose / Kotlin version mismatch`** → run `npx expo install --fix` once and retry.

- [ ] **Step 4: If you had to fix anything, commit the fix**

```bash
git status
# If modules/atv-cert/android/ has changes:
git add modules/atv-cert/android/
git commit -m "fix(android): compile error in atv-cert module"
```

If nothing changed, skip this step.

---

## Task 5: VERIFICATION GATE — Phase 1 — UI launches on Android phone

**You will need:**
- An Android phone with USB debugging enabled (Settings → About phone → tap "Build number" 7 times → back → Developer options → USB debugging ON).
- A USB cable.
- Android Studio installed (only needed for the SDK + ADB; you don't actually open it for this step).

- [ ] **Step 1: Connect phone and verify ADB sees it**

```bash
adb devices
```

Expected: one line listing the phone's ID followed by `device`. If `unauthorized`, accept the popup on the phone.

If `adb` is not found, add Android Studio's platform-tools to PATH:

```bash
echo 'export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"' >> ~/.zshrc
source ~/.zshrc
adb devices
```

- [ ] **Step 2: Install and run the app**

```bash
npx expo run:android
```

Expected:
- Gradle build runs (cached from Task 4, should be faster — under 2 min).
- App installs and launches on the phone automatically.
- Metro bundler also starts in the terminal.

- [ ] **Step 3: Manual UI checks on the phone**

Confirm each of these works. Tick the checkbox only after you've actually verified on the device:

- [ ] App launches to the Remote screen without crashing.
- [ ] Tap the gear icon → Settings screen opens.
- [ ] Type a fake IP (e.g. `192.168.1.99`) and tap Save. Close and reopen the app — the IP persists. (Confirms `SecureStore` works on Android.)
- [ ] Tap "Pair with TV" → Pairing screen opens (will fail to connect since fake IP — that's expected for now).
- [ ] No red error screen ("Module not found", "Unable to load script", or similar).

If anything fails, capture the logcat output:

```bash
adb logcat -d | grep -iE "(atvcert|atvtls|fatal|androidruntime)" | tail -50
```

Diagnose the failure before continuing.

- [ ] **Step 4: Commit a "phase 1 verified" marker (optional but useful for the git history)**

Skip if nothing changed. If you fixed anything in this task:

```bash
git status
git add <files>
git commit -m "fix(android): phase 1 verification fixes"
```

---

## Task 6: VERIFICATION GATE — Phase 2 — pairing + remote control work end-to-end

**You will need:**
- The Android phone and Sony Bravia TV on the **same WiFi network**.
- The TV's IP address (TV menu → Network → View Network Status).
- The TV powered on (not in deep sleep — toggle "Remote start" in TV network settings if needed).

- [ ] **Step 1: Open the app, enter the real TV IP**

In Settings, replace the fake IP with the real one, then tap "Pair with TV".

- [ ] **Step 2: Verify the pairing flow**

Confirm each:

- [ ] The TV displays a 6-character pairing code on its screen.
- [ ] Typing the code into the app advances to the Remote screen.
- [ ] No "TV closed pairing connection", no "Pairing failed: status 400".

If pairing fails, capture logs:

```bash
adb logcat -d | grep -iE "(atvcert|atvtls)" | tail -100
```

Common pairing failures and root causes (already-known from iOS development):
- "TV closed pairing connection" → cert/key mismatch in TLS handshake. Usually means PKCS12 wasn't built correctly on Android. Check that `node-forge` cert generation on the JS side worked.
- "TV public key unavailable for pairing" → our trust manager didn't capture the leaf cert. Check Kotlin logs for the `checkServerTrusted` callback.
- "Connection refused" → wrong IP, or TV's TLS port (6467) is blocked.

- [ ] **Step 3: Verify remote control works**

On the Remote screen, tap each:

- [ ] Volume Up → TV volume goes up.
- [ ] Volume Down → TV volume goes down.
- [ ] D-Pad arrows → cursor on TV moves.
- [ ] Home → TV goes to home screen.
- [ ] Channel Up / Down → channel changes (only if TV has tuner active).

- [ ] **Step 4: Verify connection survival**

Leave the app open on the Remote screen for 5+ minutes. Confirm the connection state stays "connected" (no toast about reconnection). This proves the ping/pong loop on port 6466 works correctly.

If the connection drops, that's a `data` event handling issue. Inspect logcat for `RemoteError` codes.

- [ ] **Step 5: Re-launch test**

Force-close the app, reopen it. The Remote screen should auto-connect WITHOUT a re-pair (cert is persisted in EncryptedSharedPreferences).

If it asks you to re-pair, the persistence layer in `AtvCertModule` isn't being read back by the JS side. Check `src/context/SettingsContext.tsx` for how it loads the cert — likely a SecureStore call that needs to also work on Android (`expo-secure-store` does work on Android out of the box, but verify).

- [ ] **Step 6: Commit any fixes made during Phase 2**

```bash
git status
git add <files>
git commit -m "fix(android): phase 2 verification fixes"
```

---

## Task 7: Update README.md and CLAUDE.md

Only do this AFTER Tasks 5 and 6 both pass.

- [ ] **Step 1: Add an "Android" section to `README.md`**

Open `README.md` and add this new section between the existing "First run on a real iPhone" section and the "In the app" section. Match the README's existing tone — plain English, plain numbered steps, no jargon:

```markdown
### Get the app on an Android phone

1. **Install Android Studio** — free from https://developer.android.com/studio. Big download (~5 GB). When the install wizard runs, accept the default SDKs.

2. **Enable USB debugging on the phone:**
   - Open Settings → About phone.
   - Tap "Build number" 7 times until it says "You are now a developer."
   - Back out to Settings → System → Developer options.
   - Turn ON "USB debugging."

3. **Plug the phone into the Mac with a USB cable.** Accept the "Allow USB debugging?" popup on the phone.

4. **From the project folder, run:**

   ```bash
   npx expo prebuild --platform android --clean
   npx expo run:android
   ```

   First run takes a while (downloads Gradle, builds the app). The app installs and launches automatically.

5. **Pair with the TV** the same way as on iOS — Settings → enter TV IP → Pair with TV → type the 6-character code from the TV.

The Android version works on Android 7.0 and newer (API 24+).
```

- [ ] **Step 2: Update `CLAUDE.md` architecture section**

Open `CLAUDE.md`. Find the block describing `modules/atv-cert/`:

```
modules/atv-cert/                 Native module
├── index.ts                      JS-side facade (AtvCert + AtvTlsConnection class)
└── ios/                          Swift sources — uses Network.framework + Keychain
```

Replace it with:

```
modules/atv-cert/                 Native module (both platforms)
├── index.ts                      JS-side facade — same API, Expo routes to iOS or Android
├── ios/                          Swift sources — Network.framework + iOS Keychain
└── android/                      Kotlin sources — javax.net.ssl.SSLSocket + EncryptedSharedPreferences
```

Then, in the "What NOT to do" section, add this line:

```
- Don't divergence the JS interface between Swift and Kotlin — every `AsyncFunction` and `Events(...)` declaration must match by name and parameter order across both platforms. Mismatch only fails on the affected platform.
```

- [ ] **Step 3: Commit the docs**

```bash
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document Android setup and updated module architecture

README gets a parallel "Get the app on an Android phone" section.
CLAUDE.md's architecture section now reflects that modules/atv-cert/
has both ios/ and android/ implementations behind the same JS facade.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Merge to master

- [ ] **Step 1: Verify the branch is clean and all gates pass**

```bash
git status
git log --oneline feat/android-support ^master
```

Expected: clean working tree; the log shows the commits from Tasks 1, 2, 3, (possibly 4), 5/6 fixes, and 7.

- [ ] **Step 2: Merge to master**

```bash
git checkout master
git merge --no-ff feat/android-support -m "$(cat <<'EOF'
feat: add Android platform support

Kotlin port of modules/atv-cert/ios under modules/atv-cert/android.
Mirrors the iOS Swift module's JS interface, event shapes, and error
codes 1:1 so the existing JS layer (src/api/, src/screens/, etc.) works
unchanged on both platforms.

Verified end-to-end on a real Android phone:
- UI renders on all three screens
- Pairing with a Sony Bravia TV completes
- Volume / D-pad / channel buttons control the TV
- Connection survives 5+ minute ping/pong window
- Cert persists across app restart

Refs spec: docs/superpowers/specs/2026-06-17-android-support-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Confirm the merge**

```bash
git log --oneline -5
```

Expected: a merge commit on top, with the feature commits below.

- [ ] **Step 4: (Optional) delete the feature branch locally**

```bash
git branch -d feat/android-support
```

(Don't push to remote unless the user explicitly asks.)

---

## What gets touched and what doesn't

**Untouched (by design):**
- All of `src/` — TS/TSX is platform-agnostic.
- All of `modules/atv-cert/ios/` — Swift side stays as-is.
- `modules/atv-cert/index.ts` — JS facade already does the right thing.
- `App.tsx`, `index.ts`, `app.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`.

**Touched:**
- 5 new files under `modules/atv-cert/android/`.
- 4 edits: `expo-module.config.json`, `.gitignore`, `README.md`, `CLAUDE.md`.

That's the entire footprint of adding Android support.
