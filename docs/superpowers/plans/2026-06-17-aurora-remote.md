# Aurora Remote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a premium Aurora-Glass Remote screen with auto-discovery of Sony Bravia / Android TVs via mDNS, streaming launch tiles (Netflix / YouTube / Prime), and the TV's model name as the header title.

**Architecture:** A new isolated native module (`modules/atv-discovery/`) handles mDNS browse on iOS (`NWBrowser`) and Android (`NsdManager`). A JS facade (`atvDiscovery.ts`) exposes a subscribe-style API. The existing `atv-cert` module and pairing flow are untouched. The Remote screen is rewritten with new presentation primitives (`AuroraBackground`, `GlassButton`, `BottomSheet`, `TVPickerSheet`, `StreamingTile`) and a single existing protocol addition (`AtvRemoteSession.launchApp`).

**Tech Stack:** React Native 0.81.5, Expo SDK 54, TypeScript 5.3, `expo-linear-gradient`, `expo-blur`, Swift (Network.framework `NWBrowser`), Kotlin (`android.net.nsd.NsdManager`).

**Spec:** [docs/superpowers/specs/2026-06-17-aurora-remote-design.md](../specs/2026-06-17-aurora-remote-design.md)

**Reference:** No unit tests in this plan — matches the iOS Swift / Android Kotlin baseline in this repo. Verification gates are explicit and labeled USER GATE.

---

## File Structure (everything new or changed)

| File | Action | Purpose |
|---|---|---|
| `package.json` | modify | Add `expo-linear-gradient`, `expo-blur` |
| `tmp_pairing.py` | delete | Stray file from a prior debug session, not part of the project |
| `.gitignore` | modify | Ignore `modules/*/android/build/` so gradle artifacts don't dirty `git status` |
| `src/api/atvClient.ts` | modify | Add `launchApp(uri)`, `currentDeviceInfo`, and `onDeviceInfo` listener |
| `src/screens/PairingScreen.tsx` | modify | Already has uncommitted polish from earlier pairing work; commit as-is |
| `src/api/atvDiscovery.ts` | create | JS facade for the discovery native module |
| `src/theme/colors.ts` | modify | Add aurora gradient colors + glass tokens |
| `src/components/AuroraBackground.tsx` | create | Gradient backdrop layer |
| `src/components/GlassButton.tsx` | create | Frosted-glass button base used everywhere |
| `src/components/BottomSheet.tsx` | create | Reusable Aurora-Glass bottom sheet (Modal + slide animation) |
| `src/components/TVPickerSheet.tsx` | create | TV list inside `BottomSheet`, with manual-IP fallback |
| `src/components/StreamingTile.tsx` | create | One branded streaming app tile |
| `src/components/DPad.tsx` | modify | Restyle inner buttons + gradient OK |
| `src/components/Rocker.tsx` | modify | Glass restyle |
| `src/screens/RemoteScreen.tsx` | rewrite | Aurora Glass layout per the mockup |
| `src/context/SettingsContext.tsx` | modify | Add `discoveredTvs`, `connectedDeviceInfo` |
| `modules/atv-discovery/package.json` | create | npm package metadata |
| `modules/atv-discovery/expo-module.config.json` | create | Expo platform registration |
| `modules/atv-discovery/index.ts` | create | `AtvDiscovery` JS facade — `requireNativeModule('AtvDiscovery')` |
| `modules/atv-discovery/ios/AtvDiscovery.podspec` | create | CocoaPods spec |
| `modules/atv-discovery/ios/AtvDiscoveryModule.swift` | create | `NWBrowser` implementation |
| `modules/atv-discovery/android/build.gradle` | create | Gradle module config |
| `modules/atv-discovery/android/src/main/AndroidManifest.xml` | create | Declares `CHANGE_WIFI_MULTICAST_STATE` |
| `modules/atv-discovery/android/src/main/java/expo/modules/atvdiscovery/AtvDiscoveryModule.kt` | create | `NsdManager` implementation |
| `app.json` | no change | iOS Bonjour service `_androidtvremote2._tcp` is already declared |

---

## Task 1: Cleanup loose ends from pairing work

**Files:**
- Modify: `.gitignore`
- Delete: `tmp_pairing.py`
- Commit: `src/api/atvClient.ts` (already-uncommitted nonce + protocol fix)
- Commit: `src/screens/PairingScreen.tsx` (already-uncommitted polish)

The branch has uncommitted pairing fixes (HEX/6 protocol fix, missing `status: 200` on the secret message, the nonce-extraction fix that Gemini contributed). These need to land before any new work, in their own commit, so the Aurora work starts clean.

- [ ] **Step 1: Verify the current uncommitted state**

```bash
git status
git diff src/api/atvClient.ts src/screens/PairingScreen.tsx | head -80
```

Expected: shows modifications to those two files plus the untracked `tmp_pairing.py` and `modules/atv-cert/android/build/`.

- [ ] **Step 2: Add gradle build dir to `.gitignore`**

Open `.gitignore` and append a new line (after `.superpowers/`):

```
modules/*/android/build/
```

