# KB Remote

An iPhone app that acts as a remote control for Sony Bravia TVs (and any Android TV — Shield, Chromecast with Google TV, etc.) over your local WiFi.

No cloud server, no account, no special TV settings. The phone talks directly to the TV.

## How it works in plain English

1. **One-time pairing.** Your phone introduces itself to the TV. The TV displays a code on screen, you type it into the app. They exchange digital "ID cards" (certificates) and remember each other.
2. **Daily use.** Tap a button → app sends a small message over WiFi → TV reacts. Volume, channel, D-pad, power, all of it.

Both phone and TV must be on the **same WiFi network**.

## What is a "Pod"?

You'll hear this word a lot. CocoaPods is a package manager for iOS native code — same idea as `npm` for JavaScript. Each *Pod* is a library written in Swift or Objective-C.

- `Podfile` = the list of pods you want (like `package.json`)
- `Pods/` folder = where they get downloaded (like `node_modules/`)
- `pod install` = command that reads the Podfile and downloads them

You don't commit `Pods/` to git — anyone who clones the repo runs `pod install` to get a fresh copy.

---

## Running it on a Mac (your friend's, or a fresh one)

### Prerequisites — install these once

1. **Xcode** — from the Mac App Store. Big download (~10 GB), be patient.
2. **Node.js (LTS)** — https://nodejs.org
3. **CocoaPods** — open Terminal and run:
   ```bash
   sudo gem install cocoapods
   ```
4. **An Apple ID** — even a free one works (only needed for signing the app).

### Get the app on the phone

Open Terminal and run these one block at a time:

```bash
# 1. Download the code
git clone https://github.com/bhargava2894/KB-Remote.git
cd KB-Remote

# 2. Install JavaScript dependencies
npm install

# 3. Generate the iOS project (the ios/ folder is not in git on purpose)
npx expo prebuild --platform ios --clean

# 4. Install the native iOS libraries (the Pods!)
cd ios
pod install
cd ..

# 5. Open the project in Xcode
open ios/BraviaRemote.xcworkspace
```

> **Important:** open the `.xcworkspace` file, **NOT** the `.xcodeproj`. The workspace is the one that knows about Pods.

### In Xcode

1. In the left sidebar, click the blue project icon at the top.
2. Go to the **Signing & Capabilities** tab.
3. Set **Team** to your Apple ID (Personal Team is fine).
4. At the top of Xcode, pick your iPhone (or a Simulator) as the run destination.
5. Hit the ▶️ play button. First time takes a few minutes.

### First run on a real iPhone

iOS will block the app from launching the first time. To fix it:

1. On the iPhone: **Settings → General → VPN & Device Management**
2. Tap your Apple ID under "Developer App"
3. Tap **Trust**

Open the app, it should launch.

### In the app

1. Tap the gear icon → **Settings**.
2. Enter your TV's **IP address** (TV menu → Network → View Network Status).
3. Tap **Pair with TV**.
4. The TV shows a 6-character code. Type it into the app.
5. Done. The remote screen connects automatically every time.

---

## Gotchas

- **Free Apple ID = app expires every 7 days.** Just re-run from Xcode to refresh. A paid Apple Developer account ($99/yr) makes it last a year.
- **Pairing is per-phone.** Each phone needs its own pairing — the certificate is stored on the phone.
- **Same WiFi network required.** If the TV is on a different WiFi (or guest network), they can't see each other.
- **TV must be on, not in deep sleep.** Some Bravia TVs need "Remote start" enabled in network settings to wake from sleep.

---

## Daily development workflow

Once installed, you don't need to rebuild for every code change:

```bash
npx expo start --dev-client
```

Then open KB Remote on the phone — it picks up the Metro server automatically and hot-reloads JS edits. Only Swift/native changes need a fresh Xcode build.

## Alternative: cloud build via EAS

