# Parallel Code for Android

Native companion app for the desktop's **Connect Phone** (Remote Access) feature. It talks to the same HTTP/WebSocket API as the phone web UI in `src/remote/`.

## What it does

- **Connect:** scan the QR code in Connect Phone, or paste the link under it. This gives a view-only token.
- **Pair:** enter the six-digit code from Connect Phone to get a paired token, which may type into terminals. "Keep this phone authorized" asks the desktop to remember the phone across restarts.
- **Agents:** live list with each agent's status and last line.
- **Minimized tasks:** tasks minimized on the desktop are pinned below the live list; a setting hides them.
- **Settings:** theme (follow system, Deep Space Dark, Light), keep the screen on, connection status, and forget this computer.
- **Terminal:** an agent's terminal in the desktop's default Obsidian colors (light or dark with the phone). Once paired: a reply box and keys a phone keyboard lacks (Enter, Esc, Tab, arrows, Ctrl+C).
- **Notes:** read a task's notes panel; edit and save it once paired.
- **New task:** pick a project and describe the work; needs pairing.

Not yet covered: the built-in chat. Use the phone web UI for it.

## Build

Needs JDK 17+ and the Android SDK (compile SDK 37). Set `ANDROID_HOME` or add `sdk.dir` to `android/local.properties`.

```sh
cd android
./gradlew testDebugUnitTest   # unit tests
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug        # install on a connected device
```

QR scanning uses the Google Play services code scanner, so the app needs no camera permission. On phones without Play services, paste the link instead.

## How it maps to the server

See `electron/remote/server.ts` and `electron/remote/protocol.ts`.

| Step         | Request                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Pair         | `POST /api/pair/verify` with `Authorization: Bearer <token>` and `{ pin, remember }`; returns `{ token }` |
| Connect      | WebSocket `/ws`; first message `{ type: "auth", token }`. The paired token is used when present           |
| Watch        | `subscribe` / `unsubscribe`; the server sends `scrollback`, then `output` (base64 PTY bytes)              |
| Projects     | `GET /api/mobile/projects` (paired)                                                                       |
| New task     | `POST /api/mobile/tasks` with `{ projectId, name, prompt }` (paired); returns `{ taskId }`                |
| Notes        | `GET` / `PUT /api/mobile/notes/<taskId>` with `{ notes }`; reading works view-only, saving needs pairing  |
| Reply        | `input` with `submit: true` and a `requestId`; confirmed by `input-result`                                |
| Close `4001` | Paired token rejected: drop it and reconnect view-only. QR token rejected: scan again                     |
| Close `4003` | Typing rights lost: drop the paired token                                                                 |
| HTTP 401     | On a paired-token request: drop the paired token and reconnect view-only                                  |

Remote Access serves plain HTTP on the LAN or Tailscale address, so the app allows cleartext traffic. Credentials live in app-private storage and are excluded from backups and device transfer.
