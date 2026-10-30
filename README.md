# M6 Lite Control Web

> 🇷🇺 Русская версия: [README.ru.md](README.ru.md)

Browser version of the MMStudio M6 Lite+ (Hall Effect) keyboard control software. Runs in the browser over WebHID — no installation, with the same feature set as the Electron desktop app ([M6-Lite-Control](https://github.com/fxckthiswrld/M6-Lite-Control)).

## Features

- **Hall Effect** — actuation point and Rapid Trigger per switch, for groups and the whole profile (M1/M2), profile export/import as JSON.
- **Programming** — Remap, Media, HotKey, Modify, Layer, DKS, Snap Tap / SOCD, key resets.
- **Calibration** — range readback, full-key and selected-key calibration, live progress.
- **Lighting**
  - Back Light — effects (Normal, Breath, Gradient, Stream, Star, Roll), speed, direction, custom colour;
  - Under Light — effects, brightness, colour, sync;
  - **Single Light** — custom colour and brightness for individual keys and groups: click keys on the layout, pick a colour, press **Apply**.
- **Device settings** — performance modes, Highlight, firmware auto calibration, auto light off (1–30 minutes), Saturation R/G/B.
- Keyboard tester and device memory dump saving.

## Requirements

- Windows and a Chromium-based browser with WebHID: **Chrome** or **Edge** (Firefox and Safari are not supported).
- Node.js 20+ for the local server.
- An M6 Lite+ keyboard connected over USB directly (no hubs or extension cables).

## Running

```bash
npm install
npm start
```

Open `http://localhost:4173`, press **Connect keyboard** and pick the M6 Lite+ in the browser prompt. WebHID works on `localhost` without HTTPS; hosting on a public domain requires HTTPS.

The port can be changed with the `PORT` environment variable.

## Using Single Light

1. Open **Lighting Effect → Single**.
2. Click keys on the layout to select them (multiple keys are supported).
3. Pick a colour in the picker (slider, palette — whatever is convenient) and press **Apply color to selected keys**. The Single Light layer switches on automatically and the selection clears after applying.
4. **Turn off Single Light for selected keys** disables Single Light for the chosen keys.

The colour you picked stays in the picker when you re-select keys; you can repeat the apply for different groups.

## Good to know

- Before changing anything the app reads the full device state and verifies every write by readback; on failure the original values are restored.
- A `Saving to device memory did not confirm: SAVE_END` warning means the keyboard did not acknowledge the persistence write — the applied colour works until USB disconnect. This is a firmware limitation and does not affect applying colours.
- Close the desktop app while using the browser version: two programs talking to the keyboard at once can interfere with write acknowledgements.
- EQ lighting is desktop-only.

## Project layout

```
src/   — protocol logic (browser-adapter.cjs and modules: HE, programming, calibration, lighting, device memory)
web/   — UI and server (server.mjs, renderer.js, ui-bridge.js, bundled browser-backend.js)
```

The server (`web/server.mjs`) only serves static files — all device work happens in the browser over WebHID.

## Development and tests

```bash
npm test                # 45 protocol and logic tests
npm run build:browser   # rebuild web/browser-backend.js after changing src/
```

Changes to `web/*.js` need no build step — files are served from disk, just refresh the page.

## Related

Desktop (Electron) version and shared protocol notes: [M6-Lite-Control](https://github.com/fxckthiswrld/M6-Lite-Control).