If you don't want to deal with Xcode at all:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile development
```

The cloud build takes ~15–20 min and gives you a TestFlight link to install.

---

## How the protocol works (technical reference)

| Port | Use | Auth |
|---|---|---|
| 6467 | Pairing | TLS, server sees our self-signed cert; user types 6-char code |
| 6466 | Remote control | TLS with the same client cert (now trusted by TV) |

Messages are length-prefixed protobufs.

**Pairing flow:**

```
client → PairingRequest         (service/client name)
client ← PairingRequestAck
client → PairingOption          (we accept hexadecimal input, 6 symbols)
client ← PairingOption          (TV echoes options)
client → PairingConfiguration   (pick hexadecimal/4, INPUT role)
client ← PairingConfigurationAck
                                — TV displays 6-character code on screen
                                — user types it into app
client → PairingSecret          (SHA-256 of client+server pubkeys + code nonce)
client ← PairingSecretAck       — done; close
```

**Remote flow on port 6466:**

```
client ← RemoteConfigure        (TV sends its device info)
client → RemoteConfigure        (we send ours)
client ← RemoteSetActive
client → RemoteSetActive        (claim session)
client ← RemotePingRequest      (~every 5s)
client → RemotePingResponse
client → RemoteKeyInject        (one per button press)
```

Canonical protobuf field numbers (matches `tronikos/androidtvremote2` and `louis49/androidtv-remote`):

| Field | Number |
|---|---|
| `remote_configure` | 1 |
| `remote_set_active` | 2 |
| `remote_error` | 3 |
| `remote_ping_request` | 8 |
| `remote_ping_response` | 9 |
| `remote_key_inject` | 10 |
| `remote_ime_key_inject` | 20 |
| `remote_start` | 40 |
| `remote_set_volume_level` | 50 |
| `remote_app_link_launch_request` | 90 |

---

## Project layout

```
KB-Remote/
├── App.tsx                          App entry point
├── index.ts
├── app.json                         Expo config (app name lives here)
├── package.json                     JS dependencies
├── babel.config.js
├── metro.config.js
├── ios/                             Generated by `expo prebuild` — don't hand-edit
├── modules/
│   └── atv-cert/                    JS side of the native TLS module
└── src/
    ├── polyfills.ts                 Buffer global for node-forge / protobuf framing
    ├── api/
    │   ├── keycodes.ts              Android KeyEvent codes + button mapping
    │   ├── atvCert.ts               X.509 client cert generation (node-forge)
    │   ├── atvProto.ts              protobuf schemas + wire framing
    │   └── atvClient.ts             Pairing + Remote TLS clients
    ├── components/
    │   ├── RemoteButton.tsx         Haptics + debounce + hold-repeat
    │   ├── DPad.tsx
    │   ├── Rocker.tsx
    │   ├── NumberPad.tsx
    │   └── Toast.tsx
    ├── context/
    │   └── SettingsContext.tsx      Persists IP and client cert (SecureStore)
    ├── screens/
    │   ├── RemoteScreen.tsx         Main remote UI
    │   ├── SettingsScreen.tsx       IP + pair/unpair
    │   └── PairingScreen.tsx        Generate cert, exchange code
    └── theme/colors.ts
```

---

## Troubleshooting

- **`pod install` fails with "Unable to find a specification"** — run `pod repo update` and try again.
- **`pod install` says "No such Pod"** for AtvCert — you forgot the `npx expo prebuild` step. Re-run it from the project root.
- **Xcode build error "No account for team"** — set your Apple ID under Signing & Capabilities → Team.
- **App installs but won't launch on iPhone** — trust the developer cert in Settings → General → VPN & Device Management.
- **"Pairing failed: status 400"** — TV refused. Re-check IP and that the TV isn't asleep.
- **"TV closed pairing connection"** — wrong cert/key passed to TLS. Most often a polyfill issue with Buffer; rebuild the dev client.
- **Cert generation hangs** — node-forge does 2048-bit RSA in pure JS; allow up to a minute on older devices.
- **Connection state stuck "connecting"** — TV is unreachable on the network. Confirm with `ping <tv-ip>` from another device on the same WiFi.
- **Need to re-pair after a TV firmware update** — open Settings → "Forget pairing", then **Pair with TV** again.
- **RemoteError value: 5** — protobuf field numbers don't match. See the field number table above; ours match `tronikos/androidtvremote2`.