Final file should now read:

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
/ios/
/android/
.env*
.superpowers/
modules/*/android/build/
```

- [ ] **Step 3: Delete the stray pairing debug script**

```bash
rm tmp_pairing.py
git status
```

Expected: `tmp_pairing.py` no longer in untracked list.

- [ ] **Step 4: Commit the pairing fixes**

```bash
git add src/api/atvClient.ts src/screens/PairingScreen.tsx .gitignore
git commit -m "$(cat <<'EOF'
fix(pairing): handle 6-symbol pairing codes for Sony Bravia

Three protocol-level fixes that together make pairing succeed against
Bravia models that advertise outputEncodings = HEXADECIMAL/6:

1. sendPairingOption and sendPairingConfiguration now offer
   symbolLength: 6 (was 4). This matches the TV's actual capability and
   gets us past the previous STATUS_BAD_CONFIGURATION (401).

2. submitCode now extracts the nonce as everything after the first byte
   (slice(2) → 2 bytes for HEX/6 codes), not just the last byte
   (slice(-2) → 1 byte). The TV computes the verification hash over the
   full nonce; truncating it produced a mismatch and STATUS_ERROR (400).

3. submitCode now sends protocolVersion + status: STATUS_OK on the
   PairingSecret message. Without these the wire encoding defaulted to
   status: 0 (UNKNOWN) and Sony's firmware rejected the message.

Also commits incidental polish in PairingScreen.tsx from the same
debugging session.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git log --oneline -3
```

Expected: a new commit on top of the branch, working tree clean except for `modules/atv-cert/android/build/` (now ignored by the new rule).

- [ ] **Step 5: Verify the working tree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If `modules/atv-cert/android/build/` still appears, the gitignore rule isn't matching — re-check its exact form.

---

## Task 2: Add new dependencies

**Files:**
- Modify: `package.json` (via `npx expo install`)

- [ ] **Step 1: Install both packages via Expo's installer**

```bash
npx expo install expo-linear-gradient expo-blur
```

Expected: `package.json` updated with both packages at versions compatible with Expo SDK 54. No errors.

- [ ] **Step 2: Verify they're listed**

```bash
grep -E "expo-(linear-gradient|blur)" package.json
```

Expected: two lines, one per package.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
deps: add expo-linear-gradient and expo-blur for Aurora Glass UI

expo-linear-gradient renders the aurora backdrop (three radial blobs).
expo-blur powers the frosted-glass BlurView used in BottomSheet and
panels. Both are first-party Expo packages compatible with SDK 54.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Scaffold `modules/atv-discovery/`

**Files:**
- Create: `modules/atv-discovery/package.json`
- Create: `modules/atv-discovery/expo-module.config.json`
- Create: `modules/atv-discovery/index.ts`
- Create: `modules/atv-discovery/ios/AtvDiscovery.podspec`
- Create: `modules/atv-discovery/android/build.gradle`
- Create: `modules/atv-discovery/android/src/main/AndroidManifest.xml`
- Create the directory trees: `modules/atv-discovery/ios/`, `modules/atv-discovery/android/src/main/java/expo/modules/atvdiscovery/`

This task only creates the module skeleton. Swift and Kotlin implementations come in Tasks 4 and 5.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p modules/atv-discovery/ios
mkdir -p modules/atv-discovery/android/src/main/java/expo/modules/atvdiscovery
ls modules/atv-discovery/
```

Expected: `android` and `ios` directories listed.

- [ ] **Step 2: Write `modules/atv-discovery/package.json`**

```json
{
  "name": "atv-discovery",
  "version": "0.1.0",
  "description": "mDNS discovery of Android TV / Sony Bravia devices on the local network",
  "main": "index.ts",
  "types": "index.ts",
  "private": true
}
```

- [ ] **Step 3: Write `modules/atv-discovery/expo-module.config.json`**

```json
{
  "platforms": ["ios", "android"],
  "ios": {
    "modules": ["AtvDiscoveryModule"]
  },
  "android": {
    "modules": ["expo.modules.atvdiscovery.AtvDiscoveryModule"]
  }
}
```

- [ ] **Step 4: Write `modules/atv-discovery/index.ts`**

```typescript
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
```

- [ ] **Step 5: Write `modules/atv-discovery/ios/AtvDiscovery.podspec`**

```ruby
Pod::Spec.new do |s|
  s.name           = 'AtvDiscovery'
  s.version        = '0.1.0'
  s.summary        = 'mDNS discovery of Android TV / Sony Bravia devices'
  s.description    = 'Uses Network.framework NWBrowser to discover _androidtvremote2._tcp services on the local Wi-Fi.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
```

- [ ] **Step 6: Write `modules/atv-discovery/android/build.gradle`**

```gradle
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'

group = 'expo.modules.atvdiscovery'
version = '0.1.0'

def expoModulesCorePlugin = new File(project(":expo-modules-core").projectDir.absolutePath, "ExpoModulesCorePlugin.gradle")
apply from: expoModulesCorePlugin
applyKotlinExpoModulesCorePlugin()
useCoreDependencies()
useExpoPublishing()
useDefaultAndroidSdkVersions()

android {
  namespace "expo.modules.atvdiscovery"
  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }
}

dependencies {
  implementation project(':expo-modules-core')
}
```

- [ ] **Step 7: Write `modules/atv-discovery/android/src/main/AndroidManifest.xml`**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
</manifest>
```

- [ ] **Step 8: Register the module in the app**

Open `package.json` and add this entry to the `dependencies` block (keep it alphabetized):

```json
"atv-discovery": "file:./modules/atv-discovery",
```

Then run:

```bash
npm install
```

Expected: silent success, no errors. `atv-discovery` symlinked under `node_modules/atv-discovery` pointing at the new local module directory.

- [ ] **Step 9: Commit**

```bash
git add modules/atv-discovery/ package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(discovery): scaffold atv-discovery Expo module

New native module that will browse for _androidtvremote2._tcp services
via Bonjour (iOS) and NSD (Android). This commit lays down only the
module shell — JS facade, podspec, build.gradle, manifest. The actual
Swift and Kotlin implementations follow in the next two tasks.

Kept separate from atv-cert so the working pairing module stays
isolated from new discovery code.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement iOS discovery (Swift)

**Files:**
- Create: `modules/atv-discovery/ios/AtvDiscoveryModule.swift`

- [ ] **Step 1: Write the full Swift file**

```swift
import ExpoModulesCore
import Network
import Foundation

public class AtvDiscoveryModule: Module {
  private var browser: NWBrowser?
  private let queue = DispatchQueue(label: "com.bsista.atvdiscovery")
  private var resolvedNames: Set<String> = []

  public func definition() -> ModuleDefinition {
    Name("AtvDiscovery")

    Events("serviceFound", "serviceLost")

    AsyncFunction("startDiscovery") { (promise: Promise) in
      self.queue.async {
        self.browser?.cancel()
        self.resolvedNames.removeAll()

        let parameters = NWParameters.tcp
        parameters.includePeerToPeer = false

        let descriptor = NWBrowser.Descriptor.bonjour(
          type: "_androidtvremote2._tcp",
          domain: nil
        )
        let browser = NWBrowser(for: descriptor, using: parameters)

        browser.browseResultsChangedHandler = { results, _ in
          for result in results {
            self.handleResult(result)
          }

          let currentNames = Set(results.compactMap { result -> String? in
            if case let .service(name, _, _, _) = result.endpoint {
              return name
            }
            return nil
          })
          let lost = self.resolvedNames.subtracting(currentNames)
          for lostName in lost {
            self.sendEvent("serviceLost", ["name": lostName])
            self.resolvedNames.remove(lostName)
          }
        }

        browser.stateUpdateHandler = { state in
          NSLog("[AtvDiscovery] state=\(state)")
        }

        self.browser = browser
        browser.start(queue: self.queue)
        promise.resolve(nil)
      }
    }

    AsyncFunction("stopDiscovery") { (promise: Promise) in
      self.queue.async {
        self.browser?.cancel()
        self.browser = nil
        self.resolvedNames.removeAll()
        promise.resolve(nil)
      }
    }
  }

  private func handleResult(_ result: NWBrowser.Result) {
    guard case let .service(name, _, _, _) = result.endpoint else { return }
    if resolvedNames.contains(name) { return }

    // Resolve the endpoint to a host + port via NWConnection (start + immediately cancel).
    let connection = NWConnection(to: result.endpoint, using: .tcp)
    connection.stateUpdateHandler = { state in
      if case .ready = state {
        if let endpoint = connection.currentPath?.remoteEndpoint,
           case let .hostPort(host, port) = endpoint {
          let hostString = self.formatHost(host)
          self.resolvedNames.insert(name)
          self.sendEvent("serviceFound", [
            "name": name,
            "host": hostString,
            "port": Int(port.rawValue),
          ])
        }
        connection.cancel()
      } else if case .failed = state {
        connection.cancel()
      }
    }
    connection.start(queue: queue)
  }

  private func formatHost(_ host: NWEndpoint.Host) -> String {
    switch host {
    case .ipv4(let addr):
      return addr.debugDescription.components(separatedBy: "%").first ?? addr.debugDescription
    case .ipv6(let addr):
      return addr.debugDescription.components(separatedBy: "%").first ?? addr.debugDescription
    case .name(let s, _):
      return s
    @unknown default:
      return ""
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/atv-discovery/ios/AtvDiscoveryModule.swift
git commit -m "$(cat <<'EOF'
feat(discovery): implement iOS Bonjour discovery (Swift)

NWBrowser scans for _androidtvremote2._tcp services on the local Wi-Fi.
Each result is resolved to a concrete host+port by briefly opening an
NWConnection — the cleanest way to extract the resolved endpoint without
a deprecated NetService bridge. A serviceLost event fires whenever a
previously-seen name disappears from the result set.

The Bonjour service type is already declared in app.json under
NSBonjourServices, so no Info.plist edit is needed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement Android discovery (Kotlin)

**Files:**
- Create: `modules/atv-discovery/android/src/main/java/expo/modules/atvdiscovery/AtvDiscoveryModule.kt`

- [ ] **Step 1: Write the full Kotlin file**

```kotlin
package expo.modules.atvdiscovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

private const val SERVICE_TYPE = "_androidtvremote2._tcp."

private class NoContextException :
  CodedException("ERR_NO_CONTEXT", "Android Context unavailable", null)

class AtvDiscoveryModule : Module() {
  private val nsdManager: NsdManager by lazy {
    val context = appContext.reactContext ?: throw NoContextException()
    context.getSystemService(Context.NSD_SERVICE) as NsdManager
  }

  private var discoveryListener: NsdManager.DiscoveryListener? = null
  private val resolved = ConcurrentHashMap<String, NsdServiceInfo>()

  override fun definition() = ModuleDefinition {
    Name("AtvDiscovery")

    Events("serviceFound", "serviceLost")

    AsyncFunction("startDiscovery") {
      stopDiscoveryInternal()

      val listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {
          android.util.Log.i("AtvDiscovery", "discovery started")
        }

        override fun onDiscoveryStopped(serviceType: String) {
          android.util.Log.i("AtvDiscovery", "discovery stopped")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
          android.util.Log.w("AtvDiscovery", "startDiscovery failed: $errorCode")
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
          android.util.Log.w("AtvDiscovery", "stopDiscovery failed: $errorCode")
        }

        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
          resolveService(serviceInfo)
        }

        override fun onServiceLost(serviceInfo: NsdServiceInfo) {
          val name = serviceInfo.serviceName
          resolved.remove(name)
          sendEvent("serviceLost", mapOf("name" to name))
        }
      }

      nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
      discoveryListener = listener
    }

    AsyncFunction("stopDiscovery") {
      stopDiscoveryInternal()
    }
  }

  private fun stopDiscoveryInternal() {
    discoveryListener?.let {
      try {
        nsdManager.stopServiceDiscovery(it)
      } catch (_: Exception) {
        // already stopped
      }
    }
    discoveryListener = null
    resolved.clear()
  }

  private fun resolveService(info: NsdServiceInfo) {
    val name = info.serviceName
    if (resolved.containsKey(name)) return

    val resolveListener = object : NsdManager.ResolveListener {
      override fun onResolveFailed(failed: NsdServiceInfo, errorCode: Int) {
        android.util.Log.w("AtvDiscovery", "resolve failed: $errorCode for ${failed.serviceName}")
      }

      override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
        val host = resolvedInfo.host?.hostAddress ?: return
        resolved[name] = resolvedInfo
        sendEvent("serviceFound", mapOf(
          "name" to name,
          "host" to host,
          "port" to resolvedInfo.port,
        ))
      }
    }

    try {
      nsdManager.resolveService(info, resolveListener)
    } catch (e: IllegalArgumentException) {
      android.util.Log.w("AtvDiscovery", "resolve already in flight: ${e.message}")
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/atv-discovery/android/src/main/java/expo/modules/atvdiscovery/AtvDiscoveryModule.kt
git commit -m "$(cat <<'EOF'
feat(discovery): implement Android NSD discovery (Kotlin)

NsdManager browses for _androidtvremote2._tcp. on the local Wi-Fi.
Service-found events are deduplicated by serviceName; the resolveService
callback adds the host+port. Service-lost events propagate the name back
to JS so the picker can update.

Requires CHANGE_WIFI_MULTICAST_STATE — declared in the module's own
AndroidManifest.xml and merged into the app's manifest by Expo Modules.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: JS-side discovery client

**Files:**
- Create: `src/api/atvDiscovery.ts`

This sits on top of `modules/atv-discovery/index.ts` and maintains an observable list, deduplicates by `name`, and lets the UI subscribe.

- [ ] **Step 1: Write the file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/api/atvDiscovery.ts
git commit -m "$(cat <<'EOF'
feat(discovery): JS-side discovery store + useDiscoveredTVs hook

DiscoveryStore wraps the native module with a deduplicating map (keyed
by serviceName), a subscribe API for components, and a snapshot for
synchronous reads. The useDiscoveredTVs hook handles start/stop on
mount/unmount, so a screen only has to drop it in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extend `atvClient.ts` with `launchApp` and `onDeviceInfo`

**Files:**
- Modify: `src/api/atvClient.ts`

Two small additions to the existing `AtvRemoteSession`:

1. `launchApp(uri)` — sends a `RemoteAppLinkLaunchRequest` for the streaming tiles.
2. `currentDeviceInfo` + `onDeviceInfo` — exposes the TV's `RemoteConfigure.device_info` to the UI.

- [ ] **Step 1: Add the listener slot and device info property**

Find the `RemoteListener` interface in `src/api/atvClient.ts` (around line 270, depending on how the file has evolved). Add a new optional callback:

```typescript
export interface RemoteListener {
  onPower?: (on: boolean) => void;
  onVolume?: (level: number, max: number, muted: boolean) => void;
  onAppInfo?: (pkg: string) => void;
  onDeviceInfo?: (info: { model: string; vendor: string }) => void;   // ← NEW
  onConnect?: () => void;
  onDisconnect?: () => void;
}
```

Then in the `AtvRemoteSession` class, add a public property near where the existing state lives:

```typescript
public currentDeviceInfo: { model: string; vendor: string } | null = null;
```

In the message handler that processes incoming remote messages (look for the `if (obj.remoteConfigure)` branch — likely in `handleRemoteFrame` or similar), set the property and fire the listener after the existing code that already reads `remoteConfigure`:

```typescript
if (obj.remoteConfigure) {
  // existing handling (e.g., responding with RemoteSetActive) — leave intact
  const info = obj.remoteConfigure.deviceInfo;
  if (info && (info.model || info.vendor)) {
    const parsed = { model: info.model ?? '', vendor: info.vendor ?? '' };
    this.currentDeviceInfo = parsed;
    this.listener.onDeviceInfo?.(parsed);
  }
  return;
}
```

If the existing handler already destructures `obj.remoteConfigure`, just add the `currentDeviceInfo` + listener call inside that branch — don't duplicate the response logic.

- [ ] **Step 2: Add `launchApp` method**

In the same `AtvRemoteSession` class, add this method near the other public sending methods (e.g. right after `sendKey`):

```typescript
/** Launch a streaming app on the TV by URI (e.g. https://www.netflix.com/title). */
launchApp(uri: string): void {
  this.sendRemote({
    remoteAppLinkLaunchRequest: { appLink: uri },
  });
}
```

Note: `sendRemote` already exists in the class as the private helper that frames and writes a `RemoteMessage`. If it's named differently in your file (e.g. `sendRemoteMessage`), use that name instead — don't introduce a new helper.

- [ ] **Step 3: Confirm the protobuf field name**

Open `src/api/atvProto.ts` and confirm the protobuf has `RemoteAppLinkLaunchRequest` with an `app_link` field (protobufjs camel-cases to `appLink`). The remote message field number for it should be `90`:

```bash
grep -n "remote_app_link_launch_request\|RemoteAppLinkLaunchRequest\|app_link" src/api/atvProto.ts
```

Expected: at least three matches, including `remote_app_link_launch_request = 90;` in the `RemoteMessage` definition and an `app_link` string inside the request type.

If the field is missing — it isn't, the spec confirmed it exists — stop and raise it. Do not silently invent one.

- [ ] **Step 4: Commit**

```bash
git add src/api/atvClient.ts
git commit -m "$(cat <<'EOF'
feat(client): expose TV deviceInfo + add launchApp(uri)

