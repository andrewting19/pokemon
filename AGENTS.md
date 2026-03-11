# Platinum Web Agent Guide

This repository is for a mobile-first Nintendo DS browser shell tuned around `Pokemon Platinum`, built on vendored `ds-anywhere` runtime assets.

## Working Assumptions

- Do not add or distribute copyrighted ROMs, BIOS files, or download links.
- User-supplied ROMs are the only acceptable cartridge source.
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
  Product shell, launch flow, UI state for control tuning, cached-ROM actions.
- `src/hooks/useEmulator.ts`
  Runtime lifecycle, ROM boot logic, pointer bridge, save import/export, cached-ROM resume/forget logic.
- `src/lib/emulator.ts`
  Runtime helpers, IDBFS sync, ROM validation, virtual filesystem helpers, remembered-ROM metadata.
- `src/index.css`
  Full visual system and mobile layout.
- `docs/implementation-plan.md`
  Architecture rationale and scope.
- `docs/task-list.md`
  Long-running checklist and explicit untested areas.

## Current Behavior

- ROMs can be imported from file input.
- Imported ROMs are cached in IndexedDB-backed `/roms` storage for later resume on the same device.
- Saves live in `/savefiles` and can be exported/imported manually.
- Bottom-screen input uses an app-side pointer bridge instead of the runtime’s older mouse/touch listeners.
- Keyboard defaults are remapped for sanity:
  - arrows = D-pad
  - `Z` = A
  - `X` = B
  - `A` = Y
  - `S` = X
  - `Q` / `W` = L / R
  - `Enter` = Start
  - `Shift` = Select

## Testing Notes

- For real-ROM local testing, a dev-only URL loader exists:
  - `/?romUrl=/roms/pokemon-platinum.nds&romName=pokemon-platinum.nds`
- Real Platinum boot/input has been validated in-browser.
- Still explicitly unverified enough to keep on the todo list:
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
  - no ROMs or local artifacts are tracked
