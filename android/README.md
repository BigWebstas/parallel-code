# Parallel Code for Android

Native companion app for the desktop's **Connect Phone** (Remote Access) feature. It talks to the same HTTP/WebSocket API as the phone web UI in `src/remote/`.

## What it does

- **Connect:** scan the QR code in Connect Phone, or paste the link under it. This gives a view-only token.
- **Pair:** enter the six-digit code from Connect Phone to get a paired token, which may type into terminals. "Keep this phone authorized" asks the desktop to remember the phone across restarts.
- **Several computers:** link more than one desktop (for example the installed app and a dev build, or two machines) and switch between them in Settings → Computers; each keeps its own pairing.
- **Agents:** live list with each agent's status and last line, under the desktop's Claude, Codex, and Antigravity 5-hour and weekly usage meters (hidden on desktops without `/api/mobile/usage`).
- **Minimized tasks:** tasks minimized on the desktop are pinned below the live list; a setting hides them.
- **Settings:** theme (follow system, Obsidian Dark, Light), keep the screen on, connection status, and forget this computer.
- **Terminal:** an agent's terminal in the desktop's default Obsidian colors (light or dark with the phone). Once paired: a reply box and keys a phone keyboard lacks (Enter, Esc, Tab, arrows, Ctrl+C). Once paired, the terminal takes the phone's size while open, so full-screen agents such as Claude Code fill it; the desktop gets its size back when you leave.
- **Changes:** the task's diff against its base branch, file by file with added and removed lines.
- **Quick replies and voice:** saved replies above the reply box (edit them in Settings) and a mic button that dictates with Android's speech recognizer.
- **Widget:** a home-screen widget with the agents that need you and the usage meters, updated while the app is connected.
- **Notes:** read a task's notes panel; edit and save it once paired.
- **New task:** pick a project and describe the work; needs pairing.
- **Notifications:** optional, in Settings. A foreground service keeps the connection open in the background and notifies when an agent needs input, hits an error, or finishes (each can be turned off); tapping one opens that agent.
- **Close task:** from an agent's screen; needs pairing. Like the desktop, it warns before losing uncommitted or unmerged work.

- **Built-in chat:** read the conversation, send messages, stop the agent, and answer its approvals and questions once paired. Choosing the model and attaching images stay on the computer.

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

| Step         | Request                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Pair         | `POST /api/pair/verify` with `Authorization: Bearer <token>` and `{ pin, remember }`; returns `{ token }`                     |
| Connect      | WebSocket `/ws`; first message `{ type: "auth", token }`. The paired token is used when present                               |
| Watch        | `subscribe` / `unsubscribe`; the server sends `scrollback`, then `output` (base64 PTY bytes)                                  |
| View size    | `view-size` with `{ cols, rows }` (paired) while a terminal is open; without them, or on disconnect, the desktop size returns |
| Projects     | `GET /api/mobile/projects` (paired)                                                                                           |
| New task     | `POST /api/mobile/tasks` with `{ projectId, name, prompt }` (paired); returns `{ taskId }`                                    |
| Usage        | `GET /api/mobile/usage`; the desktop status bar's snapshot, readable view-only                                                |
| Notes        | `GET` / `PUT /api/mobile/notes/<taskId>` with `{ notes }`; reading works view-only, saving needs pairing                      |
| Close task   | `POST /api/mobile/tasks/<taskId>/close` with `{ force }` (paired); `409` with `{ warnings }` when work would be lost          |
| Changes      | `GET /api/mobile/tasks/<taskId>/diff` → `{ diff, truncated }`; readable view-only                                             |
| Reply        | `input` with `submit: true` and a `requestId`; confirmed by `input-result`                                                    |
| Close `4001` | Paired token rejected: drop it and reconnect view-only. QR token rejected: scan again                                         |
| Close `4003` | Typing rights lost: drop the paired token                                                                                     |
| HTTP 401     | On a paired-token request: drop the paired token and reconnect view-only                                                      |

Remote Access serves plain HTTP on the LAN or Tailscale address, so the app allows cleartext traffic. Credentials live in app-private storage and are excluded from backups and device transfer.