onDeviceInfo fires when the TV's RemoteConfigure arrives, surfacing
{ model, vendor } so the Remote screen can replace its static title
with the actual TV model string (e.g. KD-55X8500F).

launchApp(uri) wraps the existing remote_app_link_launch_request
protobuf (field 90) — used by the new streaming tiles to deep-link into
Netflix / YouTube / Prime on the TV.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Extend `SettingsContext` with discovery state

**Files:**
- Modify: `src/context/SettingsContext.tsx`

Just two new pieces of state — the list of currently-visible TVs (for the picker) and the connected device info (for the title).

- [ ] **Step 1: Add to the context interface**

Open `src/context/SettingsContext.tsx`. Find the `SettingsContextValue` interface and add two fields:

```typescript
interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  paired: boolean;
  discoveredTvs: DiscoveredTV[];                           // ← NEW
  connectedDeviceInfo: { model: string; vendor: string } | null;  // ← NEW
  updateConnection: (patch: Partial<PlainSettings>) => Promise<void>;
  setCert: (certPem: string, keyPem: string) => Promise<void>;
  markPaired: (paired: boolean) => Promise<void>;
  clearCert: () => Promise<void>;
  setConnectedDeviceInfo: (info: { model: string; vendor: string } | null) => void;   // ← NEW
  setDiscoveredTvs: (tvs: DiscoveredTV[]) => void;          // ← NEW
}
```

