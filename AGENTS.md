# Platinum Web Agent Guide

This repository is for a mobile-first Nintendo DS browser shell tuned around `Pokemon Platinum`, built on vendored `ds-anywhere` runtime assets.

## Working Assumptions

- Current emulator runtime is vendored under `public/static/`; rebuilding it from source is a follow-up task, not a baseline requirement.
- The app is intentionally PWA-first and phone-first. Changes should be verified in a narrow viewport, not only desktop.

## Core Commands

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Important Files

- `src/App.tsx`
  Product shell, launch mode picker, UI state for control tuning, cached-ROM actions.
- `src/hooks/useEmulator.ts`
  Runtime lifecycle, ROM boot logic, bundled-ROM fetch/randomizer flow, save import/export, cached-ROM resume/forget logic.
- `src/lib/emulator.ts`
  Runtime helpers, IDBFS sync, ROM validation, virtual filesystem helpers, remembered-ROM metadata.
- `src/lib/randomizer.ts`
  Browser-side Universal Pokemon Randomizer bridge and preset definitions.
- `src/index.css`
  Full visual system and mobile layout.
- `docs/implementation-plan.md`
  Architecture rationale and scope.
- `docs/task-list.md`
  Long-running checklist and explicit untested areas.

## Current Behavior

- On first load, the app prepares storage and lets the user choose a launch mode instead of auto-booting immediately.
- `Play Vanilla` downloads the bundled `Pokemon Platinum` ROM from Cloudflare, boots it, and caches it on-device for resume.
- Randomizer launch buttons are intended to generate a fresh bundled Platinum ROM in-browser before boot.
- ROMs can be imported from file input.
- Imported ROMs are cached in IndexedDB-backed `/roms` storage for later resume on the same device.
- Saves live in `/savefiles` and can be exported/imported manually.
- Bottom-screen input uses an app-side pointer bridge instead of the runtime’s older mouse/touch listeners.
- The D-pad supports drag retargeting, so one touch can slide between directions without lifting.
- Keyboard controls support two layouts simultaneously:
  - D-pad: arrows or `W` `A` `S` `D`
  - A / B: `J` / `K`
  - X / Y: `I` / `U`
  - L / R: `Q` / `E`
  - Start: `Enter`
  - Select: `Shift`

## Testing Notes

- For real-ROM local testing, a dev-only URL loader exists:
  - `/?romUrl=/roms/pokemon-platinum.nds&romName=pokemon-platinum.nds`
  - this assumes the ROM is being served locally by the developer; do not commit a `public/roms` symlink or copied local assets
- Real Platinum boot/input has been validated in-browser.
- Still explicitly unverified enough to keep on the todo list:
  - randomized Platinum generation and boot path
  - real save creation plus `.sav` round-trip
  - physical iPhone and Android testing
  - battery/thermal behavior
  - offline/background resume behavior
  - longer-session UX polish

## Repo Hygiene

- Do not commit `roms/`, screenshots, `.sav`, or local device artifacts.
- Keep `AGENTS.md` as the canonical project guide.
- `CLAUDE.md` and `README.md` should remain symlinks to `AGENTS.md`.

## Publish Path

- Static deployment target is GitHub Pages.
- Workflow lives under `.github/workflows/pages.yml`.
- Before publishing, confirm:
  - repo remote is set
  - Pages is enabled for GitHub Actions
  - no local-only assets are tracked
