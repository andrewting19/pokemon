# Platinum Web Implementation Plan

## Product Goal

Build a mobile-first browser app that makes a legally dumped copy of `Pokemon Platinum` comfortable to play on a phone without bundling copyrighted ROM data. The app should behave like an installable web app, run fully client-side, and prioritize reliability for long play sessions.

## Why This Architecture

We are not porting the game. We are building a web shell around a browser-compatible Nintendo DS emulator runtime.

- Emulator core: vendor the published `ds-anywhere` runtime assets (`wasmemulator.js`, `wasmemulator.wasm`, `webmelon.js`) locally for reproducible builds and offline caching.
- Frontend stack: `Vite + React + TypeScript` to keep iteration fast while giving us enough structure for emulator state, controls, save UX, and PWA support.
- Storage model:
  - ROMs are user-supplied through the browser file picker and loaded into the virtual filesystem at runtime.
  - Save files are persisted in `IndexedDB` via the emulator's `IDBFS` bridge.
  - Save export/import is handled manually so users can back up progress outside browser storage.
- Delivery: PWA-enabled build so the app is installable on phone home screens and can keep emulator assets available offline.

## Emulator Decision

The key choice was between:

- `desmume-wasm`: explicitly phone-oriented and especially tuned for iOS.
- `ds-anywhere`: cleaner JavaScript bridge, more modern TypeScript-friendly frontend surface, explicit canvas APIs, storage hooks, and published browser artifacts.

For this project, `ds-anywhere` is the better implementation target because:

- it gives us a practical integration API instead of requiring a large amount of low-level glue;
- it already handles canvas rendering, audio, IndexedDB-backed storage mounts, and screen touch events;
- its published artifacts let us ship a working product now and revisit source builds of the core later if we need deeper emulator changes.

## Scope

### In Scope

- Mobile-first DS player shell
- User ROM import
- Two-screen layout optimized for phone portrait and landscape
- On-screen controls for standard DS buttons
- Bottom-screen touch interaction
- Pause, resume, fast-forward
- Save persistence and save export/import
- Installable PWA
- Legal-safe messaging around user-supplied dumps only

### Out of Scope for Initial Completion

- Netplay
- Cheats
- Cloud sync
- Rebindable touch layout editor
- Native filesystem sync across devices
- Building the emulator core from source inside this repo

## UI Direction

The UI should feel like a portable field kit rather than a generic emulator dashboard.

- Visual language: instrument panel, glass overlays, brushed metal, map-light glow
- Typography: technical display face for labels, cleaner humanist sans for body text
- Layout intent:
  - the play surface stays visually dominant;
  - controls remain reachable by thumbs;
  - the bottom screen can be promoted for stylus-heavy moments;
  - system actions stay one gesture away, not buried.

## Technical Plan

### 1. Shell Setup

- Scaffold Vite React TypeScript app
- Add PWA support
- Vendor emulator runtime assets into `public/static`
- Load the runtime through global scripts from `index.html`

### 2. Emulator Adapter

- Wrap `window.WebMelon` access in a typed adapter
- Prepare the virtual filesystem once the runtime is ready
- Standardize ROM pathing and save path naming
- Surface save lifecycle events to React state

### 3. Playback Experience

- Build a fixed dual-canvas stage
- Start emulation only after a user gesture and ROM load
- Add pause/resume and fast-forward actions
- Support swapping which screen is visually prioritized

### 4. Mobile Controls

- Thumb-friendly D-pad cluster
- A/B/X/Y cluster
- Start/Select/L/R utility buttons
- Pointer-safe press/release handling
- Touch stays bound to the bottom screen canvas

### 5. Persistence and Recovery

- Rely on emulator auto-save detection for normal save behavior
- Provide manual `.sav` export/import
- Show visible save-state status so users trust persistence
- Document browser-storage risk and recommended backup workflow

### 6. Verification

- Build and lint locally
- Run the app in Playwright with a phone-sized viewport
- Verify runtime loading, storage initialization, and mobile layout behavior
- Verify import/export workflows with synthetic save data when game validation is not possible

## Risks and Mitigations

### iPhone Safari Audio Gating

Risk: audio contexts stay suspended until a trusted gesture.

Mitigation: start emulation from an explicit user action and force an audio context resume during that flow.

### Browser Storage Eviction

Risk: local save data can still be lost if the browser clears site storage.

Mitigation: surface save banners and provide manual save export/import.

### Emulator Core Coupling

Risk: some control features require access to `WebMelon` internals not exposed in the public typings.

Mitigation: isolate those accesses in one adapter module so we can swap them if the runtime changes.

### Full Game Validation

Risk: we cannot bundle commercial ROMs for testing.

Mitigation: validate runtime boot, stage rendering, save filesystem behavior, and ROM import pathing separately; leave live game validation to user-supplied dumps.

## Exit Criteria

The project is complete when:

- the app builds cleanly;
- the runtime loads locally from vendored assets;
- a user can import a DS ROM and boot the emulator;
- on-screen controls work for normal gameplay input;
- bottom-screen touch interaction works;
- save files persist and can be exported/imported;
- the app is installable as a PWA and usable in a phone-sized viewport.