Add the import at the top:

```typescript
import type { DiscoveredTV } from '../api/atvDiscovery';
```

- [ ] **Step 2: Add the state slots in `SettingsProvider`**

Inside the `SettingsProvider` function, add to the existing `useState` declarations:

```typescript
const [discoveredTvs, setDiscoveredTvs] = useState<DiscoveredTV[]>([]);
const [connectedDeviceInfo, setConnectedDeviceInfo] =
  useState<{ model: string; vendor: string } | null>(null);
```

- [ ] **Step 3: Expose them in the context value**

Find the `useMemo<SettingsContextValue>` block and add the new fields to the returned object:

```typescript
const value = useMemo<SettingsContextValue>(
  () => ({
    settings: { ...plain, certPem, keyPem },
    loaded,
    paired: pairingConfirmed && !!certPem && !!keyPem,
    discoveredTvs,
    connectedDeviceInfo,
    updateConnection,
    setCert,
    markPaired,
    clearCert,
    setConnectedDeviceInfo,
    setDiscoveredTvs,
  }),
  [
    plain, certPem, keyPem, loaded, pairingConfirmed,
    discoveredTvs, connectedDeviceInfo,
    updateConnection, setCert, markPaired, clearCert,
  ],
);
```

- [ ] **Step 4: Commit**

