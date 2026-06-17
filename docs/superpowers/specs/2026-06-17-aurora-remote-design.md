# Aurora Remote — Premium UI + mDNS Auto-Discovery Design Spec

**Date:** 2026-06-17
**Owner:** Bhargava
**Status:** Draft (pre-implementation)

## Goal

Replace the current functional-but-plain Remote screen with a premium "Aurora Glass" design, add quick-launch streaming buttons (Netflix, YouTube, Prime Video), and remove the friction of typing the TV's IP address by auto-discovering Sony Bravia / Android TV devices on the local WiFi via mDNS.

## Non-Goals (YAGNI)

- No light theme — dark glass only.
- No animations beyond the discovery pulse and standard press feedback.
- No custom streaming app picker — just Netflix, YouTube, Prime (the three apps the user asked for).
- No multi-TV simultaneous control — one connected TV at a time, but with quick-switch via the bottom sheet.
- No mDNS browse on Pairing screen — discovery is for already-paired or new-pair-needed TVs, surfaced from the Remote screen header.
- No new pairing flow — same code/cert path, just pre-filled IP from discovery.
- No Settings screen redesign — only Remote screen gets the visual overhaul this task.

## Scope

In-scope:

1. **Visual redesign** of `src/screens/RemoteScreen.tsx` to the "Aurora Glass" aesthetic (gradient background, frosted-glass buttons, gradient OK button).
2. **Streaming dock** at the bottom — three branded glass tiles that launch Netflix, YouTube, Prime Video on the TV via the existing `remoteAppLinkLaunchRequest` protobuf (field 90).
3. **Cast icon** in the header that opens a bottom-sheet showing discovered TVs.
4. **mDNS discovery** of `_androidtvremote2._tcp` services on both iOS (Network.framework `NWBrowser`) and Android (`NsdManager`).
5. **TV model name** auto-pulled from `RemoteConfigure.device_info.model` and shown as the screen title (replaces "Bravia Remote").
6. **Auto-fill IP** from the selected discovered service so the user never types it.
7. New `BottomSheet` component (Aurora Glass styled).
8. New `RemoteAuroraBackground` component (the radial-gradient backdrop).
9. New `StreamingTile` component.
10. **One small protocol addition** in `atvClient.ts`: a `launchApp(uri: string)` method on `AtvRemoteSession`.

Out-of-scope (deferred to other tasks):