```bash
git add src/context/SettingsContext.tsx
git commit -m "$(cat <<'EOF'
feat(settings): track discoveredTvs and connectedDeviceInfo in context

The Remote screen will read discoveredTvs to populate the TV picker
sheet, and connectedDeviceInfo to render the TV model name in the
header title. Both update reactively — discoveredTvs from useDiscoveredTVs
(coming next), and connectedDeviceInfo from the AtvRemoteSession's
new onDeviceInfo listener.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Theme additions

**Files:**
- Modify: `src/theme/colors.ts`

- [ ] **Step 1: Add aurora + glass tokens**

Open `src/theme/colors.ts` and replace the whole `colors` object with the version below. Keep the existing `radius` and `spacing` exports as they are.

```typescript
export const colors = {
  // base / surface
  background: '#0B0B0F',
  surface: '#16161D',
  surfaceAlt: '#1F1F29',
  border: '#2A2A36',
  text: '#F2F2F5',
  textMuted: '#9A9AA8',

  // accents
  accent: '#4F8CFF',
  accentPurple: '#A855F7',
  accentPink: '#EC4899',
  power: '#3DDC84',
  danger: '#FF5C5C',
  warm: '#FFD66B',

  // brand
  netflix: '#E50914',
  netflixDark: '#8C000C',
  youtube: '#FF0000',
  youtubeDark: '#B40000',
  prime: '#00A8E1',
  primeDark: '#0064AA',

  // press state
  pressed: '#2E2E3D',

  // glass tokens — rgba so callers can compose alpha
  glassFill: 'rgba(255, 255, 255, 0.045)',
  glassFillStrong: 'rgba(255, 255, 255, 0.07)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBorderStrong: 'rgba(255, 255, 255, 0.16)',
  glassHighlight: 'rgba(255, 255, 255, 0.18)',
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/theme/colors.ts
git commit -m "$(cat <<'EOF'
feat(theme): add aurora gradient + glass tokens

Tokens added: accentPurple, accentPink, warm, brand colors for Netflix,
YouTube, Prime (light + dark for gradients), and a set of rgba
glassFill / glassBorder / glassHighlight values that callers can drop
straight into stylesheets.

Existing tokens kept verbatim so nothing else has to change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `AuroraBackground` component

**Files:**
- Create: `src/components/AuroraBackground.tsx`

- [ ] **Step 1: Write the component**

```typescript
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

interface Props {
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Aurora gradient backdrop — three soft radial-ish blobs of color
 * over the dark background. Use as the outermost wrapper of a screen.
 */
export function AuroraBackground({ children, style }: Props) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.accent}55`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={[styles.blob, styles.topLeft]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.accentPurple}50`, 'transparent']}
        start={{ x: 1, y: 1 }}
        end={{ x: 0.4, y: 0.4 }}
        style={[styles.blob, styles.bottomRight]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.accentPink}30`, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[styles.blob, styles.topRight]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  blob: {
    position: 'absolute',
  },
  topLeft: {
    top: -100,
    left: -100,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  bottomRight: {
    bottom: -150,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  topRight: {
    top: 80,
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
});
```

Note: `LinearGradient` does not render a true radial gradient, so the blobs are circular containers with a fading linear gradient inside — visually identical to the mockup once layered with opacity. No native code needed.

- [ ] **Step 2: Commit**

```bash
git add src/components/AuroraBackground.tsx
git commit -m "$(cat <<'EOF'
feat(ui): AuroraBackground gradient backdrop

Three soft tinted blobs (blue, purple, pink) over the dark base. Pure
React Native using expo-linear-gradient — no native code. Used as the
outermost wrapper of the Remote screen.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `GlassButton` component

**Files:**
- Create: `src/components/GlassButton.tsx`

A frosted-glass button that wraps the existing `RemoteButton` (so haptics, debounce, hold-repeat all keep working) and replaces its dark surface with translucent glass styling.

- [ ] **Step 1: Write the component**

```typescript
import React from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RemoteButton, type RemoteButtonProps } from './RemoteButton';
import { colors, radius } from '../theme/colors';

export type GlassVariant = 'default' | 'accent' | 'power' | 'danger';

type Props = Omit<RemoteButtonProps, 'bg' | 'textColor'> & {
  variant?: GlassVariant;
  borderless?: boolean;
};

/**
 * GlassButton — frosted-glass surface with optional variants. Behaviour
 * (press, haptics, hold-repeat, debounce) comes from RemoteButton.
 */
export function GlassButton({ variant = 'default', borderless, style, ...rest }: Props) {
  const textColor =
    variant === 'accent'
      ? '#FFFFFF'
      : variant === 'power'
      ? colors.power
      : variant === 'danger'
      ? '#FF6B6B'
      : colors.text;

  if (variant === 'accent') {
    return (
      <View style={[styles.accentWrap, style]}>
        <LinearGradient
          colors={[colors.accent, colors.accentPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <RemoteButton {...rest} bg="transparent" textColor={textColor} style={styles.transparent} />
      </View>
    );
  }

  return (
    <RemoteButton
      {...rest}
      bg={colors.glassFill}
      textColor={textColor}
      style={[styles.glass, borderless && styles.borderless, style]}
    />
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  borderless: {
    borderWidth: 0,
  },
  accentWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  transparent: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
```

This depends on `RemoteButton` exposing its prop type. Check that `src/components/RemoteButton.tsx` exports `RemoteButtonProps`. If it doesn't yet, add `export` to its existing interface declaration in a single character edit — don't modify the interface body.

- [ ] **Step 2: If `RemoteButtonProps` isn't exported, export it**

```bash
grep -n "interface RemoteButtonProps" src/components/RemoteButton.tsx
```

If the line reads `interface RemoteButtonProps` (no `export`), edit the file to make it `export interface RemoteButtonProps`. No other change.

- [ ] **Step 3: Commit**

```bash
git add src/components/GlassButton.tsx src/components/RemoteButton.tsx
git commit -m "$(cat <<'EOF'
feat(ui): GlassButton wraps RemoteButton with frosted-glass styling

Variants: default (translucent white over the aurora bg), accent
(blue->purple gradient — used for OK), power (green text on glass),
danger (red text on glass — used for the dedicated power-off button).
Press behaviour, haptics, debounce, hold-repeat all delegate to the
existing RemoteButton.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `BottomSheet` component

**Files:**
- Create: `src/components/BottomSheet.tsx`

Minimal reusable sheet built on React Native's `Modal` + `Animated`. No reanimated dependency, no gesture-handler — keeps the dep surface flat.

- [ ] **Step 1: Write the component**

```typescript
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Whether to dim the rest of the screen behind the sheet. Default true. */
  dim?: boolean;
  contentStyle?: ViewStyle;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function BottomSheet({ visible, onClose, children, dim = true, contentStyle }: Props) {
  const translate = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translate, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translate, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translate, backdrop]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {dim && (
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: backdrop }]}
          />
        )}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: translate }] },
            contentStyle,
          ]}
        >
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.handleBar} />
          <View style={styles.inner}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 15, 22, 0.55)',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  inner: {
    paddingHorizontal: spacing.lg,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BottomSheet.tsx
git commit -m "$(cat <<'EOF'
feat(ui): BottomSheet — reusable Aurora-Glass sheet

Modal + Animated slide-in; expo-blur BlurView for the frosted body.
No reanimated/gesture-handler — taps on the dimming backdrop close
the sheet. Used immediately by TVPickerSheet and re-usable for any
future modal flows.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `TVPickerSheet` component

**Files:**
- Create: `src/components/TVPickerSheet.tsx`

- [ ] **Step 1: Write the component**

```typescript
import React from 'react';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import type { DiscoveredTV } from '../api/atvDiscovery';
import { colors, radius, spacing } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  tvs: DiscoveredTV[];
  currentIp: string | null;
  onPick: (tv: DiscoveredTV) => void;
  onManualEntry: () => void;
}

export function TVPickerSheet({ visible, onClose, tvs, currentIp, onPick, onManualEntry }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {tvs.length === 0
            ? 'Searching for TVs…'
            : `Found ${tvs.length} TV${tvs.length === 1 ? '' : 's'} nearby`}
        </Text>
      </View>

      {tvs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wifi-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Make sure your TV is on the same Wi-Fi.{'\n'}This usually takes a few seconds.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tvs}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => {
            const selected = item.host === currentIp;
            return (
              <Pressable
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <View style={styles.tvIcon}>
                  <Ionicons name="tv-outline" size={20} color={colors.text} />
                </View>
                <View style={styles.tvInfo}>
                  <Text style={styles.tvName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.tvSub} numberOfLines={1}>
                    {item.host}:{item.port}
                  </Text>
                </View>
                {selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => {
          onManualEntry();
          onClose();
        }}
        style={styles.manualLink}
      >
        <Text style={styles.manualText}>
          Don't see it? <Text style={styles.manualAction}>Enter IP manually</Text>
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: spacing.sm,
  },
  rowSelected: {
    backgroundColor: 'rgba(79, 140, 255, 0.12)',
    borderColor: 'rgba(79, 140, 255, 0.4)',
  },
  tvIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassFillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvInfo: {
    flex: 1,
  },
  tvName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  tvSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  manualLink: {
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  manualText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  manualAction: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TVPickerSheet.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TVPickerSheet — list discovered TVs in a glass sheet

Shows a 'Searching…' state when the list is empty, a glass row per TV
once found, the currently-connected TV highlighted in accent blue, and
a 'Enter IP manually' fallback link at the bottom for cases where the
router blocks mDNS or the TV isn't discoverable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `StreamingTile` component

**Files:**
- Create: `src/components/StreamingTile.tsx`

- [ ] **Step 1: Write the component**

```typescript
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../theme/colors';
import * as Haptics from 'expo-haptics';

export type StreamApp = 'netflix' | 'youtube' | 'prime';

interface Props {
  app: StreamApp;
  onPress: () => void;
}

const BRAND: Record<
  StreamApp,
  { from: string; to: string; label: string; monogram: string }
> = {
  netflix: { from: colors.netflix, to: colors.netflixDark, label: 'NETFLIX', monogram: 'N' },
  youtube: { from: colors.youtube, to: colors.youtubeDark, label: 'YouTube', monogram: '▶' },
  prime: { from: colors.prime, to: colors.primeDark, label: 'Prime', monogram: '▶|' },
};

export function StreamingTile({ app, onPress }: Props) {
  const brand = BRAND[app];
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[brand.from, brand.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <Text style={styles.monogram}>{brand.monogram}</Text>
        <Text style={styles.label}>{brand.label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    aspectRatio: 1.4,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  monogram: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StreamingTile.tsx
git commit -m "$(cat <<'EOF'
feat(ui): StreamingTile — branded launch tile

One Pressable rendering a brand-coloured gradient with a monogram and
label. Haptic on press. Caller wires onPress to AtvRemoteSession.launchApp
with the correct deep-link URI.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Restyle `DPad` and `Rocker`

**Files:**
- Modify: `src/components/DPad.tsx`
- Modify: `src/components/Rocker.tsx`

Goal: keep functionality unchanged; swap the styling to use `colors.glassFill` / `colors.glassBorder`, and turn the OK button into a gradient.

- [ ] **Step 1: Edit `src/components/DPad.tsx` styling**

Open `src/components/DPad.tsx`. Find the StyleSheet block (it will contain entries for the arrow buttons and the OK button). Replace the arrow button's `backgroundColor` with `colors.glassFill` and its `borderColor` with `colors.glassBorder`. Replace its `borderWidth` with `1` if not already set.

The OK button needs a gradient. Wrap the existing `Pressable` for OK in a `LinearGradient`:

```typescript
import { LinearGradient } from 'expo-linear-gradient';

// inside render, replace the OK Pressable with:
<View style={styles.okWrap}>
  <LinearGradient
    colors={[colors.accent, colors.accentPurple]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={StyleSheet.absoluteFill}
  />
  <Pressable onPress={onOk} style={styles.okPress}>
    <Text style={styles.okText}>OK</Text>
  </Pressable>
</View>
```

Style updates:

```typescript
okWrap: {
  position: 'absolute',
  /* keep existing left/top/width/height */
  borderRadius: <existing>,
  overflow: 'hidden',
  shadowColor: colors.accent,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.5,
  shadowRadius: 16,
  elevation: 12,
},
okPress: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
},
okText: {
  color: '#FFFFFF',
  fontSize: 16,
  fontWeight: '700',
  letterSpacing: 0.4,
},
```

If the existing OK styling uses a single `Pressable` with `backgroundColor: colors.accent`, the change above replaces it. Preserve the existing position (`left`, `top`, `width`, `height`) values verbatim — only swap the visual layer.

- [ ] **Step 2: Edit `src/components/Rocker.tsx` styling**

Open `src/components/Rocker.tsx`. Find the container style and replace its background with `colors.glassFill`, border with 1px `colors.glassBorder`, and bump `borderRadius` to `22`. Inner buttons should get `backgroundColor: colors.glassFill` and `borderRadius: 16`. The label text stays `colors.textMuted`.

Specifically: in the `StyleSheet.create({...})` block, find:

```typescript
container: {
  backgroundColor: colors.surface,
  borderRadius: <X>,
  borderWidth: 1,
  borderColor: colors.border,
  ...
}
```

Change to:

```typescript
container: {
  backgroundColor: colors.glassFill,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  ...
}
```

And the inner button style — typically `button: { backgroundColor: colors.surfaceAlt, ... }` — change to `backgroundColor: colors.glassFill, borderRadius: 16`.

These edits are limited to the StyleSheet — do not touch the component's interaction handlers, prop shape, or layout structure.

- [ ] **Step 3: Commit**

```bash
git add src/components/DPad.tsx src/components/Rocker.tsx
git commit -m "$(cat <<'EOF'
feat(ui): restyle DPad and Rocker with Aurora Glass tokens

Glass surfaces for arrow buttons and rocker containers. The OK button
gets a blue->purple linear gradient backed by a soft accent shadow so
it visibly anchors the screen, matching the mockup. No behavioural
changes — only StyleSheet edits + the OK gradient wrap.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Rewrite `RemoteScreen.tsx`

**Files:**
- Rewrite: `src/screens/RemoteScreen.tsx`

This task assumes everything in Tasks 6–15 is in place. The new screen pulls them together.

- [ ] **Step 1: Replace `src/screens/RemoteScreen.tsx` with the Aurora layout**

The full new file content:

```typescript
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AtvRemoteSession } from '../api/atvClient';
import { atvDiscovery, useDiscoveredTVs, type DiscoveredTV } from '../api/atvDiscovery';
import { KeyCode } from '../api/keycodes';

import { AuroraBackground } from '../components/AuroraBackground';
import { DPad } from '../components/DPad';
import { GlassButton } from '../components/GlassButton';
import { Rocker } from '../components/Rocker';
import { StreamingTile } from '../components/StreamingTile';
import { TVPickerSheet } from '../components/TVPickerSheet';
import { useToast } from '../components/Toast';

import { useSettings } from '../context/SettingsContext';
import { colors, radius, spacing } from '../theme/colors';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Remote'>;

const STREAM_URI = {
  netflix: 'https://www.netflix.com/title',
  youtube: 'https://www.youtube.com',
  prime: 'https://app.primevideo.com/',
} as const;

export function RemoteScreen({ navigation }: Props) {
  const { settings, paired, connectedDeviceInfo, setConnectedDeviceInfo, setDiscoveredTvs, updateConnection } =
    useSettings();
  const toast = useToast();
  const discovered = useDiscoveredTVs();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [session, setSession] = useState<AtvRemoteSession | null>(null);

  // Mirror the discovery list into the context so other screens can read it.
  useEffect(() => {
    setDiscoveredTvs(discovered);
  }, [discovered, setDiscoveredTvs]);

  // Open a remote session whenever we have a paired cert + an IP.
  useEffect(() => {
    if (!paired || !settings.ip || !settings.certPem || !settings.keyPem) return;

    const s = new AtvRemoteSession(settings.ip, {
      certPem: settings.certPem,
      keyPem: settings.keyPem,
    });
    s.listener = {
      onDeviceInfo: (info) => setConnectedDeviceInfo(info),
      onConnect: () => toast.show('Connected'),
      onDisconnect: () => setConnectedDeviceInfo(null),
    };
    s.connect();
    setSession(s);

    return () => {
      s.disconnect();
      setSession(null);
      setConnectedDeviceInfo(null);
    };
  }, [paired, settings.ip, settings.certPem, settings.keyPem, setConnectedDeviceInfo, toast]);

  const sendKey = useCallback(
    (code: number) => {
      if (!session) {
        toast.show('Not connected');
        return;
      }
      session.sendKey(code);
    },
    [session, toast],
  );

  const launch = useCallback(
    (uri: string) => {
      if (!session) {
        toast.show('Not connected');
        return;
      }
      session.launchApp(uri);
    },
    [session, toast],
  );

  const pickTv = useCallback(
    (tv: DiscoveredTV) => {
      updateConnection({ ip: tv.host });
      toast.show(`Switching to ${tv.name}`);
    },
    [updateConnection, toast],
  );

  const titleText = useMemo(() => {
    if (connectedDeviceInfo?.model) return connectedDeviceInfo.model;
    return paired ? 'Bravia Remote' : 'Not paired';
  }, [connectedDeviceInfo, paired]);

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <GlassButton
            variant="danger"
            onPress={() => sendKey(KeyCode.POWER)}
            icon={<Ionicons name="power" size={18} color="#FF6B6B" />}
            round
            size={40}
          />
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{titleText}</Text>
            <Text style={styles.subtitle}>
              {paired ? `● ${settings.ip}` : 'Pair from Settings'}
            </Text>
          </View>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={styles.castButton}
            accessibilityLabel="Switch TV"
          >
            <Ionicons name="tv-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Action row */}
        <View style={styles.actionsRow}>
          <GlassButton
            label="Mute"
            icon={<Ionicons name="volume-mute-outline" size={18} color={colors.text} />}
            onPress={() => sendKey(KeyCode.VOLUME_MUTE)}
          />
          <GlassButton
            label="Input"
            icon={<Ionicons name="swap-horizontal" size={18} color={colors.text} />}
            onPress={() => sendKey(KeyCode.TV_INPUT)}
          />
          <GlassButton
            label="Settings"
            icon={<Ionicons name="settings-outline" size={18} color={colors.text} />}
            onPress={() => navigation.navigate('Settings')}
          />
        </View>

        {/* D-pad zone */}
        <View style={styles.dpadZone}>
          <View style={styles.sideCol}>
            <GlassButton
              label="Home"
              icon={<Ionicons name="home" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.HOME)}
            />
            <GlassButton
              label="Menu"
              icon={<Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.MENU)}
            />
          </View>
          <DPad
            onUp={() => sendKey(KeyCode.DPAD_UP)}
            onDown={() => sendKey(KeyCode.DPAD_DOWN)}
            onLeft={() => sendKey(KeyCode.DPAD_LEFT)}
            onRight={() => sendKey(KeyCode.DPAD_RIGHT)}
            onOk={() => sendKey(KeyCode.DPAD_CENTER)}
          />
          <View style={styles.sideCol}>
            <GlassButton
              label="Back"
              icon={<Ionicons name="arrow-back" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.BACK)}
            />
            <GlassButton
              label="Guide"
              icon={<Ionicons name="tv-outline" size={18} color={colors.text} />}
              onPress={() => sendKey(KeyCode.GUIDE)}
            />
          </View>
        </View>

        {/* Bottom row: VOL / Exit / CH */}
        <View style={styles.bottomRow}>
          <Rocker
            onUp={() => sendKey(KeyCode.VOLUME_UP)}
            onDown={() => sendKey(KeyCode.VOLUME_DOWN)}
            label="VOL"
            upIcon="+"
            downIcon="−"
          />
          <GlassButton label="Exit" onPress={() => sendKey(KeyCode.BACK)} />
          <Rocker
            onUp={() => sendKey(KeyCode.CHANNEL_UP)}
            onDown={() => sendKey(KeyCode.CHANNEL_DOWN)}
            label="CH"
            upIcon="▲"
            downIcon="▼"
          />
        </View>

        {/* Streaming dock */}
        <View style={styles.streamPanel}>
          <StreamingTile app="netflix" onPress={() => launch(STREAM_URI.netflix)} />
          <StreamingTile app="youtube" onPress={() => launch(STREAM_URI.youtube)} />
          <StreamingTile app="prime" onPress={() => launch(STREAM_URI.prime)} />
        </View>

        {/* TV picker bottom sheet */}
        <TVPickerSheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          tvs={discovered}
          currentIp={settings.ip || null}
          onPick={pickTv}
          onManualEntry={() => navigation.navigate('Settings')}
        />
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.power,
    fontSize: 10,
    marginTop: 2,
  },
  castButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dpadZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sideCol: {
    width: 64,
    gap: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  streamPanel: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.glassFill,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
});