- Theme system / light mode.
- iCloud / cross-device cert sync.
- Native Android Cast SDK integration (we're using vanilla mDNS, not Google Cast).
- Pairing screen redesign — pairing already works, leave it alone.
- Voice search / mic.

## Architecture

```
src/
├── components/
│   ├── AuroraBackground.tsx          [NEW]  radial-gradient backdrop layer
│   ├── BottomSheet.tsx               [NEW]  reusable glass bottom-sheet
│   ├── TVPickerSheet.tsx             [NEW]  uses BottomSheet, lists discovered TVs
│   ├── StreamingTile.tsx             [NEW]  one branded streaming app tile
│   ├── GlassButton.tsx               [NEW]  base glass button (replaces RemoteButton or wraps it)
│   ├── RemoteButton.tsx              [KEEP] still used for press behavior / debounce / haptics
│   ├── DPad.tsx                      [EDIT] restyle inner buttons + new OK gradient
│   ├── Rocker.tsx                    [EDIT] glass restyle
│   └── ...
├── screens/
│   └── RemoteScreen.tsx              [REWRITE] full layout per the mockup
├── api/
│   ├── atvDiscovery.ts               [NEW] JS facade for native mDNS module
│   ├── atvClient.ts                  [EDIT] add launchApp(uri) method to AtvRemoteSession
│   └── atvProto.ts                   [no change — RemoteAppLinkLaunchRequest field already exists]
├── context/
│   └── SettingsContext.tsx           [EDIT] add `discoveredTvs`, `connectedTv`, autofill IP from discovery
└── theme/
    └── colors.ts                     [EDIT] add new aurora colors

modules/atv-discovery/                [NEW Expo native module]
├── package.json
├── expo-module.config.json
├── index.ts                          JS facade (AtvDiscovery class with start/stop + events)
├── ios/
│   ├── AtvDiscovery.podspec
│   └── AtvDiscoveryModule.swift      uses Network.framework NWBrowser
└── android/
    ├── build.gradle
    ├── src/main/AndroidManifest.xml  declares CHANGE_WIFI_MULTICAST_STATE
    └── src/main/java/expo/modules/atvdiscovery/
        └── AtvDiscoveryModule.kt     uses android.net.nsd.NsdManager
```

The new `atv-discovery` module is **separate from `atv-cert`** because:
- Different concern (read-only network browse vs. mTLS socket I/O).
- Different platform APIs.
- Separate module = isolated risk; doesn't touch the working pairing code.

## Component breakdown

### `AuroraBackground.tsx`

A pure-React-Native gradient using `expo-linear-gradient`. Three radial blobs (blue top-left, purple bottom-right, pink top-right accent) blended over a `#0B0B0F` base.

```typescript
<AuroraBackground>
  {children}  // entire screen content
</AuroraBackground>
```

No props yet. Static gradient. Implemented with three absolutely-positioned `LinearGradient` views with low opacity, plus a base `View`.

### `GlassButton.tsx`

Wraps `RemoteButton` (which already handles haptics, debounce, hold-repeat). Adds:
- `bg = rgba(255,255,255,0.04)`
- `borderColor = rgba(255,255,255,0.08)`
- `borderWidth = 1`
- `borderRadius = 14`
- An inner shadow via `View` overlay (RN doesn't support `box-shadow inset` natively).

Has a `variant` prop: `"default" | "accent" | "danger" | "power"`.

- `"accent"` → gradient blue→purple background (the OK button).
- `"power"` → green tint.
- `"danger"` → red tint (for the Power-off button in the header).

### `BottomSheet.tsx`

A reusable bottom sheet using `react-native-reanimated` + `react-native-gesture-handler` (both already in package.json transitively via `@react-navigation/native-stack`).

Props:
- `visible: boolean`
- `onClose: () => void`
- `children`
- Optional `snapPoints`.

Uses a backdrop `Animated.View` with blur (`@react-native-community/blur` is NOT available — use a semi-transparent dark overlay; the sheet itself uses `expo-blur`'s `BlurView` if available, otherwise a translucent panel).

For YAGNI: drag-to-dismiss is nice but not required. Tap backdrop = close. Tap manual link = close.

### `TVPickerSheet.tsx`

Built on `BottomSheet`. Shows:
- Title: `"Found N TVs nearby"` or `"Searching..."` with a pulsing dot.
- List of discovered TVs (each row = icon, name, host:port, "selected" checkmark).
- "Don't see it? Enter IP manually" link at the bottom (opens Settings screen / shows inline IP input).

### `StreamingTile.tsx`

Props:
- `app: "netflix" | "youtube" | "prime"`
- `onPress: () => void`

Renders branded gradient background:
- Netflix: `linear-gradient(160deg, #E50914, #8C000C)`
- YouTube: `linear-gradient(160deg, #FF0000, #B40000)`
- Prime: `linear-gradient(160deg, #00A8E1, #0064AA)`

White text, large monogram letter, app name underneath.

### `RemoteScreen.tsx` rewrite

Full layout in order:

```
<AuroraBackground>
  <SafeAreaView>
    {/* Header */}
    <Row>
      <GlassIcon variant="danger" onPress={powerOff}>⏻</GlassIcon>
      <Title>{tvModelName || "Bravia Remote"}</Title>
      <CastIcon onPress={openPicker} />
    </Row>

    {/* Action row */}
    <Row of 3>
      <GlassButton power>Power</GlassButton>      // soft toggle (separate from header destructive Power)
      <GlassButton>Mute</GlassButton>
      <GlassButton>Input</GlassButton>
    </Row>

    {/* D-pad zone */}
    <DPadZone>
      <SideCol>Home, Menu</SideCol>
      <DPad variant="glass" />   // existing DPad component, restyled
      <SideCol>Back, Guide</SideCol>
    </DPadZone>

    {/* Volume / Exit / Channel */}
    <Row>
      <Rocker labels={["+", "VOL", "−"]} />
      <GlassButton>Exit</GlassButton>
      <Rocker labels={["▲", "CH", "▼"]} />
    </Row>

    {/* Streaming dock */}
    <GlassPanel>
      <StreamingTile app="netflix" />
      <StreamingTile app="youtube" />
      <StreamingTile app="prime" />
    </GlassPanel>
  </SafeAreaView>

  <TVPickerSheet visible={pickerOpen} ... />
</AuroraBackground>
```

The screen uses `useSettings()` for IP + discovery state, and the existing `AtvRemoteSession` for sending key codes.

### Header: two power buttons?

The mockup shows a Power icon top-left AND a Power tile in the action row. Decision: **the top-left circle is the dedicated TV power toggle** (matches the user's reference screenshot — Roku-style). The action row's "Power" tile is **removed** to avoid duplication. The action row now becomes **Mute / Input / Settings**, which gives quick access to Settings without leaving the Remote screen.

### Streaming launch — protocol

`AtvRemoteSession.launchApp(uri)` builds:

```protobuf
RemoteMessage {
  remote_app_link_launch_request: RemoteAppLinkLaunchRequest {
    app_link: <uri>
  }
}
```

URIs:
- Netflix: `https://www.netflix.com/title/`
- YouTube: `https://www.youtube.com/`
- Prime Video: `https://app.primevideo.com/`

Sony Bravia recognises these and opens the corresponding app. If the app isn't installed on the TV, the TV's behavior is to ignore the request — no client-side error needed.

## mDNS discovery — native modules

### iOS (Swift, `AtvDiscoveryModule.swift`)

```swift
import Network

private var browser: NWBrowser?
private var foundEndpoints: [String: NWEndpoint] = [:]

AsyncFunction("startDiscovery") { in
  let descriptor = NWBrowser.Descriptor.bonjour(type: "_androidtvremote2._tcp", domain: nil)
  let browser = NWBrowser(for: descriptor, using: .tcp)
  browser.browseResultsChangedHandler = { results, _ in
    let services = results.map { result in
      // extract name, host, port from result.endpoint
      // emit("serviceFound", { name, host, port })
    }
    sendEvent("services", payload)
  }
  browser.start(queue: .main)
}

AsyncFunction("stopDiscovery") { browser?.cancel() }
```

Bonjour service is **already declared** in `app.json` (`NSBonjourServices: ["_androidtvremote2._tcp"]`). No new permission needed.

### Android (Kotlin, `AtvDiscoveryModule.kt`)

```kotlin
private val nsdManager: NsdManager by lazy {
  appContext.reactContext!!.getSystemService(Context.NSD_SERVICE) as NsdManager
}
private var discoveryListener: NsdManager.DiscoveryListener? = null

AsyncFunction("startDiscovery") {
  val listener = object : NsdManager.DiscoveryListener {
    override fun onServiceFound(serviceInfo: NsdServiceInfo) {
      // NSD requires a separate resolve call to get host + port
      nsdManager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
        override fun onServiceResolved(info: NsdServiceInfo) {
          sendEvent("serviceFound", mapOf(
            "name" to info.serviceName,
            "host" to info.host.hostAddress,
            "port" to info.port
          ))
        }
        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {}
      })
    }
    override fun onServiceLost(serviceInfo: NsdServiceInfo) {
      sendEvent("serviceLost", mapOf("name" to serviceInfo.serviceName))
    }
    // ...other required overrides (no-op or log)
  }
  nsdManager.discoverServices("_androidtvremote2._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
  discoveryListener = listener
}

AsyncFunction("stopDiscovery") {
  discoveryListener?.let { nsdManager.stopServiceDiscovery(it) }
  discoveryListener = null
}
```

Requires `CHANGE_WIFI_MULTICAST_STATE` permission in the module's `AndroidManifest.xml`.

### JS facade (`atvDiscovery.ts`)

```typescript
export interface DiscoveredTV {
  name: string;
  host: string;
  port: number;
}

class AtvDiscoveryClient {
  private listeners: ((tvs: DiscoveredTV[]) => void)[] = [];
  private tvs: Map<string, DiscoveredTV> = new Map();

  start(): void { ... }
  stop(): void { ... }
  onChange(cb: (tvs: DiscoveredTV[]) => void): () => void { ... }
}

export const atvDiscovery = new AtvDiscoveryClient();
```

### When does discovery run?

- **On RemoteScreen mount**: start discovery, emit results into `SettingsContext.discoveredTvs`.
- **On unmount**: stop discovery to save battery.
- The first discovered TV that matches a previously-paired host (via stored cert) auto-connects. Otherwise the user picks from the bottom sheet.
- If the user already has a manual IP saved, that IP is shown first as "Last used" and connects immediately on launch; discovery still runs in the background to populate "switch to" options.

## TV model name display

The TV sends its model in `RemoteConfigure.device_info.model` when the remote socket first opens. This is captured in `atvClient.ts` already (the message is decoded). Currently it's not exposed to the UI.

**Changes:**
- `AtvRemoteSession` gains a `currentDeviceInfo: RemoteDeviceInfo | null` property.
- A new listener method `onDeviceInfo(info: RemoteDeviceInfo)` is invoked when the configure message arrives.
- `RemoteScreen` subscribes to this and renders `currentDeviceInfo?.model` (e.g., `"KD-55X8500F"`) in the title.

## Data Flow

```
App launch
   ↓
Settings auto-load (existing flow — loads stored IP + cert)
   ↓
RemoteScreen mounts
   ↓
   ├──→ atvDiscovery.start()                       [mDNS browse begins]
   │    ↓
   │    discoveredTvs state populated as services arrive
   │
   ├──→ If stored IP + cert exist → AtvRemoteSession.connect(IP, cert)
   │    ↓
   │    onDeviceInfo(model: "KD-55X8500F") → setTvModelName(model)
   │    ↓
   │    Title updates from "Bravia Remote" to "KD-55X8500F"
   │
   └──→ User taps cast icon → TVPickerSheet opens (visible = true)
        ↓
        Shows discoveredTvs list (already populated)
        ↓
        User taps a TV → updateConnection({ ip: tv.host }) → close sheet
        ↓
        useEffect on settings.ip change → tear down old session → connect new
```

## Error Handling

| Scenario | Behavior |
|---|---|
| mDNS discovery fails to start | Cast icon still works; bottom sheet shows "Searching..." then "No TVs found" + manual IP fallback prominently. |
| No TVs found after 5 seconds | Sheet shows "No TVs found nearby" + manual IP entry button. Discovery keeps running in case one comes online later. |
| TV found via mDNS but doesn't respond to TLS | Standard existing error flow — toast + retry. |
| WiFi changes mid-session | Existing socket-error path; user is shown the cast icon prominently to re-pick. |
| `RemoteConfigure.device_info.model` missing | Title falls back to "Bravia Remote" (the current default). |
| Streaming app not installed on TV | TV silently ignores `app_link_launch_request`. No client-side error needed. We don't poll for installed apps. |

## Testing Strategy

Same model as the pairing work: **no unit tests, manual verification gates** because the new code is mostly native I/O and UI.

Gates (in order):

1. **Visual gate**: app builds; new Remote screen renders without crashes; all buttons visible and the layout matches the mockup on both iPhone (your existing setup) and OnePlus 13R.
2. **Discovery gate (iOS)**: cast icon opens sheet; within 3 seconds, your Bravia appears in the list with the correct hostname.
3. **Discovery gate (Android)**: same, on OnePlus 13R.
4. **Auto-connect gate**: after a fresh install + first manual pair, app auto-connects on next launch and shows `KD-55X8500F` (or whatever your TV's real model string is) as the title.
5. **Streaming gate**: tap Netflix → TV opens Netflix. Repeat YouTube, Prime.
6. **Switch gate**: tap cast icon while connected → sheet shows current TV checked + other TVs unselected (if any). Tapping a different TV switches the connection cleanly.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| mDNS doesn't work on the user's home WiFi (multicast disabled by router) | Manual IP entry fallback in the sheet is prominent, not buried. |
| `BlurView` from `expo-blur` performs poorly on older Android | Fall back to a semi-transparent panel — the design still reads as "glass" without a hard blur. The mockup's blur is a nice-to-have. |
| `react-native-reanimated` not configured in babel.config.js | Verify and add the plugin during Task 1 of the implementation plan. |
| Two TVs with the same name | Bottom sheet shows host:port as the subtitle so they're distinguishable. |
| Discovery delays user's first action | Don't block UI on discovery. Render the buttons immediately. Cast icon shows "searching" pulse if user opens the sheet within the first second. |
| Streaming URIs work on some Bravia models but not others | Document in CLAUDE.md. If user reports issue, we can add per-app fallback URIs later. |
| Discovery uses battery if left running | Stop discovery on screen unmount; restart on focus. |

## Rollout

1. Stay on the existing `feat/android-support` branch (we already have pending pairing fixes that should land first).
2. Commit pending pairing fixes (the HEX/6 + status:200 + nonce changes) BEFORE starting UI work.
3. Build native discovery module first (lower-level dependency).
4. Build new UI components (`AuroraBackground`, `BottomSheet`, etc.).
5. Rewrite `RemoteScreen` last (depends on everything above).
6. Manual-test each gate.
7. Merge to master in one big PR.

## Open Questions

None at this point — all design decisions are made above.

## Future Work (NOT in this spec)

- Adding more streaming apps (Disney+, HBO Max, etc.) — easy follow-up.
- Universal search (mic / voice).
- Multi-room control (switch between paired TVs in different rooms).
- Wake-on-LAN to turn the TV on when it's fully off (not just standby).
- Settings screen Aurora Glass refresh — same aesthetic system, separate task.