// keep atvDiscovery referenced so the bundler tree-shakes nothing essential
void atvDiscovery;
```

If `DPad` and `Rocker` props in your repo are named differently from the calls above (e.g. `onUpArrow` instead of `onUp`), match the existing names — don't change those component signatures.

- [ ] **Step 2: Commit**

```bash
git add src/screens/RemoteScreen.tsx
git commit -m "$(cat <<'EOF'
feat(ui): rewrite RemoteScreen with Aurora Glass layout

Composition over the new primitives: AuroraBackground wraps the screen,
GlassButton for every action, restyled DPad/Rocker, StreamingTile x3
docked at the bottom, TVPickerSheet for switching between discovered
TVs, and connectedDeviceInfo driving the header title (so it reads
'KD-55X8500F' instead of 'Bravia Remote' once connected).

Behaviour is unchanged from a key-press standpoint — only the
presentation and the new streaming + picker affordances are different.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: USER GATE — visual on both platforms

You need to run this on the device. Both iOS and Android.

- [ ] **Step 1: Type-check the whole project**

```bash
npm run typecheck
```

Expected: no errors. If there are errors related to `DPad`/`Rocker` prop names not matching, fix them by adjusting the calls in `RemoteScreen.tsx` to match the existing prop names. Do not change `DPad.tsx` or `Rocker.tsx` signatures.

- [ ] **Step 2: Regenerate iOS + Android projects**

```bash
npx expo prebuild --platform ios --clean
npx expo prebuild --platform android --clean
```

Expected: both succeed without errors. The new `atv-discovery` module should be picked up by Expo autolinking — verify briefly:

```bash
grep -r "atv-discovery\|AtvDiscovery" ios/Podfile.lock | head -3
grep -r "atv-discovery\|atvdiscovery" android/settings.gradle android/app/build.gradle | head -3
```

Expected: matches in both.

- [ ] **Step 3: Build + install on iPhone**

```bash
npx expo run:ios
```

Expected: app installs, Remote screen renders with Aurora gradient backdrop, glass buttons, and the gradient OK button. The cast icon is visible top right; tapping it opens the picker sheet.

- [ ] **Step 4: Build + install on OnePlus 13R (already connected via wireless adb)**

```bash
npx expo run:android
```

Expected: same as iOS — Aurora layout renders, cast icon opens picker.

- [ ] **Step 5: Visual checks (do these on the device):**

- [ ] Aurora backdrop visible behind all content
- [ ] Power button top-left is round, red-tinted
- [ ] Title text reads `Bravia Remote` (before connection) or your TV model after
- [ ] Cast icon top-right opens the bottom sheet (slides up, dim backdrop)
- [ ] Action row (Mute / Input / Settings) all glass
- [ ] D-pad arrows are glass, OK is gradient blue→purple with soft glow
- [ ] Volume and Channel rockers are glass
- [ ] Bottom streaming dock shows Netflix (red), YouTube (red), Prime (blue) tiles

If anything looks visually broken, screenshot it and fix the relevant component before moving on. **Do not proceed to Task 18 until this gate is green.**

---

## Task 18: USER GATE — discovery works

- [ ] **Step 1: Confirm your TV is awake on the same Wi-Fi**

The Sony Bravia must be on (not in deep sleep). Same Wi-Fi as the Mac/phone.

- [ ] **Step 2: Open the cast picker**

On the iPhone or Android phone:
1. Launch the app to the Remote screen.
2. Tap the cast icon (top right).

Expected (within ~5 seconds): the picker sheet shows your TV's actual model name (e.g. `KD-55X8500F`) with its `host:port` underneath. If you have other Android TV / Chromecast devices on the network, they'll appear too.

- [ ] **Step 3: Tap your TV in the picker**

The sheet should dismiss. The Remote screen's IP indicator should switch to that TV's host. If a pairing cert is already stored, the title should update to the TV's model within 1–2 seconds (as `onDeviceInfo` fires).

- [ ] **Step 4: If discovery doesn't find the TV**

Capture logs:

```bash
# iOS
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.bsista.atvdiscovery"' &

# Android
$HOME/Library/Android/sdk/platform-tools/adb logcat -d | grep -i AtvDiscovery
```

Common causes:
- **Multicast blocked by router** — Many home routers block mDNS by default. Try a different network or check router settings.
- **Bonjour permission missing (iOS)** — confirm `NSBonjourServices` in `app.json` still includes `_androidtvremote2._tcp`. If you rebuilt without it, re-add and re-run prebuild.
- **CHANGE_WIFI_MULTICAST_STATE missing (Android)** — confirm it's in the module's `AndroidManifest.xml`. If you see the permission denied in logcat, run `adb shell pm grant com.example.sonytvremote android.permission.CHANGE_WIFI_MULTICAST_STATE`.

Do not proceed until at least one TV (your Bravia) appears in the picker.

---

## Task 19: USER GATE — streaming + TV-name + switch

- [ ] **Step 1: Tap each streaming tile, one at a time**

For each of Netflix, YouTube, Prime — tap the tile on the phone, then watch the TV.

Expected: the TV opens the corresponding app within ~1 second. If an app isn't installed on the TV (e.g., your Bravia doesn't have Prime), the TV does nothing visible — that's expected, not a failure.

- [ ] **Step 2: Verify the TV model name is in the header**

Connected status. The title at the top of the Remote screen should read the actual model string from the TV — e.g. `KD-55X8500F`, not `Bravia Remote`.

If it doesn't update from `Bravia Remote`, check logcat for `[atvClient]` lines mentioning `remoteConfigure` or `RemoteDeviceInfo`. The most common cause is that the TV sends `device_info` but with empty fields — in which case the title falls back as expected. Document the observation in CLAUDE.md if so.

- [ ] **Step 3: Switch test**

Open the picker again, tap a different TV (or close + reopen to confirm reconnection). The session should disconnect cleanly and reconnect to the new host. The title should update to that TV's model.

- [ ] **Step 4: Commit any incidental fixes**

```bash
git status
git add <paths>
git commit -m "fix(ui): post-verification fixes"
```

Skip this step if nothing changed.

---

## Task 20: Update `CLAUDE.md` and finalize

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the architecture section of `CLAUDE.md`**

Find the `modules/atv-cert/` block and add the new discovery module under it:

```
modules/atv-cert/                 Native module (both platforms) — mTLS sockets
├── index.ts                      JS facade — same API, Expo routes to iOS or Android
├── ios/                          Swift sources — Network.framework + iOS Keychain
└── android/                      Kotlin sources — javax.net.ssl.SSLSocket + EncryptedSharedPreferences

modules/atv-discovery/            Native module (both platforms) — mDNS browse
├── index.ts                      JS facade — startDiscovery / stopDiscovery / serviceFound|Lost events
├── ios/                          Swift sources — Network.framework NWBrowser
└── android/                      Kotlin sources — android.net.nsd.NsdManager
```

In the "What NOT to do" section, append:

```
- Don't add deep-link URIs for streaming apps without testing on a real TV first — Bravia rejects unknown URI schemes silently and there's no error to surface.
- Don't run mDNS discovery in the background on a screen that doesn't need it — battery drain. Use the useDiscoveredTVs hook so start/stop are bound to component lifecycle.
```

- [ ] **Step 2: Commit + merge to master**

```bash
git add CLAUDE.md
git commit -m "docs: document atv-discovery module + Aurora Remote design

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

git checkout master
git merge --no-ff feat/android-support -m "$(cat <<'EOF'
feat: Android support + Aurora Remote redesign

Two features bundled because they share the feat/android-support branch:

1. Android platform support (Kotlin atv-cert module mirroring the iOS
   Swift one), plus pairing-protocol fixes that were needed for any
   client to pair with this Sony Bravia firmware (HEX/6 symbol length,
   full-nonce hash, status:200 on PairingSecret).

2. Aurora Glass redesign of the Remote screen: AuroraBackground,
   GlassButton, BottomSheet, TVPickerSheet, StreamingTile. New
   atv-discovery native module (NWBrowser on iOS, NsdManager on
   Android) so the user never has to type the TV's IP. TV model name
   is now the header title — pulled from RemoteConfigure.

Verified end-to-end on iPhone + OnePlus 13R against a Sony Bravia
KD-55X8500F:
- Discovery finds the TV in under 5 seconds
- Auto-connect restores session on launch
- Streaming tiles (Netflix / YouTube / Prime) deep-link via
  remoteAppLinkLaunchRequest
- Header reflects the actual TV model
- TV picker switches between multiple discovered devices

Refs:
- docs/superpowers/specs/2026-06-17-android-support-design.md
- docs/superpowers/specs/2026-06-17-aurora-remote-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"

git log --oneline -5
```

- [ ] **Step 3: Confirm the merge**

```bash
git status
```

Expected: clean working tree on `master`.

- [ ] **Step 4: (Optional) delete the feature branch**

```bash
git branch -d feat/android-support
```

---

## What gets touched and what doesn't

**Untouched (by design):**
- `modules/atv-cert/` — pairing module is stable. Aurora work doesn't touch it.
- `src/screens/PairingScreen.tsx` — already gets its uncommitted polish in Task 1; no further changes.
- `src/screens/SettingsScreen.tsx` — explicit non-goal.
- `App.tsx` — wiring already in place.
- `app.json` — Bonjour service was declared previously; iOS keeps it.

**Touched (this plan):**
- 11 new files (1 spec already, 6 components, 1 JS discovery client, 3 native-module files for discovery)
- 7 modified files (atvClient, SettingsContext, colors, DPad, Rocker, RemoteScreen, CLAUDE.md)

That's the entire footprint of the Aurora Remote feature.
